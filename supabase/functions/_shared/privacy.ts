export type RedactionReport = { total: number; categories: string[] };

const SENSITIVE_KEYS = [
  /(^|_)(owner|client|customer|patient)(_|$)/i,
  /ownerName|clientName|customerName|patientName/i,
  /ownerId|owner_id|auth_user_id|sender_owner_id|staff_id|user_id/i,
  /first.?name|last.?name|full.?name|sender_name|display_name/i,
  /pet.?name|animal.?name/i,
  /phone|mobile|tel|email|address|street|city|postal|zip/i,
  /identity|idNumber|id_number|tz|teudat|תז|תעודת/i,
  /birth|dob|birthday|microchip|chip/i,
  /payment|card|credit|token|bank|account/i,
  /file_url|file_path|download|meeting_url|url|signature|password|secret|api.?key/i,
];

const MAX_DEPTH = 6;
const MAX_ARRAY = 60;
const MAX_TEXT = 900;

type Tracker = { total: number; categories: Set<string> };

function trackedReplace(text: string, pattern: RegExp, replacement: string, category: string, tracker: Tracker) {
  let count = 0;
  const next = text.replace(pattern, () => {
    count += 1;
    return replacement;
  });
  if (count > 0) {
    tracker.total += count;
    tracker.categories.add(category);
  }
  return next;
}

export function redactText(value: string, tracker: Tracker = { total: 0, categories: new Set() }) {
  let text = value;
  text = trackedReplace(text, /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REMOVED]", "email", tracker);
  text = trackedReplace(text, /(?:\+?972[-\s]?)?0?5\d[-\s]?\d{3}[-\s]?\d{4}\b/g, "[PHONE_REMOVED]", "phone", tracker);
  text = trackedReplace(text, /\b(?:\d[\s-]?){9}\b/g, "[IDENTIFIER_REMOVED]", "identity", tracker);
  text = trackedReplace(text, /\b(?:\d[ -]?){12,19}\b/g, "[PAYMENT_REMOVED]", "payment", tracker);
  text = trackedReplace(text, /\b\d{15}\b/g, "[MICROCHIP_REMOVED]", "microchip", tracker);
  text = trackedReplace(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[INTERNAL_ID_REMOVED]", "internal-id", tracker);
  text = trackedReplace(text, /https?:\/\/[^\s)\]}]+/gi, "[LINK_REMOVED]", "link", tracker);
  text = trackedReplace(text, /(?:כתובת|רחוב|רח׳|שדרות|שד׳|דרך)\s*[:\-]?\s*[^\n,;.!?]{2,70}/gi, "[ADDRESS_REMOVED]", "address", tracker);
  text = trackedReplace(text, /(?:שם\s*(?:מלא|הבעלים|הלקוח)|בעלים|לקוח(?:ה)?)\s*[:\-]\s*[^\n,;.!?]{2,60}/gi, "[NAME_REMOVED]", "name", tracker);
  return text.slice(0, MAX_TEXT);
}

function sanitize(value: unknown, depth: number, tracker: Tracker): unknown {
  if (depth > MAX_DEPTH) return "[TRIMMED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value, tracker);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1, tracker));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((pattern) => pattern.test(key))) {
        tracker.total += 1;
        tracker.categories.add("sensitive-field");
        continue;
      }
      result[key] = sanitize(item, depth + 1, tracker);
    }
    return result;
  }
  return redactText(String(value), tracker);
}

export function protectPayload<T>(value: T): { value: T; report: RedactionReport } {
  const tracker: Tracker = { total: 0, categories: new Set() };
  return {
    value: sanitize(value, 0, tracker) as T,
    report: { total: tracker.total, categories: [...tracker.categories] },
  };
}
