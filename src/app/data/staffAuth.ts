export type StaffType = "vet" | "nurse" | "secretary";

export function getStaffType(): StaffType {
  const raw = localStorage.getItem("myvet_staff_type") as StaffType | null;
  if (raw === "vet" || raw === "nurse" || raw === "secretary") return raw;
  return "vet";
}

export function canEditMedicalRecords(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "nurse" || st === "secretary";
}

export function canPerformTreatment(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "nurse";
}

export function isInternalChatOnly(): boolean {
  const st = getStaffType();
  return st === "nurse" || st === "secretary";
}

export function canAccessReportsPage(): boolean {
  const st = getStaffType();
  return st === "vet" || st === "secretary";
}

export function canViewFinancialReports(): boolean {
  const st = getStaffType();
  return st === "vet";
}

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
