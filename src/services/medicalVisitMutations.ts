import { supabase } from "./supabaseClient";

export type MedicalVisitType =
  | "full_exam"
  | "vaccination"
  | "weight_check"
  | "prescription_only"
  | "lab"
  | "follow_up"
  | "note";

export interface AtomicMedicalEntryInput {
  submissionId: string;
  petId: number;
  appointmentId?: number | null;
  visitDate: string;
  visitType: MedicalVisitType;
  urgencyLevel: "normal" | "serious" | "critical";
  reason: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  followUpRequired: boolean;
  followUpNotes: string;
  entryData: Record<string, unknown>;
  vaccination?: {
    vaccineName: string;
    givenDate: string;
    nextDueDate?: string;
    notes?: string;
  } | null;
  physicalExam?: { findings: string } | null;
  problems: Array<{
    problemText: string;
    severity: "normal" | "serious" | "critical";
    status: "active" | "improved" | "resolved";
    notes?: string;
  }>;
  differentials: Array<{
    diagnosisText: string;
    likelihood: "low" | "possible" | "likely";
    notes?: string;
  }>;
  prescriptions: Array<{
    medication: string;
    dosage: string;
    frequency: string;
    duration: string;
    startDate: string;
  }>;
  labs: Array<{
    testName: string;
    category: "blood" | "urine" | "imaging" | "biopsy" | "other";
    testDate?: string;
    urgent: boolean;
    notes?: string;
  }>;
  weight?: number | null;
}

export interface AtomicMedicalEntryResult {
  visitId: number;
  patientId: number;
  appointmentId: number | null;
  visitDate: string;
  vetName: string;
  reason: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  visitType: MedicalVisitType;
  urgencyLevel: "normal" | "serious" | "critical";
  finalDiagnosis: string;
  followUpRequired: boolean;
  followUpNotes: string;
  entryData: Record<string, unknown> | null;
  idempotentReplay: boolean;
}

const ERROR_MESSAGES: Array<[string, string]> = [
  ["APPOINTMENT_ALREADY_COMPLETED", "התור כבר הושלם וקיימת עבורו רשומה רפואית"],
  ["APPOINTMENT_VISIT_ALREADY_EXISTS", "כבר קיימת רשומה רפואית לתור הזה"],
  ["APPOINTMENT_CANCELLED", "לא ניתן להוסיף טיפול לתור שבוטל"],
  ["APPOINTMENT_PET_MISMATCH", "התור אינו שייך לבעל החיים שנבחר"],
  ["APPOINTMENT_NOT_FOUND", "התור לא נמצא או שאינו שייך למרפאה הנוכחית"],
  ["MEDICAL_STAFF_REQUIRED", "הפעולה זמינה לצוות רפואי מורשה בלבד"],
  ["PET_NOT_FOUND", "בעל החיים לא נמצא במרפאה הנוכחית"],
  ["IDEMPOTENCY_KEY_REUSED", "לא ניתן להשתמש שוב בבקשת השמירה הזו"],
  ["INVALID_VISIT_DATE", "תאריך הביקור חסר או אינו תקין"],
  ["INVALID_PRESCRIPTION", "יש להשלים את כל פרטי המרשם ולוודא שהם תקינים"],
  ["INVALID_MEDICAL_PROBLEM", "אחד מפרטי הבעיה הרפואית חסר או אינו תקין"],
  ["INVALID_DIFFERENTIAL_DIAGNOSIS", "אחת האבחנות המבדלות חסרה או אינה תקינה"],
  ["INVALID_LAB_ORDER", "אחד מפרטי בדיקת המעבדה חסר או אינו תקין"],
  ["INVALID_VACCINATION", "פרטי החיסון חסרים או אינם תקינים"],
  ["INVALID_MEDICAL_ENTRY_DETAILS", "אחד מפרטי הרשומה חסר או ארוך מדי"],
  ["INVALID_MEDICAL_ENTRY_COLLECTIONS", "נוספו יותר מדי פריטים לרשומה הרפואית"],
  ["WEIGHT_REQUIRED", "חובה להזין משקל"],
  ["INVALID_WEIGHT", "המשקל שהוזן אינו תקין"],
  ["AUTH_REQUIRED", "החיבור למערכת פג. התחברו מחדש ונסו שוב"],
];

function medicalEntryError(error: unknown) {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
  const match = ERROR_MESSAGES.find(([code]) => raw.includes(code));
  return new Error(match?.[1] || "לא הצלחנו לשמור את הרשומה הרפואית");
}

function requireResult(value: unknown): AtomicMedicalEntryResult {
  if (!value || typeof value !== "object") throw new Error("לא התקבלה תשובת שמירה תקינה");
  const result = value as Partial<AtomicMedicalEntryResult>;
  const visitId = Number(result.visitId);
  const patientId = Number(result.patientId);
  const appointmentId = result.appointmentId == null ? null : Number(result.appointmentId);
  const visitTypes: MedicalVisitType[] = ["full_exam", "vaccination", "weight_check", "prescription_only", "lab", "follow_up", "note"];
  const urgencyLevels: AtomicMedicalEntryResult["urgencyLevel"][] = ["normal", "serious", "critical"];
  if (!Number.isSafeInteger(visitId) || visitId <= 0 || !Number.isSafeInteger(patientId) || patientId <= 0) {
    throw new Error("לא התקבלה תשובת שמירה תקינה");
  }
  if (appointmentId !== null && (!Number.isSafeInteger(appointmentId) || appointmentId <= 0)) {
    throw new Error("לא התקבלה תשובת שמירה תקינה");
  }
  if (!visitTypes.includes(result.visitType as MedicalVisitType)
      || !urgencyLevels.includes(result.urgencyLevel as AtomicMedicalEntryResult["urgencyLevel"])) {
    throw new Error("לא התקבלה תשובת שמירה תקינה");
  }
  return {
    visitId,
    patientId,
    appointmentId,
    visitDate: String(result.visitDate || ""),
    vetName: String(result.vetName || "צוות רפואי"),
    reason: String(result.reason || ""),
    diagnosis: String(result.diagnosis || ""),
    treatment: String(result.treatment || ""),
    notes: String(result.notes || ""),
    visitType: result.visitType as MedicalVisitType,
    urgencyLevel: result.urgencyLevel,
    finalDiagnosis: String(result.finalDiagnosis || result.diagnosis || ""),
    followUpRequired: Boolean(result.followUpRequired),
    followUpNotes: String(result.followUpNotes || ""),
    entryData: result.entryData && typeof result.entryData === "object" ? result.entryData : null,
    idempotentReplay: Boolean(result.idempotentReplay),
  };
}

export async function saveMedicalEntryAtomic(input: AtomicMedicalEntryInput) {
  const { submissionId, ...payload } = input;
  const { data, error } = await supabase.rpc("myvet_save_medical_entry", {
    requested_submission_id: submissionId,
    requested_payload: payload,
  });
  if (error) throw medicalEntryError(error);
  return requireResult(data);
}
