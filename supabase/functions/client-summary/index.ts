import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { AiGatewayError, asAiGatewayError } from "../_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../_shared/ai/featureFlags.ts";
import { runClientSummaryGateway, runtimeEnv } from "../_shared/ai/gateway.ts";
import { validateClientSummaryOutput, type ValidatedClientSummaryOutput } from "../_shared/ai/schemas.ts";

type Action = "load" | "generate" | "start_manual" | "save" | "approve" | "reject" | "release" | "revoke_release";
type Body = { action: Action; visitId?: number; artifactId?: string; content?: ValidatedClientSummaryOutput; rejectionReason?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyContent: ValidatedClientSummaryOutput = {
  reason_for_visit: "", what_was_found: [], treatment_given: [], medications_and_instructions: [],
  home_care: [], follow_up: [], warning_signs: [], next_steps: [],
};

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function validateBody(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const input = value as Record<string, unknown>;
  const allowed = new Set(["action", "visitId", "artifactId", "content", "rejectionReason"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const action = String(input.action) as Action;
  if (!["load","generate","start_manual","save","approve","reject","release","revoke_release"].includes(action)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (["load","generate","start_manual"].includes(action) && (!Number.isSafeInteger(input.visitId) || Number(input.visitId) <= 0)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (["save","approve","reject","release","revoke_release"].includes(action) && (typeof input.artifactId !== "string" || !UUID.test(input.artifactId))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const content = ["save","approve"].includes(action) ? validateClientSummaryOutput(input.content) : undefined;
  if (input.rejectionReason !== undefined && (typeof input.rejectionReason !== "string" || input.rejectionReason.length > 500)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  return { action, visitId: input.visitId as number | undefined, artifactId: input.artifactId as string | undefined, content, rejectionReason: input.rejectionReason as string | undefined };
}

async function requireVet(client: SupabaseClient, userId: string, visitId: number) {
  const { data: visit } = await client.from("medical_visits").select("clinic_id,visit_id,pet_id,visit_date").eq("visit_id", visitId).maybeSingle();
  if (!visit) throw new AiGatewayError("ACCESS_DENIED", { httpStatus: 403 });
  const { data: staff } = await client.from("staff").select("staff_id").eq("auth_user_id", userId)
    .eq("clinic_id", visit.clinic_id).eq("role", "vet").eq("is_active", true).maybeSingle();
  if (!staff) throw new AiGatewayError("ACCESS_DENIED", { httpStatus: 403 });
  return visit;
}

async function loadState(client: SupabaseClient, visitId: number) {
  const [{ data: source }, { data: rows, error }] = await Promise.all([
    client.from("ai_artifacts").select("artifact_id,content,version_number,approved_at").eq("visit_id", visitId)
      .eq("artifact_type", "visit_summary").eq("status", "approved").is("deleted_at", null).order("version_number", { ascending: false }).limit(1).maybeSingle(),
    client.from("ai_artifacts").select("artifact_id,status,content,version_number,created_at,updated_at,approved_at,released_to_owner,released_at,model_version")
      .eq("visit_id", visitId).eq("artifact_type", "client_explanation").is("deleted_at", null).order("version_number", { ascending: false }).limit(30),
  ]);
  if (error) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
  const artifacts = rows || [];
  const approved = artifacts.find((row) => row.status === "approved") || null;
  return {
    sourceApproved: source ? { artifact_id: source.artifact_id, version_number: source.version_number, approved_at: source.approved_at } : null,
    editable: artifacts.find((row) => row.status === "draft" || row.status === "edited") || null,
    approved,
    released: approved?.released_to_owner ? approved : null,
    rejected: artifacts.find((row) => row.status === "rejected") || null,
    versionCount: artifacts.length,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(request, { error: "UNAUTHORIZED" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 30_000) return json(request, { error: "AI_INPUT_INVALID" }, 413);
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
      const { data } = await client.from("ai_artifacts").select("visit_id").eq("artifact_id", body.artifactId).eq("artifact_type", "client_explanation").maybeSingle();
      visitId = Number(data?.visit_id || 0);
    }
    if (!visitId) throw new AiGatewayError("ACCESS_DENIED", { httpStatus: 403 });
    const visit = await requireVet(client, auth.user.id, visitId);
    if (body.action === "load") return json(request, await loadState(client, visitId));
    if (!isAiCapabilityEnabled("client-summary.generate", runtimeEnv)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
    const { data: clinicFlag } = await admin.from("ai_feature_flags").select("enabled,kill_switch").eq("clinic_id", visit.clinic_id).eq("capability", "client_explanation").maybeSingle();
    if (clinicFlag && (!clinicFlag.enabled || clinicFlag.kill_switch)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });

    if (body.action === "generate" || body.action === "start_manual") {
      const state = await loadState(client, visitId);
      if (!state.sourceApproved) throw new AiGatewayError("CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED", { httpStatus: 409 });
      if (state.editable) return json(request, { ...state, reusedDraft: true });
      const { data: source } = await client.from("ai_artifacts").select("content").eq("artifact_id", state.sourceApproved.artifact_id).eq("status", "approved").single();
      const generated = body.action === "generate";
      const result = generated ? await runClientSummaryGateway({ actorId: auth.user.id, approvedSummary: source?.content }) : null;
      const telemetry = result?.telemetry;
      const { data: stored, error } = await admin.rpc("myvet_create_client_summary_draft", {
        requested_actor_user_id: auth.user.id, requested_approved_artifact_id: state.sourceApproved.artifact_id,
        requested_content: result?.output || emptyContent, requested_request_id: telemetry?.requestId || crypto.randomUUID(),
        requested_provider: telemetry?.provider || "manual", requested_model_version: telemetry?.model || "manual",
        requested_prompt_version: telemetry?.promptVersion || "manual-v1", requested_latency_ms: telemetry?.latencyMs || 0,
        requested_input_tokens: telemetry?.usage.inputTokens ?? 0, requested_output_tokens: telemetry?.usage.outputTokens ?? 0,
        requested_generated_by_ai: generated,
      });
      if (error || !stored?.[0]) throw new AiGatewayError("AI_CONFIGURATION_ERROR", { httpStatus: 503 });
      return json(request, { ...(await loadState(client, visitId)), editable: stored[0], reusedDraft: false });
    }

    const { data: transitioned, error } = await client.rpc("myvet_transition_client_summary", {
      requested_artifact_id: body.artifactId, requested_action: body.action, requested_content: body.content ?? null,
      requested_rejection_reason: body.rejectionReason ?? null,
    });
    if (error || !transitioned?.[0]) {
      const code = String(error?.message || "CLIENT_SUMMARY_ACTION_FAILED").match(/[A-Z][A-Z0-9_]{2,80}/)?.[0] || "CLIENT_SUMMARY_ACTION_FAILED";
      return json(request, { error: code }, code.includes("ALREADY") || code.includes("NOT_") || code.includes("MISMATCH") ? 409 : 400);
    }
    return json(request, { ...(await loadState(client, visitId)), result: transitioned[0] });
  } catch (error) {
    const safe = asAiGatewayError(error);
    console.error("CLIENT_SUMMARY_AUDIT", { action: body.action, outcome: "failed", errorCode: safe.code });
    return json(request, { error: safe.code }, safe.httpStatus);
  }
});
