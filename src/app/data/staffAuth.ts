export type StaffType = "vet" | "nurse" | "secretary";

export function getStaffType(): StaffType {
  return (localStorage.getItem("myvet_staff_type") as StaffType) || "vet";
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
  return t === "vet" ? "וטרינר" : t === "nurse" ? "אחות" : "מזכירה";
}

// ── הפונקציה החדשה שמחזירה את שם איש הצוות ──
export function getStaffName(): string {
  const t = getStaffType();
  switch (t) {
    case "vet": 
      return 'ד"ר יוסי כהן';
    case "nurse": 
      return 'אורלי כץ';
    case "secretary": 
      return 'מיכל אהרוני';
    default: 
      return 'צוות מרפאה';
  }
}