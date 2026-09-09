import type { StaffType } from "../app/data/staffAuth";

export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;
export const PASSWORD_POLICY_MESSAGE =
  "הסיסמה חייבת להכיל לפחות 12 תווים, אות גדולה, אות קטנה, מספר וסימן מיוחד.";

const STAFF_MFA_ROLES = new Set<StaffType>(["clinic_admin", "vet"]);

export function requiresStaffMfa(role: StaffType): boolean {
  return STAFF_MFA_ROLES.has(role);
}
