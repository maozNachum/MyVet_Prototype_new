export type StaffType = "vet" | "nurse" | "secretary";

export function getStaffType(): StaffType {
  const raw = localStorage.getItem("myvet_staff_type") as StaffType | null;
  if (raw === "vet" || raw === "nurse" || raw === "secretary") return raw;
  return "vet";
}

/**
 * הרשאת עריכת תיק רפואי:
 * וטרינר ואחות בלבד.
 * מזכירה יכולה לנהל תורים/לקוחות/שירות, אבל לא לערוך רשומות רפואיות.
 */
export function canEditMedicalRecords(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "nurse";
}

/**
 * הרשאת ביצוע טיפול / פתיחת רשומה רפואית:
 * וטרינר ואחות בלבד.
 */
export function canPerformTreatment(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "nurse";
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
 * וטרינר ומזכירה.
 */
export function canAccessReportsPage(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "secretary";
}

/**
 * דוחות כספיים:
 * וטרינר בלבד.
 */
export function canViewFinancialReports(): boolean {
  const st = getStaffType();
  return st === "vet";
}

/**
 * דוחות תפעוליים:
 * וטרינר ומזכירה.
 */
export function canViewOperationalReports(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "secretary";
}

export function getStaffLabel(type?: StaffType): string {
  const t = type || getStaffType();
  if (t === "vet") return "וטרינר";
  if (t === "nurse") return "אחות";
  return "מזכירה";
}

export function getStaffName(): string {
  const explicitName = localStorage.getItem("myvet_staff_name")?.trim();
  if (explicitName) return explicitName;
  return getStaffLabel();
}