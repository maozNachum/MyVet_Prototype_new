import { supabase } from "./supabaseClient";

export type DigitalCareAiStatus = {
  session: {
    session_id: number;
    appointment_id: number | null;
    visit_id: number | null;
    transcription_status: "idle" | "consent_pending" | "capturing" | "processing" | "ready" | "failed" | "deleted";
    recording_status: "disabled" | "consent_pending" | "recording" | "stored" | "failed" | "deleted";
    consent_notice_version: string | null;
  };
  flags: { transcription: boolean; recording: boolean; summary: boolean };
  noticeVersion: string;
};

type BeginResponse = {
  upload: { path: string; token: string };
  documentId: string;
  noticeVersion: string;
};

async function responseError(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error || "");
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context : null;
  if (!(context instanceof Response)) return fallback;
  try { return ((await context.clone().json()) as { error?: string }).error || fallback; }
  catch { return fallback; }
}

function friendly(code: string) {
  if (code.includes("AI_FEATURE_DISABLED")) return "התמלול המאובטח אינו פעיל כרגע במרפאה. שיחת הווידאו ממשיכה כרגיל.";
  if (code.includes("CONSENT_REQUIRED")) return "לא ניתן להתחיל לפני אישור מפורש של ההסכמה.";
  if (code.includes("ACCESS_DENIED") || code.includes("403")) return "הפעולה זמינה רק לווטרינר מורשה בתור הווידאו הזה.";
  if (code.includes("UPLOAD")) return "העלאת השמע נכשלה. שיחת הווידאו לא הושפעה ואפשר לנסות שוב.";
  if (code.includes("PROVIDER_TIMEOUT")) return "שירות התמלול לא הגיב בזמן. שיחת הווידאו ממשיכה ואפשר לנסות שוב בבטחה.";
  if (code.includes("TRANSCRIPT_NOT_READY")) return "התמלול עדיין אינו מוכן ליצירת סיכום.";
  return "הפעולה החכמה לא הושלמה. שיחת הווידאו וההערות הידניות לא נפגעו.";
}

async function invoke<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>("digitalcare-transcription", { body });
  if (error) throw new Error(friendly(await responseError(error)));
  if (!data) throw new Error(friendly("EMPTY_RESPONSE"));
  return data;
}

export function loadDigitalCareAiStatus(videoSessionId: number) {
  return invoke<DigitalCareAiStatus>({ action: "status", videoSessionId });
}

export async function beginDigitalCareCapture(input: {
  videoSessionId: number;
  appointmentId: number;
  noticeVersion: string;
  transcriptionConsent: true;
  retainRecording: boolean;
  recordingConsent: boolean;
  mimeType: string;
}) {
  return await invoke<BeginResponse>({ action: "begin", ...input });
}

export async function uploadDigitalCareAudio(upload: BeginResponse["upload"], audio: Blob) {
  const { error } = await supabase.storage.from("ai-recordings")
    .uploadToSignedUrl(upload.path, upload.token, audio, { contentType: audio.type || "audio/webm" });
  if (error) throw new Error(friendly("DIGITALCARE_UPLOAD_FAILED"));
}

export function completeDigitalCareTranscription(videoSessionId: number) {
  return invoke<{ status: "ready"; transcriptArtifactId: string }>({ action: "complete", videoSessionId });
}

export function createDigitalCareSummary(videoSessionId: number) {
  return invoke<{ status: "draft"; visitId: number; summaryArtifactId: string }>({ action: "create-summary", videoSessionId });
}

export function getDigitalCareRecordingUrl(videoSessionId: number) {
  return invoke<{ signedUrl: string; expiresIn: number }>({ action: "signed-url", videoSessionId });
}
