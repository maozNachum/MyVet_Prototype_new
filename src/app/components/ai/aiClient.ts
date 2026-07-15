import { supabase } from "../../../services/supabaseClient";
import { getAllowedAppActions } from "../../navigation/appActions";
import { protectAiPayload, redactSensitiveText } from "./aiSanitizer";
import type {
  AiAssistantRequest,
  AiAssistantResponse,
  AiAssistantResult,
  AiConfidence,
  AiSuggestedAction,
  AiUrgency,
} from "./aiTypes";
import { VETBOT_PRIVACY_NOTICE_VERSION } from "./aiPolicy";

export { VETBOT_PRIVACY_NOTICE_VERSION } from "./aiPolicy";

function friendlyEdgeError(message?: string) {
  const text = message || "לא הצלחנו להפעיל את VetBot כרגע.";

  if (text.includes("high demand") || text.includes("UNAVAILABLE") || text.includes("503") || text.includes("RESOURCE_EXHAUSTED")) {
    return "VetBot עמוס כרגע. נסה שוב בעוד כמה שניות.";
  }
  if (text.includes("Missing question")) return "חסרה שאלה ל־VetBot.";
  if (text.includes("Forbidden") || text.includes("ROLE_NOT_ALLOWED")) return "אין הרשאה להפעיל את הפעולה הזו ב־VetBot.";
  if (text.includes("PRIVACY_BLOCKED")) return "VetBot עצר את הבקשה כי זוהה בה מידע רגיש שלא ניתן להסיר בבטחה.";
  if (
    text.includes("Missing GEMINI_API_KEY") ||
    text.includes("Unauthorized") ||
    text.includes("non-2xx") ||
    text.includes("FunctionsHttpError") ||
    text.includes("Failed to fetch")
  ) {
    return "VetBot לא זמין כרגע. נסה שוב בעוד רגע.";
  }
  return "לא הצלחנו לקבל תשובה מ־VetBot כרגע. נסה שוב.";
}

function normalizeUrgency(value: unknown): AiUrgency {
  return value === "urgent" || value === "important" ? value : "normal";
}

function normalizeConfidence(value: unknown): AiConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

function allowedRoutes(role: AiAssistantRequest["userRole"]) {
  return new Set(getAllowedAppActions(role || "unknown").map((action) => action.route));
}

function normalizeSuggestedActions(
  actions: AiAssistantResponse["suggestedActions"],
  role: AiAssistantRequest["userRole"],
): AiSuggestedAction[] {
  const routes = allowedRoutes(role);
  if (!Array.isArray(actions)) return [];

  return actions.slice(0, 4).flatMap((action, index) => {
    const kind = action?.kind === "draft" || action?.kind === "review" ? action.kind : "navigate";
    const route = typeof action?.route === "string" && routes.has(action.route) ? action.route : undefined;
    if (kind === "navigate" && !route) return [];
    const label = redactSensitiveText(String(action?.label || "בדיקה מומלצת")).slice(0, 80);
    if (!label) return [];

    return [{
      id: String(action?.id || `action-${index}`).slice(0, 80),
      label,
      kind,
      route,
      reason: action?.reason ? redactSensitiveText(String(action.reason)).slice(0, 220) : undefined,
      requiresConfirmation: true as const,
    }];
  });
}

function normalizeResponse(
  data: AiAssistantResponse,
  request: AiAssistantRequest,
  localRedactions: { total: number; categories: string[] },
): AiAssistantResult {
  const findings = Array.isArray(data.findings)
    ? data.findings.slice(0, 6).map((finding, index) => ({
        id: String(finding?.id || `finding-${index}`).slice(0, 80),
        title: redactSensitiveText(String(finding?.title || "נקודה לבדיקה")).slice(0, 110),
        detail: redactSensitiveText(String(finding?.detail || "")).slice(0, 420),
        urgency: normalizeUrgency(finding?.urgency),
        source: finding?.source ? redactSensitiveText(String(finding.source)).slice(0, 80) : undefined,
      }))
    : [];

  const serverCategories = Array.isArray(data.privacy?.removedCategories)
    ? data.privacy.removedCategories.map(String)
    : [];

  return {
    answer: redactSensitiveText(String(data.answer || "")).trim(),
    summary: data.summary ? redactSensitiveText(String(data.summary)).slice(0, 400) : undefined,
    urgency: normalizeUrgency(data.urgency),
    confidence: normalizeConfidence(data.confidence),
    findings,
    suggestedActions: normalizeSuggestedActions(data.suggestedActions, request.userRole),
    usedTools: Array.isArray(data.usedTools)
      ? data.usedTools.slice(0, 8).map((item) => redactSensitiveText(String(item)).slice(0, 80))
      : [],
    memorySummary: data.memorySummary
      ? redactSensitiveText(String(data.memorySummary)).slice(0, 900)
      : undefined,
    privacy: {
      mode: "strict-minimization",
      piiRemoved: localRedactions.total > 0 || Boolean(data.privacy?.piiRemoved),
      removedCategories: Array.from(new Set([...localRedactions.categories, ...serverCategories])).slice(0, 12),
      externalProcessing: data.privacy?.externalProcessing !== false,
      noticeVersion: VETBOT_PRIVACY_NOTICE_VERSION,
    },
  };
}

export async function askAiAssistant(request: AiAssistantRequest): Promise<AiAssistantResult> {
  const protectedPayload = protectAiPayload({
    ...request,
    history: (request.history ?? []).slice(-8).map(({ role, content }) => ({ role, content })),
    memorySummary: request.memorySummary || undefined,
    privacyMode: "strict-minimization" as const,
    noticeVersion: VETBOT_PRIVACY_NOTICE_VERSION,
  });

  const safeRequest = protectedPayload.value;
  const { data, error } = await supabase.functions.invoke<AiAssistantResponse>("ai-assistant", {
    body: safeRequest,
  });

  if (error) {
    console.error("VetBot request failed", { mode: request.mode, message: error.message });
    throw new Error(friendlyEdgeError(error.message));
  }
  if (!data?.answer) throw new Error("VetBot לא החזיר תשובה תקינה. נסה שוב.");

  return normalizeResponse(data, request, {
    total: protectedPayload.report.total,
    categories: protectedPayload.report.categories,
  });
}

export async function recordAiFeedback({
  mode,
  helpful,
  usedTools,
}: {
  mode: AiAssistantRequest["mode"];
  helpful: boolean;
  usedTools: string[];
}) {
  // Deliberately stores no prompt, response, pet, owner, contact or medical text.
  const { error } = await supabase.from("vetbot_feedback").insert({
    mode,
    helpful,
    used_tools: usedTools.slice(0, 8),
    notice_version: VETBOT_PRIVACY_NOTICE_VERSION,
  });
  if (error) console.warn("VetBot feedback was not stored", { code: error.code });
}
