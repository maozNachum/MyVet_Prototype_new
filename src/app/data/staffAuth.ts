export type StaffType = "clinic_admin" | "vet" | "nurse" | "secretary";

const STAFF_SESSION_KEYS = [
  "myvet_staff_type",
  "myvet_staff_name",
  "myvet_staff_email",
  "myvet_staff_id",
] as const;

export function clearStaffSession(): void {
  STAFF_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getStaffType(): StaffType {
  const raw = localStorage.getItem("myvet_staff_type") as StaffType | null;
  if (raw === "clinic_admin" || raw === "vet" || raw === "nurse" || raw === "secretary") return raw;
  return "vet";
}

/**
 * הרשאת עריכת תיק רפואי:
 * מנהל מרפאה, וטרינר ואחות.
 * מזכירה יכולה לנהל תורים/לקוחות/שירות, אבל לא לערוך רשומות רפואיות.
 */
export function canEditMedicalRecords(): boolean {
  const st = getStaffType();
  return st === "clinic_admin" || st === "vet" || st === "nurse";
}

/**
 * הרשאת ביצוע טיפול / פתיחת רשומה רפואית:
 * מנהל מרפאה, וטרינר ואחות.
 */
export function canPerformTreatment(): boolean {
  const st = getStaffType();
  return st === "clinic_admin" || st === "vet" || st === "nurse";
}

/**
 * צ׳אט פנימי/תפעולי בלבד:
 * אחות ומזכירה.
 */
export function isInternalChatOnly(): boolean {
  const st = getStaffType();
  return st === "nurse" || st === "secretary";
}

/**
 * גישה לדוחות:
 * מנהל מרפאה, וטרינר ומזכירה.
 */
export function canAccessReportsPage(): boolean {
  const st = getStaffType();
  return st === "clinic_admin" || st === "vet" || st === "secretary";
}

/**
 * דוחות כספיים:
 * מנהל מרפאה ווטרינר.
 */
export function canViewFinancialReports(): boolean {
  const st = getStaffType();
  return st === "clinic_admin" || st === "vet";
}

/**
 * דוחות תפעוליים:
 * מנהל מרפאה, וטרינר ומזכירה.
 */
export function canViewOperationalReports(): boolean {
  const st = getStaffType();
  return st === "clinic_admin" || st === "vet" || st === "secretary";
}

export function getStaffLabel(type?: StaffType): string {
  const t = type || getStaffType();
  if (t === "clinic_admin") return "מנהל מרפאה";
  if (t === "vet") return "וטרינר";
  if (t === "nurse") return "אחות";
  return "מזכירה";
}

export function getStaffName(): string {
  const explicitName = localStorage.getItem("myvet_staff_name")?.trim();
  if (explicitName) return explicitName;
  return getStaffLabel();
}

/**
 * מזהה רשומת איש הצוות המחובר מתוך הסשן המקומי.
 * staff_id הוא UUID ב-Supabase, לכן ערך לא תקין לא נשלח לעמודות UUID.
 */
export function getStaffId(): string | null {
  const value = localStorage.getItem("myvet_staff_id")?.trim() || "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value) ? value : null;
}
