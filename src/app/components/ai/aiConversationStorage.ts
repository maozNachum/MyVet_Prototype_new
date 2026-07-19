const STORAGE_PREFIX = "myvet_vetbot_conversation_v2:";
const LEGACY_STORAGE_PREFIXES = ["myvet_vetbot_conversation:"];
const MAX_STORED_MESSAGES = 30;

export type AiConversationContextIdentity = {
  key: string;
  label: string;
};

function normalizeIsraeliDatesForRequest(value: string) {
  return value.replace(/\b([0-3]?\d)[./]([01]?\d)[./](20\d{2})\b/g, (original, dayText, monthText, yearText) => {
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() !== year
      || candidate.getUTCMonth() !== month - 1
      || candidate.getUTCDate() !== day
    ) return original;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

export function buildAiContinuationQuestion(
  history: Array<{ role: string; content: string }>,
  question: string,
) {
  const current = question.trim().slice(0, 1_600);
  const startsNewActionOrTopic = /(?:תשריין|שריין|תאם|תקבע|קבע|הזז|תזיז|דחה|תדחה|הקדם|תקדים|בטל|תבטל|וותר|תוותר|הוסף|להוסיף|הפחת|להפחית|צור|ליצור|פתח|חסום|תחסום|ארכיון|דחוף|דחיפות|מלאי|יומן|דוחות|מטופלים|לקוחות|אשפוזים|מעבדה|נושא אחר|עזוב|לא משנה|במקום זה|עכשיו אני רוצה|בוא נדבר)/.test(current);
  if (startsNewActionOrTopic) return normalizeIsraeliDatesForRequest(current);

  const previousUserMessages = history
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content.trim().slice(0, 900))
    .filter(Boolean)
    .slice(-4);
  const turns = [...previousUserMessages, current].filter((value, index, values) => value && value !== values[index - 1]);
  return normalizeIsraeliDatesForRequest(turns.join("\n").slice(-1_600));
}

type StoredConversation<T> = {
  messages: T[];
  memorySummary?: string;
  activeContext?: AiConversationContextIdentity;
  historyStartIndex?: number;
  updatedAt: number;
};

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAiConversation<T>(scope: string): StoredConversation<T> {
  const empty: StoredConversation<T> = { messages: [], memorySummary: "", activeContext: undefined, historyStartIndex: 0, updatedAt: 0 };
  const storage = getStorage();
  if (!storage) return empty;

  try {
    LEGACY_STORAGE_PREFIXES.forEach((prefix) => storage.removeItem(`${prefix}${scope}`));
    const raw = storage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoredConversation<T>>;
    if (!Array.isArray(parsed.messages)) return empty;
    const messages = parsed.messages.slice(-MAX_STORED_MESSAGES);
    const trimmedCount = Math.max(0, parsed.messages.length - messages.length);
    const storedHistoryStart = typeof parsed.historyStartIndex === "number" ? parsed.historyStartIndex : 0;
    const activeContext = parsed.activeContext && typeof parsed.activeContext.key === "string" && typeof parsed.activeContext.label === "string"
      ? parsed.activeContext
      : undefined;
    return {
      messages,
      memorySummary: typeof parsed.memorySummary === "string" ? parsed.memorySummary : "",
      activeContext,
      historyStartIndex: Math.max(0, Math.min(messages.length, storedHistoryStart - trimmedCount)),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    storage.removeItem(`${STORAGE_PREFIX}${scope}`);
    return empty;
  }
}

export function saveAiConversation<T>(
  scope: string,
  messages: T[],
  memorySummary = "",
  metadata: { activeContext?: AiConversationContextIdentity; historyStartIndex?: number } = {},
) {
  const storage = getStorage();
  if (!storage) return;

  const storedMessages = messages.slice(-MAX_STORED_MESSAGES);
  const trimmedCount = Math.max(0, messages.length - storedMessages.length);
  const snapshot: StoredConversation<T> = {
    messages: storedMessages,
    memorySummary,
    activeContext: metadata.activeContext,
    historyStartIndex: Math.max(0, Math.min(storedMessages.length, (metadata.historyStartIndex || 0) - trimmedCount)),
    updatedAt: Date.now(),
  };

  try {
    storage.setItem(`${STORAGE_PREFIX}${scope}`, JSON.stringify(snapshot));
  } catch {
    // The chat remains usable in memory when browser storage is unavailable or full.
  }
}

export function getAiContextTransitionMessage(
  previous: AiConversationContextIdentity | undefined,
  next: AiConversationContextIdentity,
) {
  if (!previous || previous.key === next.key) return null;
  return `עברת להקשר חדש — ${next.label}. השיחה נשמרה, אבל VetBot משתמש מעכשיו רק בהקשר החדש.`;
}

export function clearAiConversations() {
  const storage = getStorage();
  if (!storage) return;

  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && [STORAGE_PREFIX, ...LEGACY_STORAGE_PREFIXES].some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export const AI_CONVERSATION_STORAGE_PREFIX = STORAGE_PREFIX;
