/**
 * Strips common quote/apostrophe characters (Hebrew and Latin) and normalises
 * whitespace so that searches are resilient to punctuation differences.
 */
export function normalizeSearchString(str: string): string {
  return str
    .replace(/[\u0022\u0027\u05F3\u05F4\u201C\u201D\u2018\u2019\u05F4\u05F3״׳"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
