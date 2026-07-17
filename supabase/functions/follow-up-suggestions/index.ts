import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { AiGatewayError, asAiGatewayError } from "../_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../_shared/ai/featureFlags.ts";
import { runFollowUpSuggestionGateway, runtimeEnv } from "../_shared/ai/gateway.ts";
import type { ValidatedFollowUpSuggestion } from "../_shared/ai/schemas.ts";

type Action = "load" | "generate" | "start_manual" | "save" | "approve" | "reject";
type Body = { action: Action; visitId?: number; artifactId?: string; content?: ValidatedFollowUpSuggestion; rejectionReason?: string; duplicateConfirmed?: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function validateContent(value: unknown): ValidatedFollowUpSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const row = value as Record<string, unknown>;
  const fields = ["reminder_type","title","description","scheduled_at","target_type","requires_manual_date","release_to_client","confidence","source_text","date_expression"];
  if (Object.keys(row).some((key) => !fields.includes(key))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (!["return_visit","future_vaccination","general_follow_up"].includes(String(row.reminder_type))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (typeof row.title !== "string" || row.title.trim().length < 2 || row.title.length > 120) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (typeof row.description !== "string" || row.description.trim().length < 2 || row.description.length > 1200) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (!["staff","owner"].includes(String(row.target_type)) || typeof row.release_to_client !== "boolean" || row.release_to_client !== (row.target_type === "owner")) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (typeof row.requires_manual_date !== "boolean" || !["low","medium","high"].includes(String(row.confidence))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (row.scheduled_at !== null && (typeof row.scheduled_at !== "string" || Number.isNaN(Date.parse(row.scheduled_at)))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (row.requires_manual_date !== (row.scheduled_at === null)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  return { ...row, source_text: typeof row.source_text === "string" ? row.source_text : "", date_expression: typeof row.date_expression === "string" ? row.date_expression : "" } as ValidatedFollowUpSuggestion;
}

function validateBody(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const input = value as Record<string, unknown>;
  const allowed = new Set(["action","visitId","artifactId","content","rejectionReason","duplicateConfirmed"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const action = String(input.action) as Action;
  if (!["load","generate","start_manual","save","approve","reject"].includes(action)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (["load","generate","start_manual"].includes(action) && (!Number.isSafeInteger(input.visitId) || Number(input.visitId) <= 0)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (["save","approve","reject"].includes(action) && (typeof input.artifactId !== "string" || !UUID.test(input.artifactId))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const content = ["save","approve"].includes(action) ? validateContent(input.content) : undefined;
  if (input.rejectionReason !== undefined && (typeof input.rejectionReason !== "string" || input.rejectionReason.length > 500)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (input.duplicateConfirmed !== undefined && typeof input.duplicateConfirmed !== "boolean") throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  return { action, visitId: input.visitId as number | undefined, artifactId: input.artifactId as string | undefined, content, rejectionReason: input.rejectionReason as string | undefined, duplicateConfirmed: input.duplicateConfirmed as boolean | undefined };
}

async function requireApprovedVisitSource(client: SupabaseClient, userId: string, visitId: number) {
  const { data: visit } = await client.from("medical_visits").select("clinic_id,visit_id,pet_id,visit_date").eq("visit_id", visitId).maybeSingle();
  if (!visit) throw new AiGatewayError("FOLLOW_UP_ACCESS_DENIED", { httpStatus: 403 });
  const { data: staff } = await client.from("staff").select("staff_id").eq("auth_user_id", userId).eq("clinic_id", visit.clinic_id).eq("role", "vet").eq("is_active", true).maybeSingle();
  if (!staff) throw new AiGatewayError("FOLLOW_UP_ACCESS_DENIED", { httpStatus: 403 });
  const { data: source } = await client.from("ai_artifacts").select("artifact_id,content,approved_at,version_number")
    .eq("visit_id", visitId).eq("artifact_type", "visit_summary").eq("status", "approved").is("deleted_at", null)
    .order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (!source) throw new AiGatewayError("FOLLOW_UP_APPROVED_SOURCE_REQUIRED", { httpStatus: 409 });
  return { visit, source };
}

async function loadState(admin: SupabaseClient, sourceArtifactId: string) {
  const { data: links, error: linkError } = await admin.from("ai_sources").select("artifact_id").eq("source_type", "ai_artifact").eq("source_record_id", sourceArtifactId);
  if (linkError) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
  const ids = (links || []).map((row) => row.artifact_id);
  if (ids.length === 0) return { suggestions: [], approvedReminderIds: [] };
  const { data: rows, error } = await admin.from("ai_artifacts")
    .select("artifact_id,status,content,version_number,model_version,created_at,updated_at")
    .in("artifact_id", ids).eq("artifact_type", "reminder_suggestion").is("deleted_at", null).order("version_number", { ascending: false });
  if (error) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
  const latestByType = new Map<string, unknown>();
  for (const row of rows || []) {
    const reminderType = (row.content as { reminder_type?: string } | null)?.reminder_type || row.artifact_id;
    if (!latestByType.has(reminderType)) latestByType.set(reminderType, row);
  }
  return { suggestions: [...latestByType.values()] };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(request, { error: "UNAUTHORIZED" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 35_000) return json(request, { error: "AI_INPUT_INVALID" }, 413);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !service) return json(request, { error: "SERVICE_UNAVAILABLE" }, 503);
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return json(request, { error: "UNAUTHORIZED" }, 401);
  let body: Body;
  try { body = validateBody(JSON.parse(raw)); } catch (error) { const safe = asAiGatewayError(error); return json(request, { error: safe.code }, safe.httpStatus); }

  try {
    let visitId = body.visitId;
    if (!visitId && body.artifactId) {
      const { data } = await client.from("ai_artifacts").select("visit_id").eq("artifact_id", body.artifactId).eq("artifact_type", "reminder_suggestion").maybeSingle();
      visitId = Number(data?.visit_id || 0);
    }
    if (!visitId) throw new AiGatewayError("FOLLOW_UP_ACCESS_DENIED", { httpStatus: 403 });
    const { visit, source } = await requireApprovedVisitSource(client, auth.user.id, visitId);
    if (body.action === "load") return json(request, await loadState(admin, source.artifact_id));
    if (!isAiCapabilityEnabled("follow-up.suggest", runtimeEnv)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    const { data: clinicFlag } = await admin.from("ai_feature_flags").select("enabled,kill_switch").eq("clinic_id", visit.clinic_id).eq("capability", "reminder_suggestion").maybeSingle();
    if (clinicFlag && (!clinicFlag.enabled || clinicFlag.kill_switch)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });

    if (body.action === "generate" || body.action === "start_manual") {
      const generated = body.action === "generate";
      const result = generated ? await runFollowUpSuggestionGateway({ actorId: auth.user.id, approvedSummary: source.content, sourceDate: String(visit.visit_date).slice(0, 10) }) : null;
      const suggestions: ValidatedFollowUpSuggestion[] = result?.output || [{
        reminder_type: "general_follow_up", title: "מעקב רפואי", description: "מעקב ידני לפי החלטת הווטרינר",
        scheduled_at: null, target_type: "staff", requires_manual_date: true, release_to_client: false,
        confidence: "high", source_text: "", date_expression: "",
      }];
      const created = [];
      for (const suggestion of suggestions) {
        const telemetry = result?.telemetry;
        const storedContent = { ...suggestion } as Record<string, unknown>;
        delete storedContent.source_text; delete storedContent.date_expression;
        const { data, error } = await admin.rpc("myvet_create_follow_up_suggestion_draft", {
          requested_actor_user_id: auth.user.id, requested_source_type: "ai_artifact", requested_source_id: source.artifact_id,
          requested_content: storedContent, requested_request_id: crypto.randomUUID(), requested_provider: telemetry?.provider || "manual",
          requested_model_version: telemetry?.model || "manual", requested_prompt_version: telemetry?.promptVersion || "manual-v1",
          requested_latency_ms: telemetry?.latencyMs || 0, requested_input_tokens: telemetry?.usage.inputTokens ?? 0,
          requested_output_tokens: telemetry?.usage.outputTokens ?? 0, requested_generated_by_ai: generated,
        });
        if (error || !data?.[0]) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
        created.push(data[0]);
      }
      return json(request, { ...(await loadState(admin, source.artifact_id)), created, noSuggestions: suggestions.length === 0 });
    }

    const { data: transitioned, error } = await client.rpc("myvet_transition_follow_up_suggestion", {
      requested_artifact_id: body.artifactId, requested_action: body.action, requested_content: body.content ? (() => { const value = { ...body.content } as Record<string, unknown>; delete value.source_text; delete value.date_expression; return value; })() : null,
      requested_rejection_reason: body.rejectionReason ?? null, requested_duplicate_confirmed: body.duplicateConfirmed ?? false,
    });
    if (error || !transitioned?.[0]) {
      const code = String(error?.message || "FOLLOW_UP_ACTION_FAILED").match(/[A-Z][A-Z0-9_]{2,80}/)?.[0] || "FOLLOW_UP_ACTION_FAILED";
      return json(request, { error: code }, code.includes("DATE_REQUIRED") || code.includes("INPUT") ? 400 : 403);
    }
    return json(request, { ...(await loadState(admin, source.artifact_id)), result: transitioned[0] });
  } catch (error) {
    const safe = asAiGatewayError(error);
    console.error("FOLLOW_UP_SUGGESTION_AUDIT", { action: body.action, outcome: "failed", errorCode: safe.code });
    return json(request, { error: safe.code }, safe.httpStatus);
  }
});
