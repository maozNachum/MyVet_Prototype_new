import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { redactText } from "../_shared/privacy.ts";
import { asAiGatewayError, AiGatewayError } from "../_shared/ai/errors.ts";
import { getEmbeddingConfiguration } from "../_shared/ai/config.ts";
import { isAiCapabilityEnabled } from "../_shared/ai/featureFlags.ts";
import { runRagAnswerGateway, runRagEmbeddingGateway, runtimeEnv, telemetryFromError } from "../_shared/ai/gateway.ts";

type Action = "status" | "index" | "ask";
type RequestBody = { action: Action; petId: number; question?: string };
type RagStatus = {
  clinic_id: string;
  actor_kind: "staff" | "owner";
  actor_role: string;
  can_index: boolean;
  can_query: boolean;
  indexed_chunks: number;
};
type RagSource = {
  clinic_id: string;
  owner_id: string;
  pet_id: number;
  source_type: string;
  source_record_id: string;
  source_date: string | null;
  source_title: string;
  source_content: string;
  release_to_client: boolean;
};
type SearchResult = {
  chunk_id: string;
  source_type: string;
  source_record_id: string;
  source_date: string | null;
  source_title: string;
  content: string;
  similarity: number;
};

const MAX_REQUEST_BYTES = 8_000;
const SOURCE_LABELS: Record<string, string> = {
  medical_visit: "ביקור רפואי",
  vaccination: "חיסון",
  lab_result: "תוצאת מעבדה",
  medical_document: "מסמך רפואי",
  approved_visit_summary: "סיכום ביקור מאושר",
  digitalcare_summary: "סיכום DigitalCare מאושר",
  document_extraction: "תוכן מסמך מאושר",
};
const INJECTION_PATTERNS = [
  /system\s*prompt|developer\s*message|ignore\s+(all|previous)|reveal\s+(secret|prompt)/i,
  /פרומפט\s*(מערכת|סודי)|הוראות\s*(מערכת|מפתח)|חשוף\s*(סוד|מפתח|פרומפט)/i,
  /api[_ -]?key|service[_ -]?role|supabase_service_role/i,
  /תיק\s+(של|אחר)|מטופל\s+אחר|מרפאה\s+אחרת/i,
];

