import type { AiCapability, EnvReader } from "./types.ts";

export const AI_FEATURE_ENV = {
  gateway: "AI_GATEWAY_ENABLED",
  global: "AI_GLOBAL_ENABLED",
  "vetbot.general": "AI_VETBOT_ENABLED",
  "vetbot.actions": "AI_VETBOT_ACTIONS_ENABLED",
  "vetbot.appointment-actions": "AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED",
  "visit-summary.generate": "AI_VISIT_SUMMARY_ENABLED",
  "digitalcare.transcribe": "AI_DIGITALCARE_TRANSCRIPTION_ENABLED",
  "digitalcare.recording": "AI_DIGITALCARE_RECORDING_ENABLED",
  "digitalcare.summary": "AI_DIGITALCARE_SUMMARY_ENABLED",
  "rag.index": "AI_RAG_INDEX_ENABLED",
  "rag.answer": "AI_RAG_QA_ENABLED",
  "document.ocr": "AI_DOCUMENT_OCR_ENABLED",
  "vaccination.ocr": "AI_VACCINATION_OCR_ENABLED",
} as const;

function enabled(value: string | undefined, fallback = true) {
  if (value === undefined || value.trim() === "") return fallback;
  return !["0", "false", "off", "disabled"].includes(value.trim().toLowerCase());
}

export function isAiCapabilityEnabled(capability: AiCapability, env: EnvReader) {
  if (!enabled(env(AI_FEATURE_ENV.global))) return false;
  if (capability === "document.ocr" || capability === "vaccination.ocr") {
    const killed = enabled(env("AI_DOCUMENT_OCR_KILL_SWITCH"), false)
      || (capability === "vaccination.ocr" && enabled(env("AI_VACCINATION_OCR_KILL_SWITCH"), false));
    if (killed || !enabled(env(AI_FEATURE_ENV["document.ocr"]), false)) return false;
    return capability === "document.ocr" || enabled(env(AI_FEATURE_ENV["vaccination.ocr"]), false);
  }
  if (capability === "rag.index" || capability === "rag.answer") {
    return enabled(env(AI_FEATURE_ENV[capability]), false);
  }
  if (capability === "digitalcare.transcribe" || capability === "digitalcare.recording" || capability === "digitalcare.summary") {
    return enabled(env(AI_FEATURE_ENV[capability]), false);
  }
  if (capability === "visit-summary.generate") {
    return enabled(env(AI_FEATURE_ENV["visit-summary.generate"]));
  }
  if (!enabled(env(AI_FEATURE_ENV["vetbot.general"]))) return false;
  if (capability === "vetbot.general") return true;
  if (!enabled(env(AI_FEATURE_ENV["vetbot.actions"]))) return false;
  if (capability === "vetbot.actions") return true;
  return enabled(env(AI_FEATURE_ENV["vetbot.appointment-actions"]));
}

export function isAiGatewayEnabled(env: EnvReader) {
  return enabled(env(AI_FEATURE_ENV.gateway));
}

const APPOINTMENT_ACTIONS = new Set([
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
]);

export function capabilityForAction(actionType: string): AiCapability {
  return APPOINTMENT_ACTIONS.has(actionType)
    ? "vetbot.appointment-actions"
    : "vetbot.actions";
}
