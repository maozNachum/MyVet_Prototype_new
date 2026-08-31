import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { asAiGatewayError, AiGatewayError } from "../_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../_shared/ai/featureFlags.ts";
import { runVisitSummaryGateway, runtimeEnv, telemetryFromError } from "../_shared/ai/gateway.ts";
import { validateVisitSummaryOutput, type ValidatedVisitSummaryOutput } from "../_shared/ai/schemas.ts";

type Action = "load" | "generate" | "save" | "approve" | "reject";
type RequestBody = {
  action: Action;
  visitId?: number;
  artifactId?: string;
  content?: ValidatedVisitSummaryOutput;
  rejectionReason?: string;
};

const MAX_REQUEST_BYTES = 35_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(request: Request, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function validateBody(value: unknown): RequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const body = value as Record<string, unknown>;
  const allowed = new Set(["action", "visitId", "artifactId", "content", "rejectionReason"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (!["load", "generate", "save", "approve", "reject"].includes(String(body.action))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const action = body.action as Action;
  if ((action === "load" || action === "generate") && (typeof body.visitId !== "number" || !Number.isSafeInteger(body.visitId) || body.visitId <= 0)) {
    throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  if (["save", "approve", "reject"].includes(action) && (typeof body.artifactId !== "string" || !UUID.test(body.artifactId))) {
    throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  let content: ValidatedVisitSummaryOutput | undefined;
  if (action === "save" || action === "approve") content = validateVisitSummaryOutput(body.content);
  if (body.rejectionReason !== undefined && (typeof body.rejectionReason !== "string" || body.rejectionReason.length > 500)) {
    throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  return {
    action,
    visitId: body.visitId as number | undefined,
    artifactId: body.artifactId as string | undefined,
    content,
    rejectionReason: body.rejectionReason as string | undefined,
  };
}

async function requireVeterinarianForVisit(client: SupabaseClient, userId: string, visitId: number) {
  const { data: visit, error: visitError } = await client
    .from("medical_visits")
    .select("clinic_id,visit_id,pet_id,visit_date,reason,diagnosis,treatment,notes,visit_type,urgency_level,chief_complaint,final_diagnosis,follow_up_required,follow_up_notes,entry_data")
    .eq("visit_id", visitId)
    .maybeSingle();
  if (visitError || !visit) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 404 });
  const { data: staff } = await client
    .from("staff")
    .select("staff_id,clinic_id,role,is_active")
    .eq("auth_user_id", userId)
    .eq("clinic_id", visit.clinic_id)
    .eq("role", "vet")
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 403 });
  return { visit, staff };
}

function compactRows(rows: unknown[] | null, fields: string[]) {
  return (rows || []).slice(0, 40).map((row) => {
    const source = row as Record<string, unknown>;
    return Object.fromEntries(fields.flatMap((field) => {
      const value = source[field];
      if (value === null || value === undefined || value === "") return [];
      return [[field, typeof value === "string" ? value.slice(0, 900) : value]];
    }));
  });
}

async function buildVisitContext(client: SupabaseClient, visit: Record<string, unknown>) {
  const visitId = Number(visit.visit_id);
  const [exams, problems, diagnoses, prescriptions, labs] = await Promise.all([
    client.from("physical_exams").select("findings,exam_date").eq("visit_id", visitId).limit(20),
    client.from("medical_problems").select("problem_text,severity,status,notes").eq("visit_id", visitId).limit(30),
    client.from("differential_diagnoses").select("diagnosis_text,likelihood,notes").eq("visit_id", visitId).limit(30),
    client.from("prescriptions").select("medication,dosage,frequency,duration,start_date").eq("visit_id", visitId).limit(30),
    client.from("lab_orders").select("test_name,status,results,result_value,result_status,notes").eq("visit_id", visitId).limit(30),
  ]);
  const sourceError = [exams.error, problems.error, diagnoses.error, prescriptions.error, labs.error].find(Boolean);
  if (sourceError) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
  return {
    medical_visit: Object.fromEntries([
      "visit_date", "reason", "diagnosis", "treatment", "notes", "visit_type",
      "urgency_level", "chief_complaint", "final_diagnosis", "follow_up_required",
      "follow_up_notes", "entry_data",
    ].flatMap((field) => visit[field] === null || visit[field] === undefined || visit[field] === "" ? [] : [[field, visit[field]]])),
    physical_exam: compactRows(exams.data, ["findings", "exam_date"]),
    medical_problems: compactRows(problems.data, ["problem_text", "severity", "status", "notes"]),
    differential_diagnoses: compactRows(diagnoses.data, ["diagnosis_text", "likelihood", "notes"]),
    prescriptions: compactRows(prescriptions.data, ["medication", "dosage", "frequency", "duration", "start_date"]),
    lab_orders: compactRows(labs.data, ["test_name", "status", "results", "result_value", "result_status", "notes"]),
  };
}

async function loadSummaries(client: SupabaseClient, visitId: number) {
  const { data, error } = await client
    .from("ai_artifacts")
    .select("artifact_id,status,content,version_number,created_at,updated_at,approved_at")
    .eq("visit_id", visitId)
    .eq("artifact_type", "visit_summary")
    .is("deleted_at", null)
    .order("version_number", { ascending: false })
    .limit(30);
  if (error) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
  const rows = Array.isArray(data) ? data : [];
  return {
    editable: rows.find((row) => row.status === "draft" || row.status === "edited") || null,
    approved: rows.find((row) => row.status === "approved") || null,
    rejected: rows.find((row) => row.status === "rejected") || null,
    versionCount: rows.length,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BYTES) return json(request, { error: "AI_INPUT_INVALID" }, 413);
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(request, { error: "UNAUTHORIZED" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json(request, { error: "AI_CONFIGURATION_ERROR" }, 503);
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(request, { error: "UNAUTHORIZED" }, 401);

  let body: RequestBody;
  try {
    body = validateBody(JSON.parse(rawBody));
  } catch (error) {
    const safe = asAiGatewayError(error);
    return json(request, { error: safe.code }, safe.httpStatus);
  }

  try {
    let visitId = body.visitId;
    if (!visitId && body.artifactId) {
      const { data: artifact } = await client.from("ai_artifacts").select("visit_id").eq("artifact_id", body.artifactId).maybeSingle();
      visitId = Number(artifact?.visit_id || 0);
    }
    if (!visitId) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 404 });
    const { visit } = await requireVeterinarianForVisit(client, authData.user.id, visitId);

    if (body.action === "load") return json(request, await loadSummaries(client, visitId));

    if (body.action === "generate") {
      if (!isAiCapabilityEnabled("visit-summary.generate", runtimeEnv)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
      const { data: flag } = await admin.from("ai_feature_flags").select("enabled,kill_switch").eq("clinic_id", visit.clinic_id).eq("capability", "visit_summary").maybeSingle();
      if (flag && (!flag.enabled || flag.kill_switch)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
      const existing = await loadSummaries(client, visitId);
      if (existing.editable) return json(request, { ...existing, reusedDraft: true });

      const context = await buildVisitContext(client, visit as Record<string, unknown>);
      const result = await runVisitSummaryGateway({ actorId: authData.user.id, visitContext: context });
      const telemetry = result.telemetry;
      const { data: stored, error: storeError } = await admin.rpc("myvet_create_visit_summary_draft", {
        requested_actor_user_id: authData.user.id,
        requested_visit_id: visitId,
        requested_content: result.output,
        requested_request_id: telemetry.requestId,
        requested_provider: telemetry.provider,
        requested_model_version: telemetry.model,
        requested_prompt_version: telemetry.promptVersion,
        requested_latency_ms: telemetry.latencyMs,
        requested_input_tokens: telemetry.usage.inputTokens ?? null,
        requested_output_tokens: telemetry.usage.outputTokens ?? null,
      });
      if (storeError || !Array.isArray(stored) || !stored[0]) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
      return json(request, { ...(await loadSummaries(client, visitId)), editable: stored[0], reusedDraft: false });
    }

    const transitionAction = body.action === "save" ? "save" : body.action === "approve" ? "approve" : "reject";
    const { data: transitioned, error: transitionError } = await client.rpc("myvet_transition_visit_summary", {
      requested_artifact_id: body.artifactId,
      requested_action: transitionAction,
      requested_content: body.content ?? null,
      requested_rejection_reason: body.rejectionReason ?? null,
    });
    if (transitionError || !Array.isArray(transitioned) || !transitioned[0]) {
      const code = String(transitionError?.message || "VISIT_SUMMARY_ACTION_FAILED").match(/[A-Z][A-Z0-9_]{2,80}/)?.[0] || "VISIT_SUMMARY_ACTION_FAILED";
      return json(request, { error: code }, code.includes("CONFLICT") || code.includes("EDITABLE") ? 409 : 400);
    }
    return json(request, { ...(await loadSummaries(client, visitId)), result: transitioned[0] });
  } catch (error) {
    const safe = asAiGatewayError(error);
    const telemetry = telemetryFromError(error);
    if (body.action === "generate" && body.visitId && telemetry) {
      await admin.rpc("myvet_record_visit_summary_failure", {
        requested_actor_user_id: authData.user.id,
        requested_visit_id: body.visitId,
        requested_request_id: telemetry.requestId,
        requested_provider: telemetry.provider,
        requested_model_version: telemetry.model,
        requested_prompt_version: telemetry.promptVersion,
        requested_error_code: telemetry.errorCode || safe.code,
        requested_latency_ms: telemetry.latencyMs,
      });
    }
    console.error("Visit summary request failed", { action: body.action, code: safe.code });
    const retryHeaders: Record<string, string> = safe.retryAfterSeconds
      ? { "Retry-After": String(safe.retryAfterSeconds) }
      : {};
    return json(request, { error: safe.code }, safe.httpStatus, retryHeaders);
  }
});
