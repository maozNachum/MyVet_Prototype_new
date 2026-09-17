import { supabase } from "./supabaseClient";
import type { PrivacyRequestStatus, PrivacyRequestType } from "./privacyRequests";

export type ManagedPrivacyStatus = Exclude<PrivacyRequestStatus, "submitted">;
export type PrivacyQueue = "open" | "closed";
export interface ManagedPrivacyRequest {
  id: string;
  ownerId: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  details: string | null;
  resolutionNotes: string | null;
  submittedAt: string;
  completedAt: string | null;
}
export const PRIVACY_PAGE_SIZE = 20;
const closedStatuses: PrivacyRequestStatus[] = ["completed", "rejected", "cancelled"];
export const isPrivacyRequestClosed = (status: PrivacyRequestStatus) => closedStatuses.includes(status);

class PrivacyManagementError extends Error {
  name = "PrivacyManagementError";
}

function safeManagementError(error: unknown, fallback: string): Error {
  const raw = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const messages: Array<[string, string]> = [
    ["AUTH_REQUIRED", "יש להתחבר מחדש כדי לטפל בבקשה."],
    ["MFA_REQUIRED", "יש להשלים אימות נוסף לפני הטיפול בבקשה."],
    ["CLINIC_ADMIN_REQUIRED", "הטיפול בבקשות זמין למנהל המרפאה בלבד."],
    ["PRIVACY_REQUEST_ALREADY_CLOSED", "הבקשה כבר נסגרה. רעננו את הרשימה לצפייה במצב העדכני."],
    ["PRIVACY_REQUEST_NOT_FOUND", "הבקשה אינה זמינה לטיפול. רעננו את הרשימה."],
    ["PRIVACY_REQUEST_NOTES_INVALID", "סיכום הטיפול יכול להכיל עד 2,000 תווים."],
    ["PRIVACY_REQUEST_STATUS_INVALID", "בחרו מצב טיפול מהרשימה."],
  ];
  return new PrivacyManagementError(messages.find(([code]) => raw.includes(code))?.[1] || fallback);
}

export async function listClinicPrivacyRequests(clinicId: string, queue: PrivacyQueue, page: number) {
  if (!clinicId || !Number.isInteger(page) || page < 0) throw new PrivacyManagementError("לא ניתן לטעון את רשימת הבקשות.");
  const start = page * PRIVACY_PAGE_SIZE;
  const { data, error } = await supabase.from("privacy_requests")
    .select("request_id,owner_id,request_type,status,request_details,resolution_notes,submitted_at,completed_at")
    .eq("clinic_id", clinicId)
    .in("status", queue === "open" ? ["submitted", "identity_review", "in_review"] : closedStatuses)
    .order("submitted_at", { ascending: queue === "open" })
    .order("request_id", { ascending: true })
    .range(start, start + PRIVACY_PAGE_SIZE);
  if (error) throw safeManagementError(error, "לא הצלחנו לטעון את הבקשות. נסו שוב.");
  const rows = data || [];
  const requests: ManagedPrivacyRequest[] = rows.slice(0, PRIVACY_PAGE_SIZE).map((row) => ({
    id: String(row.request_id), ownerId: String(row.owner_id),
    type: row.request_type as PrivacyRequestType, status: row.status as PrivacyRequestStatus,
    details: row.request_details, resolutionNotes: row.resolution_notes,
    submittedAt: String(row.submitted_at), completedAt: row.completed_at,
  }));
  return { requests, hasNext: rows.length > PRIVACY_PAGE_SIZE };
}

export async function managePrivacyRequest(id: string, status: ManagedPrivacyStatus, notes: string) {
  const normalizedNotes = notes.trim();
  if (normalizedNotes.length < 10 || normalizedNotes.length > 2000) {
    throw new PrivacyManagementError("פרטו את הטיפול בבקשה ב־10 עד 2,000 תווים.");
  }
  const { data, error } = await supabase.rpc("myvet_manage_privacy_request", {
    requested_request_id: id,
    requested_status: status,
    requested_resolution_notes: normalizedNotes,
  });
  if (error) throw safeManagementError(error, "לא הצלחנו לשמור את הטיפול. הפרטים נשמרו במסך ואפשר לנסות שוב.");
  if (String(data || "") !== id) throw new PrivacyManagementError("לא התקבל אישור לשמירה. רעננו את הרשימה לפני ניסיון נוסף.");
}
