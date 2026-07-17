import { supabase } from "./supabaseClient";

export type FollowUpReminderType = "return_visit" | "future_vaccination" | "general_follow_up";
export type FollowUpTargetType = "staff" | "owner";

export type FollowUpSuggestionContent = {
  reminder_type: FollowUpReminderType;
  title: string;
  description: string;
  scheduled_at: string | null;
  target_type: FollowUpTargetType;
  requires_manual_date: boolean;
  release_to_client: boolean;
  confidence: "low" | "medium" | "high";
};

export type FollowUpSuggestionArtifact = {
  artifact_id: string;
  status: "draft" | "edited" | "approved" | "rejected" | "superseded";
  content: FollowUpSuggestionContent;
  version_number: number;
  model_version?: string | null;
};

export type FollowUpTransitionResult = {
  artifact_id: string;
  status: string;
  reminder_id: number | null;
  possible_duplicate: boolean;
};

export type FollowUpSuggestionState = {
  suggestions: FollowUpSuggestionArtifact[];
  result?: FollowUpTransitionResult;
  noSuggestions?: boolean;
};

async function responseError(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error || "");
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (!(context instanceof Response)) return fallback;
  const body = await context.clone().json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

function friendlyMessage(code: string) {
  if (code.includes("AI_FEATURE_DISABLED")) return "הצעות המעקב עדיין אינן פעילות בסביבה זו. לא נוצרה תזכורת.";
  if (code.includes("FOLLOW_UP_APPROVED_SOURCE_REQUIRED")) return "אפשר ליצור הצעות רק מסיכום ביקור רפואי מאושר.";
  if (code.includes("FOLLOW_UP_DATE_REQUIRED")) return "יש לבחור תאריך ושעה לפני אישור התזכורת.";
  if (code.includes("FOLLOW_UP_REJECTION_REQUIRED")) return "יש לכתוב סיבה קצרה לדחיית ההצעה.";
  if (code.includes("FOLLOW_UP_INPUT_INVALID") || code.includes("AI_OUTPUT_INVALID")) return "חלק מהשדות חסרים או אינם תקינים. בדקו את סוג המעקב, הכותרת, התיאור והתאריך.";
  if (code.includes("ACCESS_DENIED") || code.includes("403")) return "הפעולה זמינה רק לווטרינר מורשה במרפאה של הביקור.";
  if (code.includes("AI_PROVIDER_TIMEOUT")) return "יצירת ההצעות ארכה זמן רב מדי. אפשר לנסות שוב או ליצור מעקב ידני.";
  return "לא הצלחנו להשלים את הפעולה. העריכות נשארו במסך ואפשר לנסות שוב.";
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<FollowUpSuggestionState>("follow-up-suggestions", { body });
  if (error) throw new Error(friendlyMessage(await responseError(error)));
  if (!data) throw new Error(friendlyMessage("EMPTY_RESPONSE"));
  return data;
}

export const loadFollowUpSuggestions = (visitId: number) => invoke({ action: "load", visitId });
export const generateFollowUpSuggestions = (visitId: number) => invoke({ action: "generate", visitId });
export const startManualFollowUpSuggestion = (visitId: number) => invoke({ action: "start_manual", visitId });

export function transitionFollowUpSuggestion(input: {
  action: "save" | "approve" | "reject";
  visitId: number;
  artifactId: string;
  content?: FollowUpSuggestionContent;
  rejectionReason?: string;
  duplicateConfirmed?: boolean;
}) {
  return invoke({
    action: input.action,
    visitId: input.visitId,
    artifactId: input.artifactId,
    content: input.content,
    rejectionReason: input.rejectionReason,
    duplicateConfirmed: input.duplicateConfirmed,
  });
}
