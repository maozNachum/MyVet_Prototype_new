export type StaffType = "vet" | "nurse" | "secretary";

export function getStaffType(): StaffType {
  return (localStorage.getItem("myvet_staff_type") as StaffType) || "vet";
}

export function canEditMedicalRecords(): boolean {
  return getStaffType() !== "secretary";
}

export function isInternalChatOnly(): boolean {
  const st = getStaffType();
  return st === "nurse" || st === "secretary";
}

export function getStaffLabel(type?: StaffType): string {
  const t = type || getStaffType();
  return t === "vet" ? "וטרינר" : t === "nurse" ? "אחות" : "מזכירה";
}
