import { supabase } from "./supabaseClient";

export type PrivacyRequestType = "access" | "correction" | "export" | "deletion" | "consent_withdrawal";
export type PrivacyRequestStatus = "submitted" | "identity_review" | "in_review" | "completed" | "rejected" | "cancelled";

export interface PrivacyRequestSummary {
  id: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  submittedAt: string;
}

const SAFE_ERRORS: Array<[string, string]> = [
  ["AUTH_REQUIRED", "יש להתחבר לאזור האישי לפני שליחת הבקשה."],
  ["OWNER_PROFILE_REQUIRED", "לא נמצא אזור אישי שמחובר לחשבון הזה. פנו למרפאה."],
  ["PRIVACY_REQUEST_TYPE_INVALID", "סוג הבקשה אינו תקין."],
  ["PRIVACY_REQUEST_DETAILS_INVALID", "פירוט הבקשה ארוך מדי."],
];

function safeError(error: unknown, fallback: string) {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  return new Error(SAFE_ERRORS.find(([code]) => raw.includes(code))?.[1] || fallback);
}

export async function submitPrivacyRequest(type: PrivacyRequestType, details?: string) {
  const { data, error } = await supabase.rpc("myvet_submit_privacy_request", {
    requested_type: type,
    requested_details: details?.trim() || null,
  });
  if (error) throw safeError(error, "לא הצלחנו לשלוח את הבקשה. נסו שוב או פנו אלינו בדוא״ל.");
  return String(data || "");
}

export async function hasLinkedOwnerProfile(): Promise<boolean> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return false;
  const { data, error } = await supabase
    .from("owners")
    .select("owner_id")
    .eq("auth_user_id", authData.user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw safeError(error, "לא הצלחנו לאמת את האזור האישי.");
  return Boolean(data?.owner_id);
}

export async function listMyPrivacyRequests(): Promise<PrivacyRequestSummary[] | null> {
  const { data, error } = await supabase
    .from("privacy_requests")
    .select("request_id, request_type, status, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) {
    if (error.code === "42P01" || /privacy_requests.*does not exist/i.test(error.message || "")) return null;
    throw safeError(error, "לא הצלחנו לטעון בקשות קודמות.");
  }
  return (data || []).map((row: any) => ({
    id: String(row.request_id),
    type: row.request_type as PrivacyRequestType,
    status: row.status as PrivacyRequestStatus,
    submittedAt: String(row.submitted_at),
  }));
}
