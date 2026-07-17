import { supabase } from "./supabaseClient";

export type ExtractionConfidence = "not_found" | "low" | "medium" | "high";

export type ExtractedField = {
  value: string;
  confidence: ExtractionConfidence;
};

export type VaccinationExtraction = {
  vaccine_name: ExtractedField;
  vaccine_type: ExtractedField;
  manufacturer: ExtractedField;
  batch_number: ExtractedField;
  barcode_value: ExtractedField;
  given_date: ExtractedField;
  next_due_date: ExtractedField;
  expiry_date: ExtractedField;
  administered_by: ExtractedField;
  notes: ExtractedField;
};

export type DocumentExtraction = {
  document_kind: "vaccination_sticker" | "vaccination_book" | "medical_document" | "visit_summary" | "lab_result";
  vaccination: VaccinationExtraction;
  document: {
    title: ExtractedField;
    document_date: ExtractedField;
    summary: ExtractedField;
    test_name: ExtractedField;
    test_result: ExtractedField;
  };
  warnings: string[];
};

export type VaccinationDraft = Record<keyof VaccinationExtraction, string>;

export type DuplicateVaccination = {
  vaccination_id: string;
  vaccine_name: string;
  batch_number: string | null;
  given_date: string;
  manufacturer: string | null;
};

export class DocumentOcrError extends Error {
  constructor(public readonly code: string, public readonly duplicate?: DuplicateVaccination) {
    super(code);
  }
}

async function postDocumentOcr(formData: FormData) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new DocumentOcrError("AUTH_REQUIRED");

  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  const response = await fetch(`${baseUrl}/functions/v1/document-ocr`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    body: formData,
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new DocumentOcrError(
      typeof body.error === "string" ? body.error : "DOCUMENT_OCR_FAILED",
      body.duplicate as DuplicateVaccination | undefined,
    );
  }
  return body;
}

function baseForm(action: "extract" | "save", petId: number, file: File, documentKind: DocumentExtraction["document_kind"]) {
  const form = new FormData();
  form.set("action", action);
  form.set("petId", String(petId));
  form.set("documentKind", documentKind);
  form.set("file", file);
  return form;
}

export async function extractVaccinationDocument(petId: number, file: File) {
  return extractDocument(petId, file, "vaccination_sticker");
}

export async function extractDocument(
  petId: number,
  file: File,
  documentKind: DocumentExtraction["document_kind"],
) {
  const body = await postDocumentOcr(baseForm("extract", petId, file, documentKind));
  return body.extraction as DocumentExtraction;
}

export async function saveExtractedVaccination(
  petId: number,
  file: File,
  draft: VaccinationDraft,
  duplicateConfirmed: boolean,
) {
  const form = baseForm("save", petId, file, "vaccination_sticker");
  form.set("draft", JSON.stringify(draft));
  form.set("duplicateConfirmed", String(duplicateConfirmed));
  const body = await postDocumentOcr(form);
  return body.vaccination as Record<string, unknown>;
}

export function documentOcrErrorMessage(error: unknown) {
  const code = error instanceof DocumentOcrError ? error.code : "DOCUMENT_OCR_FAILED";
  const messages: Record<string, string> = {
    AI_FEATURE_DISABLED: "סריקת המסמכים עדיין אינה פעילה בסביבה זו. אפשר להמשיך בהזנה ידנית.",
    FILE_TOO_LARGE: "הקובץ גדול מדי. ניתן להעלות קובץ עד 8MB.",
    INVALID_FILE: "הקובץ ריק או פגום. בחרו קובץ אחר.",
    UNSUPPORTED_FILE: "ניתן להעלות רק JPEG, PNG או PDF תקין.",
    ACCESS_DENIED: "אין הרשאה לבצע סריקה עבור בעל החיים הזה.",
    AUTH_REQUIRED: "ההתחברות פגה. התחברו מחדש ונסו שוב.",
    AI_OUTPUT_INVALID: "לא הצלחנו לקרוא את המסמך בבטחה. אפשר לנסות שוב או להזין ידנית.",
    AI_PROVIDER_TIMEOUT: "הסריקה נמשכה זמן רב מדי. הקובץ נשמר בטופס ואפשר לנסות שוב.",
    AI_PROVIDER_UNAVAILABLE: "שירות הסריקה אינו זמין כרגע. אפשר להמשיך בהזנה ידנית.",
  };
  return messages[code] || "לא הצלחנו לסרוק את המסמך. אפשר לנסות שוב או להמשיך בהזנה ידנית.";
}