function json(request: Request, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function validateBody(value: unknown): RequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["action", "petId", "question"].includes(key))
    || !["status", "index", "ask"].includes(String(body.action))
    || typeof body.petId !== "number" || !Number.isSafeInteger(body.petId) || body.petId <= 0) {
    throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  if (body.action === "ask" && (typeof body.question !== "string"
    || !body.question.trim() || body.question.length > 1_200)) {
    throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  return { action: body.action as Action, petId: body.petId, question: body.question as string | undefined };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function chunkText(value: string, maximum = 1_800, overlap = 180) {
  const normalized = value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length && chunks.length < 24) {
    let end = Math.min(start + maximum, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf("\n", end), normalized.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(maximum * 0.55)) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactKnownNames(value: string, names: string[]) {
  return names.reduce((current, name) => {
    const normalized = name.trim();
    return normalized.length >= 2
      ? current.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(normalized)}(?![\\p{L}\\p{N}])`, "giu"), "[NAME_REMOVED]")
      : current;
  }, value);
}

function sanitizeUntrustedSource(value: string, names: string[]) {
  const minimized = redactText(redactKnownNames(value, names));
  return minimized
    .split(/\r?\n/)
    .filter((line) => !INJECTION_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .trim();
}

async function loadStatus(admin: SupabaseClient, actorId: string, petId: number) {
  const { data, error } = await admin.rpc("myvet_rag_status", {
    requested_actor_user_id: actorId,
    requested_pet_id: petId,
  });
  if (error || !Array.isArray(data) || !data[0]) {
    throw new AiGatewayError("RAG_ACCESS_DENIED", { httpStatus: 403 });
  }
  return data[0] as RagStatus;
}

async function loadPrivateNames(admin: SupabaseClient, status: RagStatus, petId: number) {
  const { data: pet } = await admin.from("patients")
    .select("pet_name,owner_id")
    .eq("clinic_id", status.clinic_id)
    .eq("pet_id", petId)
    .maybeSingle();
  if (!pet) return [];
  const { data: owner } = await admin.from("owners")
    .select("owner_first_name,owner_last_name")
    .eq("clinic_id", status.clinic_id)
    .eq("owner_id", pet.owner_id)
    .maybeSingle();
  return [...new Set([
    String(pet.pet_name || ""),
    String(owner?.owner_first_name || ""),
    String(owner?.owner_last_name || ""),
    `${String(owner?.owner_first_name || "")} ${String(owner?.owner_last_name || "")}`.trim(),
  ].filter((name) => name.trim().length >= 2))];
}

async function recordEvent(
  admin: SupabaseClient,
  actorId: string,
  petId: number,
  requestId: string,
  eventType: string,
  outcome: "success" | "failed" | "blocked",
  telemetry?: Record<string, unknown>,
  errorCode?: string,
) {
  await admin.rpc("myvet_record_rag_event", {
    requested_actor_user_id: actorId,
    requested_pet_id: petId,
    requested_request_id: requestId,
    requested_event_type: eventType,
    requested_outcome: outcome,
    requested_provider: telemetry?.provider ?? null,
    requested_model: telemetry?.model ?? null,
    requested_prompt_version: telemetry?.promptVersion ?? null,
    requested_latency_ms: telemetry?.latencyMs ?? null,
    requested_input_tokens: (telemetry?.usage as Record<string, unknown> | undefined)?.inputTokens ?? null,
    requested_output_tokens: (telemetry?.usage as Record<string, unknown> | undefined)?.outputTokens ?? null,
    requested_error_code: errorCode ?? null,
  });
}

async function sourceAlreadyIndexed(
  admin: SupabaseClient,
  source: RagSource,
  chunkHashes: string[],
  provider: string,
  model: string,
  version: string,
) {
  const { data: chunks, error } = await admin.from("ai_document_chunks")
    .select("chunk_id,chunk_index,content_hash")
    .eq("clinic_id", source.clinic_id)
    .eq("pet_id", source.pet_id)
    .eq("source_type", source.source_type)
    .eq("source_record_id", source.source_record_id)
    .eq("status", "ready")
    .order("chunk_index");
  if (error || !Array.isArray(chunks) || chunks.length !== chunkHashes.length
    || chunks.some((chunk, index) => chunk.chunk_index !== index || chunk.content_hash !== chunkHashes[index])) {
    return false;
  }
  const chunkIds = chunks.map((chunk) => chunk.chunk_id);
  const { count, error: embeddingError } = await admin.from("ai_document_embeddings")
    .select("embedding_id", { count: "exact", head: true })
    .eq("clinic_id", source.clinic_id)
    .in("chunk_id", chunkIds)
    .eq("provider", provider)
    .eq("model_version", model)
    .eq("embedding_version", version)
    .eq("status", "ready");
  return !embeddingError && count === chunkHashes.length;
}

async function syncIndex(admin: SupabaseClient, actorId: string, petId: number, privateNames: string[]) {
  if (!isAiCapabilityEnabled("rag.index", runtimeEnv)) {
    throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
  }
  const config = getEmbeddingConfiguration(runtimeEnv);
  const { data, error } = await admin.rpc("myvet_rag_collect_sources", {
    requested_actor_user_id: actorId,
    requested_pet_id: petId,
  });
  if (error) throw new AiGatewayError("RAG_INDEX_UNAVAILABLE", { httpStatus: 503, retryable: true });
  const sources = ((Array.isArray(data) ? data : []) as RagSource[])
    .sort((left, right) => String(right.source_date || "").localeCompare(String(left.source_date || "")));
  let changedSources = 0;
  let storedChunks = 0;
  let generatedChunks = 0;
  const deadline = Date.now() + 22_000;

  for (const source of sources.slice(0, 120)) {
    const rawSourceContent = String(source.source_content || "");
    const sourceFingerprint = await sha256(rawSourceContent);
    const parts = chunkText(rawSourceContent, 850, 100)
      .map((part) => sanitizeUntrustedSource(part, privateNames))
      .filter(Boolean)
      .slice(0, config.maxChunksPerSource);
    if (parts.length === 0) continue;
    const hashes = await Promise.all(parts.map(sha256));
    if (await sourceAlreadyIndexed(admin, source, hashes, config.provider, config.model, config.version)) continue;
    if (changedSources >= 12 || generatedChunks + parts.length > 48 || Date.now() >= deadline) break;
    const embedded = [];
    for (let index = 0; index < parts.length; index += 1) {
      const result = await runRagEmbeddingGateway(actorId, parts[index], "retrieval_document");
      embedded.push({
        chunk_index: index,
        content: parts[index],
        content_hash: hashes[index],
        embedding_hash: await sha256(result.embedding.map((value) => value.toFixed(8)).join(",")),
        embedding: result.embedding,
      });
      generatedChunks += 1;
    }
    const { data: stored, error: storeError } = await admin.rpc("myvet_replace_rag_source", {
      requested_actor_user_id: actorId,
      requested_pet_id: petId,
      requested_source_type: source.source_type,
      requested_source_record_id: source.source_record_id,
      requested_source_fingerprint: sourceFingerprint,
      requested_provider: config.provider,
      requested_model: config.model,
      requested_embedding_version: config.version,
      requested_chunks: embedded,
    });
    if (storeError) throw new AiGatewayError("RAG_INDEX_UNAVAILABLE", { httpStatus: 503, retryable: true });
    if (Array.isArray(stored) && stored[0]?.changed) changedSources += 1;
    storedChunks += Number(Array.isArray(stored) ? stored[0]?.stored_chunks || 0 : 0);
  }
  return { sourceCount: sources.length, changedSources, storedChunks };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BYTES) {
    return json(request, { error: "AI_INPUT_INVALID" }, 413);
  }
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(request, { error: "UNAUTHORIZED" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json(request, { error: "AI_CONFIGURATION_ERROR" }, 503);
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(request, { error: "UNAUTHORIZED" }, 401);

  let body: RequestBody;
  try {
    body = validateBody(JSON.parse(rawBody));
  } catch (error) {
    const safe = asAiGatewayError(error);
    return json(request, { error: safe.code }, safe.httpStatus);
  }

  const auditRequestId = crypto.randomUUID();
  try {
    const status = await loadStatus(admin, authData.user.id, body.petId);
    const privateNames = await loadPrivateNames(admin, status, body.petId);
    if (body.action === "status") {
      return json(request, {
        actorKind: status.actor_kind,
        actorRole: status.actor_role,
        canIndex: status.can_index && isAiCapabilityEnabled("rag.index", runtimeEnv),
        canQuery: status.can_query && isAiCapabilityEnabled("rag.answer", runtimeEnv),
        indexedChunks: Number(status.indexed_chunks || 0),
      });
    }
    if (body.action === "index") {
      if (!status.can_index || status.actor_kind !== "staff") {
        throw new AiGatewayError("RAG_ACCESS_DENIED", { httpStatus: 403 });
      }
      await recordEvent(admin, authData.user.id, body.petId, auditRequestId, "index_started", "success");
      const result = await syncIndex(admin, authData.user.id, body.petId, privateNames);
      await recordEvent(admin, authData.user.id, body.petId, auditRequestId, "index_completed", "success");
      return json(request, result);
    }
    if (!status.can_query || !isAiCapabilityEnabled("rag.answer", runtimeEnv)) {
      throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    }

    const question = body.question!.trim();
    if (INJECTION_PATTERNS.some((pattern) => pattern.test(question))) {
      await recordEvent(admin, authData.user.id, body.petId, auditRequestId, "suspicious_request", "blocked", undefined, "RAG_SUSPICIOUS_REQUEST");
      return json(request, { error: "RAG_REQUEST_BLOCKED" }, 400);
    }

    // Staff requests refresh changed sources first. A provider failure does not
    // remove previously valid vectors and never falls back to an ungrounded answer.
    if (status.can_index && status.actor_kind === "staff") {
      try { await syncIndex(admin, authData.user.id, body.petId, privateNames); } catch { /* search valid existing rows only */ }
    }
    const minimizedQuestion = redactText(redactKnownNames(question, privateNames));
    const embeddingResult = await runRagEmbeddingGateway(authData.user.id, minimizedQuestion, "retrieval_query");
    const config = embeddingResult.configuration;
    const { data: matches, error: searchError } = await admin.rpc("myvet_rag_search", {
      requested_actor_user_id: authData.user.id,
      requested_pet_id: body.petId,
      requested_query_embedding: JSON.stringify(embeddingResult.embedding),
      requested_provider: config.provider,
      requested_model: config.model,
      requested_embedding_version: config.version,
      requested_match_threshold: config.minimumSimilarity,
      requested_match_count: config.maxResults,
    });
    if (searchError) throw new AiGatewayError("RAG_SEARCH_UNAVAILABLE", { httpStatus: 503, retryable: true });
    const retrieved = (Array.isArray(matches) ? matches : []) as SearchResult[];
    if (retrieved.length === 0) {
      await recordEvent(admin, authData.user.id, body.petId, auditRequestId, "rag_no_results", "success", embeddingResult.telemetry as unknown as Record<string, unknown>);
      return json(request, {
        status: "insufficient",
        answer: "אין מספיק מידע מאושר בתיק הרפואי כדי לענות על השאלה הזו.",
        sources: [],
      });
    }

    const safeRetrieved = retrieved
      .map((source) => ({ ...source, content: sanitizeUntrustedSource(source.content, privateNames).slice(0, 3_000) }))
      .filter((source) => source.content.length > 0);
    if (safeRetrieved.length === 0) {
      await recordEvent(admin, authData.user.id, body.petId, auditRequestId, "rag_no_results", "blocked",
        embeddingResult.telemetry as unknown as Record<string, unknown>, "RAG_SUSPICIOUS_SOURCE");
      return json(request, {
        status: "insufficient",
        answer: "אין מספיק מידע מאושר בתיק הרפואי כדי לענות על השאלה הזו.",
        sources: [],
      });
    }
    const ephemeralSources = safeRetrieved.map((source, index) => ({
      chunkId: `S${index + 1}`,
      sourceType: source.source_type,
      sourceDate: source.source_date,
      sourceTitle: SOURCE_LABELS[source.source_type] || "רשומה רפואית",
      content: source.content,
    }));
    const answerResult = await runRagAnswerGateway({
      actorId: authData.user.id,
      question: minimizedQuestion,
      sources: ephemeralSources,
    });
    const usedIndexes = answerResult.output.usedSourceIds
      .map((sourceId) => Number(sourceId.slice(1)) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0 && index < safeRetrieved.length);
    const sources = usedIndexes.map((index) => ({
      type: safeRetrieved[index].source_type,
      typeLabel: SOURCE_LABELS[safeRetrieved[index].source_type] || "רשומה רפואית",
      date: safeRetrieved[index].source_date,
      title: safeRetrieved[index].source_title,
      route: `/patients?selected=${body.petId}`,
    }));
    await recordEvent(admin, authData.user.id, body.petId, answerResult.telemetry.requestId,
      answerResult.output.status === "insufficient" ? "rag_no_results" : "rag_query_completed",
      "success", answerResult.telemetry as unknown as Record<string, unknown>);
    return json(request, { status: answerResult.output.status, answer: answerResult.output.answer, sources });
  } catch (error) {
    const safe = asAiGatewayError(error);
    const telemetry = telemetryFromError(error) as unknown as Record<string, unknown> | undefined;
    const eventType = body.action === "index" ? "index_failed" : safe.code === "AI_FEATURE_DISABLED" ? "feature_disabled" : "provider_failed";
    await recordEvent(admin, authData.user.id, body.petId, auditRequestId, eventType, safe.code === "AI_FEATURE_DISABLED" ? "blocked" : "failed", telemetry, safe.code);
    console.error("Medical record RAG request failed", { action: body.action, code: safe.code });
    const retryHeaders: Record<string, string> = safe.retryAfterSeconds
      ? { "Retry-After": String(safe.retryAfterSeconds) }
      : {};
    return json(request, { error: safe.code }, safe.httpStatus, retryHeaders);
  }
});
