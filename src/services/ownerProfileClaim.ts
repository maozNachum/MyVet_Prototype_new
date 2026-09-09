import { supabase } from "./supabaseClient";

export type OwnerProfileClaimErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EMAIL_NOT_VERIFIED"
  | "OWNER_PROFILE_AMBIGUOUS"
  | "OWNER_PROFILE_ALREADY_CLAIMED"
  | "OWNER_PROFILE_CLAIM_CONFLICT"
  | "OWNER_PROFILE_CLAIM_FAILED";

const ERROR_MESSAGES: Record<OwnerProfileClaimErrorCode, string> = {
  AUTH_REQUIRED: "החיבור למערכת פג. התחברו מחדש ונסו שוב.",
  AUTH_EMAIL_NOT_VERIFIED: "יש לאמת את כתובת האימייל לפני הכניסה לאזור האישי.",
  OWNER_PROFILE_AMBIGUOUS: "לא ניתן להשלים את חיבור החשבון אוטומטית. פנו למרפאה לקבלת עזרה.",
  OWNER_PROFILE_ALREADY_CLAIMED: "כרטיס הלקוח כבר מחובר לחשבון אחר. פנו למרפאה לקבלת עזרה.",
  OWNER_PROFILE_CLAIM_CONFLICT: "לא ניתן להשלים את חיבור החשבון כרגע. נסו שוב או פנו למרפאה.",
  OWNER_PROFILE_CLAIM_FAILED: "לא ניתן להשלים את חיבור החשבון כרגע. נסו שוב בעוד רגע.",
};

export class OwnerProfileClaimError extends Error {
  constructor(public readonly code: OwnerProfileClaimErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "OwnerProfileClaimError";
  }
}

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "");
  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return [value.code, value.message, value.details, value.hint]
    .filter((part) => typeof part === "string")
    .join(" ");
}

function claimErrorCode(error: unknown): OwnerProfileClaimErrorCode {
  const raw = errorText(error);
  for (const code of Object.keys(ERROR_MESSAGES) as OwnerProfileClaimErrorCode[]) {
    if (code !== "OWNER_PROFILE_CLAIM_FAILED" && raw.includes(code)) return code;
  }
  return "OWNER_PROFILE_CLAIM_FAILED";
}

export async function claimOwnerProfile() {
  const { data, error } = await supabase.rpc("claim_owner_profile");
  if (error) throw new OwnerProfileClaimError(claimErrorCode(error));
  return typeof data === "string" && data.trim() ? data : null;
}
