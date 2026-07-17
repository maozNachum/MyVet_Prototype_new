import { supabase } from "./supabaseClient";

export type ClientSummaryContent = {
  reason_for_visit: string;
  what_was_found: string[];
  treatment_given: string[];
  medications_and_instructions: string[];
  home_care: string[];
  follow_up: string[];
  warning_signs: string[];
  next_steps: string[];
};

export type ClientSummaryArtifact = {
  artifact_id: string;
  status: "draft" | "edited" | "approved" | "rejected" | "superseded";
  content: ClientSummaryContent;
  version_number: number;
  released_to_owner: boolean;
  approved_at?: string | null;
  released_at?: string | null;
  model_version?: string | null;
};

export type ClientSummaryState = {
  sourceApproved: { artifact_id: string; version_number: number; approved_at: string | null } | null;
  editable: ClientSummaryArtifact | null;
  approved: ClientSummaryArtifact | null;
  released: ClientSummaryArtifact | null;
  rejected: ClientSummaryArtifact | null;
  versionCount: number;
  reusedDraft?: boolean;
};

async function errorText(error: unknown) {
  const context = typeof error === "object" && error && "context" in error ? (error as { context?: unknown }).context : null;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => ({})) as { error?: string };
    if (body.error) return body.error;
  }
  return error instanceof Error ? error.message : String(error || "");
}

function friendly(code: string) {
  if (code.includes("AI_FEATURE_DISABLED")) return "יצירת סיכום ללקוח עדיין אינה פעילה בסביבה זו. התוכן הקיים לא השתנה.";
  if (code.includes("APPROVED_SOURCE_REQUIRED")) return "אפשר ליצור סיכום ללקוח רק לאחר שסיכום הביקור הרפואי אושר.";
  if (code.includes("FACT_MISMATCH") || code.includes("AI_OUTPUT_INVALID")) return "אחד הפרטים אינו תואם לסיכום המאושר. שמות תרופות, מינונים, תאריכים, טיפול, מעקב ואזהרות חייבים להישאר ללא שינוי.";
  if (code.includes("ACCESS_DENIED") || code.includes("403")) return "הפעולה זמינה רק לווטרינר מורשה במרפאה של הביקור.";
  if (code.includes("ALREADY_RELEASED")) return "הסיכום כבר שוחרר לפורטל.";
  if (code.includes("NOT_APPROVED")) return "יש לאשר את הסיכום לפני השחרור לפורטל.";
  if (code.includes("AI_PROVIDER_TIMEOUT")) return "יצירת הסיכום ארכה זמן רב מדי. אפשר לנסות שוב או להתחיל טיוטה ידנית.";
  return "לא הצלחנו להשלים את הפעולה. הטקסט שהוזן נשאר במסך ואפשר לנסות שוב.";
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<ClientSummaryState>("client-summary", { body });
  if (error) throw new Error(friendly(await errorText(error)));
  if (!data) throw new Error(friendly("EMPTY_RESPONSE"));
  return data;
}

export const loadClientSummary = (visitId: number) => invoke({ action: "load", visitId });
export const generateClientSummary = (visitId: number) => invoke({ action: "generate", visitId });
export const startManualClientSummary = (visitId: number) => invoke({ action: "start_manual", visitId });
export const transitionClientSummary = (input: {
  action: "save" | "approve" | "reject" | "release" | "revoke_release";
  artifactId: string;
  content?: ClientSummaryContent;
  rejectionReason?: string;
}) => invoke({ action: input.action, artifactId: input.artifactId, content: input.content, rejectionReason: input.rejectionReason });
