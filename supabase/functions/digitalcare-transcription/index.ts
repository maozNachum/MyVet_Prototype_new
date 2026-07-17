import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders } from "../_shared/cors.ts";
import { AiGatewayError, asAiGatewayError } from "../_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../_shared/ai/featureFlags.ts";
import { runDigitalCareSummaryGateway, runDigitalCareTranscriptionGateway, runtimeEnv, telemetryFromError } from "../_shared/ai/gateway.ts";

type Action = "status" | "begin" | "complete" | "create-summary" | "signed-url";
type Body = {
  action: Action;
  videoSessionId: number;
  appointmentId?: number;
  noticeVersion?: string;
  transcriptionConsent?: boolean;
  recordingConsent?: boolean;
  retainRecording?: boolean;
  mimeType?: string;
};

const MAX_BODY_BYTES = 12_000;
const MAX_AUDIO_BYTES = 10_485_760;
const NOTICE_VERSION = "digitalcare-consent-he-2026-07-17.1";
const ALLOWED_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function validateBody(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  const input = value as Record<string, unknown>;
  const allowed = new Set(["action", "videoSessionId", "appointmentId", "noticeVersion", "transcriptionConsent", "recordingConsent", "retainRecording", "mimeType"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (!["status", "begin", "complete", "create-summary", "signed-url"].includes(String(input.action))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (!Number.isSafeInteger(input.videoSessionId) || Number(input.videoSessionId) <= 0) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (input.appointmentId !== undefined && (!Number.isSafeInteger(input.appointmentId) || Number(input.appointmentId) <= 0)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (input.noticeVersion !== undefined && (typeof input.noticeVersion !== "string" || input.noticeVersion.length > 80)) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  if (input.mimeType !== undefined && (typeof input.mimeType !== "string" || !ALLOWED_MIME.has(input.mimeType))) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  for (const field of ["transcriptionConsent", "recordingConsent", "retainRecording"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "boolean") throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 400 });
  }
  return input as Body;
}

async function requireVeterinarianSession(client: SupabaseClient, userId: string, videoSessionId: number) {
  const { data: session, error } = await client.from("video_sessions")
    .select("clinic_id,session_id,appointment_id,visit_id,conversation_id,owner_id,pet_id,status,transcription_status,recording_status,recording_document_id,transcript_artifact_id,consent_notice_version")
    .eq("session_id", videoSessionId).maybeSingle();
  if (error || !session) throw new AiGatewayError("DIGITALCARE_ACCESS_DENIED", { httpStatus: 403 });
  const { data: staff } = await client.from("staff").select("staff_id,role,is_active")
    .eq("clinic_id", session.clinic_id).eq("auth_user_id", userId)
    .eq("role", "vet").eq("is_active", true).maybeSingle();
  if (!staff) throw new AiGatewayError("DIGITALCARE_ACCESS_DENIED", { httpStatus: 403 });
  return { session, staff };
}

async function clinicFlags(admin: SupabaseClient, clinicId: string) {
  const { data } = await admin.from("ai_feature_flags").select("capability,enabled,kill_switch,configuration")
    .eq("clinic_id", clinicId).in("capability", ["digitalcare_transcription", "digitalcare_recording", "digitalcare_summary"]);
  const byName = new Map((data || []).map((flag) => [flag.capability, flag]));
  const enabled = (name: string) => Boolean(byName.get(name)?.enabled && !byName.get(name)?.kill_switch);
  return { transcription: enabled("digitalcare_transcription"), recording: enabled("digitalcare_recording"), summary: enabled("digitalcare_summary") };
}

async function recordFailure(admin: SupabaseClient, userId: string, sessionId: number, stage: string, error: unknown) {
  const code = asAiGatewayError(error).code.replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "DIGITALCARE_OPERATION_FAILED";
  await admin.rpc("myvet_mark_digitalcare_failure", {
    requested_actor_user_id: userId,
    requested_video_session_id: sessionId,
    requested_stage: stage,
    requested_error_code: code,
  });
}

async function cleanupExpired(admin: SupabaseClient, clinicId: string, actorUserId: string) {
  const now = new Date().toISOString();
  const { data: documents } = await admin.from("ai_documents")
    .select("document_id,bucket_id,object_path")
    .eq("clinic_id", clinicId).eq("bucket_id", "ai-recordings")
    .lt("retention_until", now).is("deleted_at", null).limit(10);
  for (const document of documents || []) {
    const { error } = await admin.storage.from(document.bucket_id).remove([document.object_path]);
    if (error) continue;
    await admin.from("ai_documents").update({ status: "deleted", deleted_at: now, updated_at: now }).eq("document_id", document.document_id).eq("clinic_id", clinicId);
    await admin.from("video_sessions").update({ recording_status: "deleted", ai_updated_at: now }).eq("recording_document_id", document.document_id).eq("clinic_id", clinicId);
    await admin.from("ai_audit_events").insert({ clinic_id: clinicId, actor_user_id: actorUserId, capability: "digitalcare_recording", event_type: "retention_deleted", outcome: "success" });
  }
  const { data: transcripts } = await admin.from("ai_artifacts").select("artifact_id")
    .eq("clinic_id", clinicId).eq("artifact_type", "transcript")
    .lt("retention_until", now).is("deleted_at", null).limit(10);
  for (const transcript of transcripts || []) {
    await admin.from("ai_artifacts").update({ content: { redacted: true }, status: "superseded", deleted_at: now, updated_at: now }).eq("artifact_id", transcript.artifact_id).eq("clinic_id", clinicId);
    await admin.from("video_sessions").update({ transcription_status: "deleted", ai_updated_at: now }).eq("transcript_artifact_id", transcript.artifact_id).eq("clinic_id", clinicId);
    await admin.from("ai_audit_events").insert({ clinic_id: clinicId, actor_user_id: actorUserId, capability: "digitalcare_transcription", event_type: "retention_deleted", outcome: "success" });
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, { error: "METHOD_NOT_ALLOWED" }, 405);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return response(request, { error: "AI_INPUT_INVALID" }, 413);
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return response(request, { error: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return response(request, { error: "AI_CONFIGURATION_ERROR" }, 503);
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return response(request, { error: "UNAUTHORIZED" }, 401);

  let body: Body;
  try { body = validateBody(JSON.parse(raw)); }
  catch (error) { const safe = asAiGatewayError(error); return response(request, { error: safe.code }, safe.httpStatus); }

  try {
    const { session } = await requireVeterinarianSession(client, auth.user.id, body.videoSessionId);
    await cleanupExpired(admin, session.clinic_id, auth.user.id);
    const flags = await clinicFlags(admin, session.clinic_id);
    if (body.action === "status") return response(request, { session, flags, noticeVersion: NOTICE_VERSION });

    if (body.action === "begin") {
      if (!isAiCapabilityEnabled("digitalcare.transcribe", runtimeEnv) || !flags.transcription) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
      if (!body.appointmentId || body.transcriptionConsent !== true || body.noticeVersion !== NOTICE_VERSION) throw new AiGatewayError("DIGITALCARE_CONSENT_REQUIRED", { httpStatus: 400 });
      if (body.retainRecording && (!flags.recording || !isAiCapabilityEnabled("digitalcare.recording", runtimeEnv))) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
      if (body.retainRecording && body.recordingConsent !== true) throw new AiGatewayError("DIGITALCARE_RECORDING_CONSENT_REQUIRED", { httpStatus: 400 });
      const mimeType = body.mimeType || "audio/webm";
      const objectPath = `${session.clinic_id}/${session.pet_id}/digitalcare/${session.session_id}/${crypto.randomUUID()}.webm`;
      const { data: started, error: beginError } = await admin.rpc("myvet_begin_digitalcare_capture", {
        requested_actor_user_id: auth.user.id,
        requested_video_session_id: session.session_id,
        requested_appointment_id: body.appointmentId,
        requested_notice_version: NOTICE_VERSION,
        requested_transcription_consent: true,
        requested_recording_consent: body.recordingConsent === true,
        requested_recording_enabled: body.retainRecording === true,
        requested_object_path: objectPath,
        requested_mime_type: mimeType,
        requested_size_limit: 1,
      });
      if (beginError || !Array.isArray(started) || !started[0]) throw new AiGatewayError("DIGITALCARE_CAPTURE_START_FAILED", { httpStatus: 400 });
      const { data: upload, error: uploadError } = await admin.storage.from("ai-recordings").createSignedUploadUrl(objectPath);
      if (uploadError || !upload?.token) throw new AiGatewayError("DIGITALCARE_UPLOAD_FAILED", { httpStatus: 503, retryable: true });
      return response(request, { upload: { path: objectPath, token: upload.token }, documentId: started[0].recording_document_id, noticeVersion: NOTICE_VERSION });
    }

    if (body.action === "complete") {
      if (!flags.transcription || !isAiCapabilityEnabled("digitalcare.transcribe", runtimeEnv)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
      if (!session.recording_document_id) throw new AiGatewayError("DIGITALCARE_UPLOAD_MISSING", { httpStatus: 409 });
      const { data: document } = await admin.from("ai_documents").select("document_id,bucket_id,object_path,mime_type,document_kind")
        .eq("document_id", session.recording_document_id).eq("clinic_id", session.clinic_id).maybeSingle();
      if (!document) throw new AiGatewayError("DIGITALCARE_UPLOAD_MISSING", { httpStatus: 404 });
      await admin.from("video_sessions").update({ transcription_status: "processing", ai_updated_at: new Date().toISOString() }).eq("session_id", session.session_id).eq("clinic_id", session.clinic_id);
      const { data: blob, error: downloadError } = await admin.storage.from(document.bucket_id).download(document.object_path);
      if (downloadError || !blob) throw new AiGatewayError("DIGITALCARE_UPLOAD_FAILED", { httpStatus: 503, retryable: true });
      if (blob.size < 1 || blob.size > MAX_AUDIO_BYTES) throw new AiGatewayError("AI_INPUT_INVALID", { httpStatus: 413 });
      const mimeType = ALLOWED_MIME.has(blob.type) ? blob.type : document.mime_type;
      const result = await runDigitalCareTranscriptionGateway({ actorId: auth.user.id, audio: new Uint8Array(await blob.arrayBuffer()), mimeType });
      const telemetry = result.telemetry;
      await admin.from("ai_documents").update({ size_bytes: blob.size, mime_type: mimeType, status: "ready", updated_at: new Date().toISOString() }).eq("document_id", document.document_id).eq("clinic_id", session.clinic_id);
      const { data: stored, error: storeError } = await admin.rpc("myvet_complete_digitalcare_transcript", {
        requested_actor_user_id: auth.user.id,
        requested_video_session_id: session.session_id,
        requested_transcript: result.output.transcript,
        requested_language: result.output.language || "he",
        requested_request_id: telemetry.requestId,
        requested_provider: telemetry.provider,
        requested_model_version: telemetry.model,
        requested_latency_ms: telemetry.latencyMs,
        requested_input_tokens: telemetry.usage.inputTokens ?? null,
        requested_output_tokens: telemetry.usage.outputTokens ?? null,
      });
      if (storeError || !Array.isArray(stored) || !stored[0]) throw new AiGatewayError("DIGITALCARE_TRANSCRIPT_STORE_FAILED", { httpStatus: 503 });
      if (document.document_kind === "transcript_source") {
        const { error: removeError } = await admin.storage.from(document.bucket_id).remove([document.object_path]);
        if (!removeError) await admin.from("ai_documents").update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("document_id", document.document_id);
      }
      await admin.from("ai_audit_events").insert({ clinic_id: session.clinic_id, actor_user_id: auth.user.id, capability: "digitalcare_transcription", event_type: "capture_stopped", outcome: "success" });
      return response(request, { status: "ready", transcriptArtifactId: stored[0].artifact_id });
    }

    if (body.action === "create-summary") {
      if (!flags.summary || !isAiCapabilityEnabled("digitalcare.summary", runtimeEnv)) throw new AiGatewayError("AI_FEATURE_DISABLED", { httpStatus: 503 });
      if (!session.transcript_artifact_id || session.transcription_status !== "ready") throw new AiGatewayError("DIGITALCARE_TRANSCRIPT_NOT_READY", { httpStatus: 409 });
      const { data: transcript } = await admin.from("ai_artifacts").select("content,status")
        .eq("clinic_id", session.clinic_id).eq("artifact_id", session.transcript_artifact_id)
        .eq("artifact_type", "transcript").is("deleted_at", null).maybeSingle();
      const transcriptText = transcript?.content && typeof transcript.content === "object" ? String((transcript.content as Record<string, unknown>).text || "") : "";
      if (!transcriptText) throw new AiGatewayError("DIGITALCARE_TRANSCRIPT_NOT_READY", { httpStatus: 409 });
      const { data: visitId, error: visitError } = await admin.rpc("myvet_ensure_digitalcare_visit", { requested_actor_user_id: auth.user.id, requested_video_session_id: session.session_id });
      if (visitError || !Number(visitId)) throw new AiGatewayError("DIGITALCARE_VISIT_CREATE_FAILED", { httpStatus: 503 });
      const generated = await runDigitalCareSummaryGateway({ actorId: auth.user.id, transcript: transcriptText });
      const telemetry = generated.telemetry;
      const { data: stored, error: storeError } = await admin.rpc("myvet_create_visit_summary_draft", {
        requested_actor_user_id: auth.user.id,
        requested_visit_id: Number(visitId),
        requested_content: generated.output,
        requested_request_id: telemetry.requestId,
        requested_provider: telemetry.provider,
        requested_model_version: telemetry.model,
        requested_prompt_version: telemetry.promptVersion,
        requested_latency_ms: telemetry.latencyMs,
        requested_input_tokens: telemetry.usage.inputTokens ?? null,
        requested_output_tokens: telemetry.usage.outputTokens ?? null,
      });
      if (storeError || !Array.isArray(stored) || !stored[0]) throw new AiGatewayError("DIGITALCARE_SUMMARY_STORE_FAILED", { httpStatus: 503 });
      await admin.rpc("myvet_link_digitalcare_summary_source", { requested_actor_user_id: auth.user.id, requested_video_session_id: session.session_id, requested_summary_artifact_id: stored[0].artifact_id });
      return response(request, { status: "draft", visitId: Number(visitId), summaryArtifactId: stored[0].artifact_id });
    }

    if (!session.recording_document_id) throw new AiGatewayError("DIGITALCARE_FILE_NOT_AVAILABLE", { httpStatus: 404 });
    const { data: document } = await admin.from("ai_documents").select("bucket_id,object_path,status,document_kind")
      .eq("clinic_id", session.clinic_id).eq("document_id", session.recording_document_id)
      .eq("document_kind", "recording").eq("status", "ready").is("deleted_at", null).maybeSingle();
    if (!document) throw new AiGatewayError("DIGITALCARE_FILE_NOT_AVAILABLE", { httpStatus: 404 });
    const { data: signed, error: signedError } = await admin.storage.from(document.bucket_id).createSignedUrl(document.object_path, 60);
    if (signedError || !signed?.signedUrl) throw new AiGatewayError("DIGITALCARE_FILE_NOT_AVAILABLE", { httpStatus: 503 });
    await admin.from("ai_audit_events").insert({ clinic_id: session.clinic_id, actor_user_id: auth.user.id, capability: "digitalcare_recording", event_type: "file_accessed", outcome: "success" });
    return response(request, { signedUrl: signed.signedUrl, expiresIn: 60 });
  } catch (error) {
    const safe = asAiGatewayError(error);
    const telemetry = telemetryFromError(error);
    const stage = body.action === "complete" ? "transcription" : body.action === "create-summary" ? "summary" : body.action === "begin" ? "recording" : "upload";
    if (body.action !== "status" && body.action !== "signed-url") await recordFailure(admin, auth.user.id, body.videoSessionId, stage, error);
    console.error("DigitalCare AI request failed", { action: body.action, code: telemetry?.errorCode || safe.code });
    return response(request, { error: safe.code }, safe.httpStatus);
  }
});
