import { supabase } from "../../../services/supabaseClient";
import { getAllowedAppActions } from "../../navigation/appActions";
import { protectAiPayload, redactSensitiveText } from "./aiSanitizer";
import type {
  AiAssistantRequest,
  AiAssistantResponse,
  AiAssistantResult,
  AiActionDecisionRequest,
  AiActionPlan,
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
  if (text.includes("AI_RATE_LIMITED")) {
    return "VetBot עמוס כרגע. נסה שוב בעוד כמה שניות.";
  }
  if (text.includes("AI_FEATURE_DISABLED") || text.includes("AI_CONFIGURATION_ERROR")) {
    return "VetBot אינו זמין כרגע. נסה שוב מאוחר יותר.";
  }
  if (text.includes("AI_PROVIDER_TIMEOUT")) {
    return "VetBot לא הספיק להשיב בזמן. אפשר לנסות שוב.";
  }
  if (
    text.includes("Unauthorized") ||
    text.includes("non-2xx") ||
    text.includes("FunctionsHttpError") ||
    text.includes("Failed to fetch")
  ) {
    return "VetBot לא זמין כרגע. נסה שוב בעוד רגע.";
  }
  return "לא הצלחנו לקבל תשובה מ־VetBot כרגע. נסה שוב.";
}

async function edgeErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error || "");
  const context =
    typeof error === "object" && error !== null && "context" in error
      ? error.context
      : null;

  if (!(context instanceof Response)) return fallback;

  try {
    const body = await context.clone().json() as {
      error?: unknown;
      message?: unknown;
    };
    const detail =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : "";
    return detail || fallback;
  } catch {
    return fallback;
  }
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
    actionPlan: normalizeActionPlan(data.actionPlan),
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

function normalizeActionPlan(value: unknown): AiActionPlan | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<AiActionPlan>;
  const allowedStatuses = new Set(["needs_details", "needs_confirmation", "blocked", "executed", "rejected", "failed"]);
  const allowedTypes = new Set(["book_appointment", "reschedule_appointment", "cancel_appointment", "adjust_inventory", "archive_conversation", "restore_conversation", "set_conversation_priority", "set_lab_urgency", "block_booking_time", "draft_message", "navigate", "forbidden", "none"]);
  if (!allowedStatuses.has(String(raw.status)) || !allowedTypes.has(String(raw.type))) return undefined;
  return {
    requestId: typeof raw.requestId === "string" ? raw.requestId.slice(0, 80) : undefined,
    type: raw.type as AiActionPlan["type"],
    status: raw.status as AiActionPlan["status"],
    title: redactSensitiveText(String(raw.title || "פעולת VetBot")).slice(0, 100),
    summary: redactSensitiveText(String(raw.summary || "")).slice(0, 320),
    missingFields: Array.isArray(raw.missingFields) ? raw.missingFields.slice(0, 8).map((item) => redactSensitiveText(String(item)).slice(0, 60)) : [],
    details: Array.isArray(raw.details) ? raw.details.slice(0, 8).map((item) => ({
      label: redactSensitiveText(String(item?.label || "פרט")).slice(0, 50),
      value: redactSensitiveText(String(item?.value || "")).slice(0, 140),
    })) : [],
    destructive: Boolean(raw.destructive),
    confirmationLabel: raw.confirmationLabel ? redactSensitiveText(String(raw.confirmationLabel)).slice(0, 60) : undefined,
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
    const detail = await edgeErrorMessage(error);
    console.error("VetBot request failed", {
      mode: request.mode,
      message: detail,
    });
    throw new Error(friendlyEdgeError(detail));
  }
  if (!data?.answer) throw new Error("VetBot לא החזיר תשובה תקינה. נסה שוב.");

  return normalizeResponse(data, request, {
    total: protectedPayload.report.total,
    categories: protectedPayload.report.categories,
  });
}

export async function decideAiAction(request: AiActionDecisionRequest): Promise<AiAssistantResult> {
  const { data, error } = await supabase.functions.invoke<AiAssistantResponse>("ai-assistant", {
    body: {
      mode: request.mode,
      actionDecision: { requestId: request.requestId, decision: request.decision },
    },
  });
  if (error) {
    const detail = await edgeErrorMessage(error);
    throw new Error(friendlyEdgeError(detail));
  }
  if (!data?.answer) throw new Error("VetBot לא החזיר את מצב הפעולה. נסה שוב.");
  return normalizeResponse(data, {
    mode: request.mode,
    question: "",
    userRole: request.userRole,
  }, { total: 0, categories: [] });
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
