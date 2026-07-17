import { supabase } from "./supabaseClient";

export type VisitSummaryContent = {
  chief_complaint: string;
  symptoms: string[];
  relevant_history: string[];
  examination_findings: string[];
  tests: string[];
  clinical_assessment: string;
  treatments: string[];
  medications: string[];
  follow_up: string[];
  warnings: string[];
  unresolved_items: string[];
  source_references: string[];
};

export type VisitSummaryArtifact = {
  artifact_id: string;
  status: "draft" | "edited" | "approved" | "rejected" | "superseded";
  content: VisitSummaryContent;
  version_number: number;
  created_at?: string;
  updated_at?: string;
  approved_at?: string | null;
};

export type VisitSummaryState = {
  editable: VisitSummaryArtifact | null;
  approved: VisitSummaryArtifact | null;
  rejected: VisitSummaryArtifact | null;
  versionCount: number;
  reusedDraft?: boolean;
};

async function responseError(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error || "");
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (!(context instanceof Response)) return fallback;
  try {
    const body = await context.clone().json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function friendlyMessage(code: string) {
  if (code.includes("AI_FEATURE_DISABLED")) return "יצירת סיכום AI מושבתת כרגע במרפאה.";
  if (code.includes("AI_PROVIDER_TIMEOUT")) return "יצירת הסיכום ארכה יותר מדי זמן. הטקסט שלך נשמר ואפשר לנסות שוב.";
  if (code.includes("AI_OUTPUT_INVALID")) return "VetBot החזיר טיוטה לא תקינה ולכן היא לא נשמרה. אפשר לנסות שוב.";
  if (code.includes("AI_RATE_LIMITED")) return "בוצעו יותר מדי ניסיונות בזמן קצר. נסו שוב בעוד רגע.";
  if (code.includes("VERSION_CONFLICT") || code.includes("NOT_EDITABLE")) return "הטיוטה השתנתה בחלון אחר. טענו אותה מחדש לפני המשך עבודה.";
  if (code.includes("ACCESS_DENIED") || code.includes("AI_INPUT_INVALID") || code.includes("403")) return "הפעולה זמינה רק לווטרינר שמורשה לצפות בביקור הזה.";
  return "לא הצלחנו להשלים את הפעולה. התוכן שהוזן נשאר במסך ואפשר לנסות שוב.";
}

async function invokeVisitSummary(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<VisitSummaryState>("visit-summary", { body });
  if (error) throw new Error(friendlyMessage(await responseError(error)));
  if (!data) throw new Error(friendlyMessage("EMPTY_RESPONSE"));
  return data;
}

export function loadVisitSummary(visitId: number) {
  return invokeVisitSummary({ action: "load", visitId });
}

export function generateVisitSummary(visitId: number) {
  return invokeVisitSummary({ action: "generate", visitId });
}

export function transitionVisitSummary(input: {
  action: "save" | "approve" | "reject";
  artifactId: string;
  content?: VisitSummaryContent;
  rejectionReason?: string;
}) {
  return invokeVisitSummary({
    action: input.action,
    artifactId: input.artifactId,
    content: input.content,
    rejectionReason: input.rejectionReason,
  });
}
