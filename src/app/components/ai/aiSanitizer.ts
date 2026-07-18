const SENSITIVE_KEY_PATTERNS = [
  /(^|_)(owner|client|customer|patient)(_|$)/i,
  /ownerName|clientName|customerName|patientName/i,
  /ownerId|owner_id|auth_user_id|sender_owner_id|staff_id|user_id/i,
  /first.?name|last.?name|full.?name|sender_name|display_name/i,
  /pet.?name|animal.?name/i,
  /phone|mobile|tel|email|address|street|city|postal|zip/i,
  /identity|idNumber|id_number|tz|teudat|תז|תעודת/i,
  /birth|dob|birthday/i,
  /microchip|chip/i,
  /payment|card|credit|token|bank|account/i,
  /file_url|file_path|download|meeting_url|url/i,
  /signature|password|secret|api.?key/i,
];

const MAX_STRING_LENGTH = 900;
const MAX_ARRAY_ITEMS = 60;
const MAX_DEPTH = 6;

export type AiRedactionCategory =
  | "email"
  | "phone"
  | "identity"
  | "payment"
  | "address"
  | "name"
  | "microchip"
  | "link"
  | "internal-id"
  | "sensitive-field";

export interface AiRedactionReport {
  total: number;
  categories: AiRedactionCategory[];
}

type RedactionTracker = {
  total: number;
  categories: Set<AiRedactionCategory>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mark(tracker: RedactionTracker | undefined, category: AiRedactionCategory, count = 1) {
  if (!tracker || count <= 0) return;
  tracker.total += count;
  tracker.categories.add(category);
}

function replaceTracked(
  value: string,
  pattern: RegExp,
  replacement: string,
  category: AiRedactionCategory,
  tracker?: RedactionTracker,
) {
  let count = 0;
  const next = value.replace(pattern, () => {
    count += 1;
    return replacement;
  });
  mark(tracker, category, count);
  return next;
}

/**
 * Removes direct identifiers before text can leave the browser. The same policy
 * is repeated in the Edge Function because client-side filtering alone is not a
 * security boundary.
 */
export function redactSensitiveText(value: string, tracker?: RedactionTracker) {
  let text = value;
  text = replaceTracked(text, /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[דוא״ל הוסר]", "email", tracker);
  text = replaceTracked(text, /(?:\+?972[-\s]?)?0?5\d[-\s]?\d{3}[-\s]?\d{4}\b/g, "[טלפון הוסר]", "phone", tracker);
  text = replaceTracked(text, /\b(?:\d[\s-]?){9}\b/g, "[מזהה הוסר]", "identity", tracker);
  text = replaceTracked(text, /\b(?:\d[ -]?){12,19}\b/g, "[פרטי תשלום הוסרו]", "payment", tracker);
  text = replaceTracked(text, /\b\d{15}\b/g, "[שבב הוסר]", "microchip", tracker);
  text = replaceTracked(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[מזהה פנימי הוסר]", "internal-id", tracker);
  text = replaceTracked(text, /https?:\/\/[^\s)\]}]+/gi, "[קישור הוסר]", "link", tracker);
  text = replaceTracked(
    text,
    /(?:(?:כתובת|רחוב|רח׳|שדרות|שד׳)\s*[:\-]?\s*[^\n,;.!?]{2,70}|דרך\s+[\p{L}\s'״׳-]{2,50}\s+\d{1,4})/giu,
    "[כתובת הוסרה]",
    "address",
    tracker,
  );
  text = replaceTracked(
    text,
    /(?:שם\s*(?:מלא|הבעלים|הלקוח)|בעלים|לקוח(?:ה)?)\s*[:\-]\s*[^\n,;.!?]{2,60}/gi,
    "[שם הוסר]",
    "name",
    tracker,
  );
  return text.slice(0, MAX_STRING_LENGTH);
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeInternal(value: unknown, depth: number, tracker?: RedactionTracker): unknown {
  if (depth > MAX_DEPTH) return "[מידע קוצר]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitiveText(value, tracker);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeInternal(item, depth + 1, tracker));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        mark(tracker, "sensitive-field");
        continue;
      }
      result[key] = sanitizeInternal(item, depth + 1, tracker);
    }
    return result;
  }

  return redactSensitiveText(String(value), tracker);
}

export function protectAiPayload<T>(value: T): { value: T; report: AiRedactionReport } {
  const tracker: RedactionTracker = { total: 0, categories: new Set() };
  const sanitized = sanitizeInternal(value, 0, tracker) as T;
  return {
    value: sanitized,
    report: { total: tracker.total, categories: Array.from(tracker.categories) },
  };
}

export function sanitizeAiContext<T>(value: T): T {
  return protectAiPayload(value).value;
}

export function compactText(value: string, maxLength = 700) {
  return redactSensitiveText(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}
