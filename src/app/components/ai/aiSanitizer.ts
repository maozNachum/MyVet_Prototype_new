const SENSITIVE_KEY_PATTERNS = [
  /(^|_)(owner|client|customer)(_|$)/i,
  /ownerId|owner_id|auth_user_id|sender_owner_id/i,
  /phone|mobile|tel|email|address|street/i,
  /identity|idNumber|tz|teudat|תז|תעודת/i,
  /microchip|chip/i,
  /payment|card|credit|token/i,
  /file_url|file_path|download|url/i,
  /sender_name|ownerName|clientName|customerName|petName/i,
];

const MAX_STRING_LENGTH = 900;
const MAX_ARRAY_ITEMS = 60;
const MAX_DEPTH = 6;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/05\d[-\s]?\d{7}/g, "[phone]")
    .replace(/\b\d{9}\b/g, "[id]")
    .slice(0, MAX_STRING_LENGTH);
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeInternal(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[trimmed]";

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeInternal(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      result[key] = sanitizeInternal(item, depth + 1);
    }
    return result;
  }

  return String(value).slice(0, MAX_STRING_LENGTH);
}

export function sanitizeAiContext<T>(value: T): T {
  return sanitizeInternal(value, 0) as T;
}

export function compactText(value: string, maxLength = 700) {
  return sanitizeText(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}
