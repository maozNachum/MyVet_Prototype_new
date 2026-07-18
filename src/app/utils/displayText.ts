const BROKEN_ENCODING_PATTERN = /(?:׳[^\s]){2,}|�|(?:Ã|Â){2,}/u;

/** Keep legacy encoding damage out of the UI without mutating source records. */
export function safeHebrewLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").normalize("NFC").trim();
  return !text || BROKEN_ENCODING_PATTERN.test(text) ? fallback : text;
}
