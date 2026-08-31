import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

export type VetBotRole = "clinic_admin" | "vet" | "nurse" | "secretary" | "owner";

export type VetBotActionType =
  | "book_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "adjust_inventory"
  | "create_inventory_item"
  | "archive_conversation"
  | "restore_conversation"
  | "set_conversation_priority"
  | "set_lab_urgency"
  | "block_booking_time"
  | "draft_message"
  | "navigate"
  | "forbidden"
  | "none";

export interface ModelActionProposal {
  type?: VetBotActionType;
  intentSummary?: string;
  missingFields?: string[];
  patientName?: string;
  patientSpecies?: string;
  appointmentRef?: number;
  appointmentDate?: string;
  appointmentTime?: string;
  currentAppointmentDate?: string;
  currentAppointmentTime?: string;
  appointmentType?: string;
  appointmentMode?: "physical" | "video";
  urgency?: "normal" | "urgent";
  itemName?: string;
  inventoryOperation?: "set" | "add" | "remove";
  quantity?: number;
  itemCategory?: "medication" | "equipment" | "consumable" | "other";
  lowStockThreshold?: number;
  unitPrice?: number;
  conversationRef?: number;
  priority?: "normal" | "urgent";
  labOrderRef?: number;
  testName?: string;
  isUrgent?: boolean;
  blockDate?: string;
  blockStart?: string;
  blockEnd?: string;
  allDay?: boolean;
  reason?: string;
}

export interface VetBotActionPlan {
  requestId?: string;
  type: VetBotActionType;
  status: "needs_details" | "needs_confirmation" | "blocked" | "executed" | "rejected" | "failed";
  title: string;
  summary: string;
  missingFields: string[];
  details: Array<{ label: string; value: string }>;
  destructive?: boolean;
  confirmationLabel?: string;
}

export const VETBOT_ACTION_CATALOG = [
  { type: "book_appointment", description: "קביעת תור פנוי למטופל", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: ["patientName או patientRef", "appointmentDate", "appointmentTime", "appointmentType"] },
  { type: "reschedule_appointment", description: "שינוי מועד של תור קיים", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: ["appointmentRef או patientName והמועד הנוכחי", "appointmentDate", "appointmentTime"] },
  { type: "cancel_appointment", description: "ביטול תור קיים", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: ["appointmentRef או patientName והמועד הנוכחי"] },
  { type: "adjust_inventory", description: "שינוי כמות של פריט מלאי קיים", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["itemName", "inventoryOperation", "quantity"] },
  { type: "create_inventory_item", description: "יצירת פריט מלאי חדש לאחר אישור", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["itemName", "itemCategory", "quantity", "lowStockThreshold", "unitPrice"] },
  { type: "archive_conversation", description: "העברת השיחה הנבחרת לארכיון", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["conversationRef"] },
  { type: "restore_conversation", description: "החזרת השיחה הנבחרת מהארכיון", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["conversationRef"] },
  { type: "set_conversation_priority", description: "סימון שיחה כרגילה או דחופה", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["conversationRef", "priority"] },
  { type: "set_lab_urgency", description: "סימון בדיקת מעבדה פתוחה כרגילה או דחופה", roles: ["clinic_admin", "vet", "nurse"], required: ["labOrderRef או patientName ו-testName", "isUrgent"] },
  { type: "block_booking_time", description: "חסימת יום או טווח שעות לקביעת תורים", roles: ["clinic_admin", "secretary"], required: ["blockDate", "allDay או blockStart ו-blockEnd"] },
  { type: "draft_message", description: "יצירת טיוטה בלבד; VetBot לעולם לא שולח אותה", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: [] },
  { type: "navigate", description: "פתיחת מסך מורשה במערכת", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: [] },
  { type: "forbidden", description: "מחיקה של מטופל/לקוח, תשלום, הרשאות, אבחון, מרשם/מינון, שינוי רשומה רפואית, שחרור מאשפוז או שליחה ללקוח", roles: [], required: [] },
] as const;

const labels: Record<string, string> = {
  patientName: "שם המטופל",
  appointmentDate: "תאריך",
  appointmentTime: "שעה",
  appointmentType: "סוג התור",
  currentAppointmentDate: "מועד התור הנוכחי",
  itemName: "שם הפריט",
  inventoryOperation: "האם להגדיר, להוסיף או להפחית",
  quantity: "כמות",
  itemCategory: "קטגוריה",
  lowStockThreshold: "סף מלאי נמוך",
  unitPrice: "מחיר ליחידה",
  conversationRef: "שיחה נבחרת",
  priority: "רמת דחיפות",
  isUrgent: "האם הבדיקה רגילה או דחופה",
  labOrderRef: "בדיקת המעבדה",
  testName: "שם הבדיקה",
  blockDate: "תאריך החסימה",
  blockTime: "שעות החסימה",
};

function safeText(value: unknown, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeVetBotLookup(value: unknown) {
  return safeText(value, 240)
    .normalize("NFKC")
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/[׳״'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("he-IL");
}

export function buildVetBotActionConversationText(
  history: unknown,
  question: unknown,
) {
  const current = safeText(question, 1_600);
  const normalizedCurrent = normalizeVetBotLookup(current);
  const startsNewActionOrTopic = /(?:תשריין|שריין|תאם|תקבע|קבע|הזז|תזיז|דחה|תדחה|הקדם|תקדים|בטל|תבטל|וותר|תוותר|הוסף|להוסיף|הפחת|להפחית|צור|ליצור|פתח|חסום|תחסום|ארכיון|דחוף|דחיפות|מלאי|יומן|דוחות|מטופלים|לקוחות|אשפוזים|מעבדה|נושא אחר|עזוב|לא משנה|במקום זה|עכשיו אני רוצה|בוא נדבר)/.test(normalizedCurrent);
  if (startsNewActionOrTopic || !Array.isArray(history)) return current;

  const previousUserMessages = history
    .filter((entry) => entry && typeof entry === "object" && (entry as { role?: unknown }).role === "user")
    .map((entry) => safeText((entry as { content?: unknown }).content, 900))
    .filter(Boolean)
    .slice(-4);
  const turns = [...previousUserMessages, current].filter((value, index, values) => value && value !== values[index - 1]);
  return turns.join("\n").slice(-2_000);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function uniqueNameMatch<T>(rows: T[], targetValue: string, getName: (row: T) => unknown) {
  const target = normalizeVetBotLookup(targetValue);
  if (!target) return { row: null as T | null, ambiguous: false };
  const candidates = rows.map((row) => ({ row, name: normalizeVetBotLookup(getName(row)) })).filter((item) => item.name);
  const exact = candidates.filter((item) => item.name === target);
  if (exact.length === 1) return { row: exact[0].row, ambiguous: false };
  if (exact.length > 1) return { row: null as T | null, ambiguous: true };

  const partial = target.length >= 3
    ? candidates.filter((item) => item.name.includes(target) || target.includes(item.name))
    : [];
  if (partial.length === 1) return { row: partial[0].row, ambiguous: false };
  if (partial.length > 1) return { row: null as T | null, ambiguous: true };

  const ranked = candidates
    .map((item) => ({ ...item, distance: editDistance(target, item.name) }))
    .sort((a, b) => a.distance - b.distance);
  const maximumDistance = target.length <= 3 ? 1 : Math.max(1, Math.floor(target.length * 0.25));
  if (ranked[0] && ranked[0].distance <= maximumDistance && (!ranked[1] || ranked[0].distance < ranked[1].distance)) {
    return { row: ranked[0].row, ambiguous: false };
  }
  return { row: null as T | null, ambiguous: false };
}

function uniqueNameMatchInText<T>(rows: T[], sourceText: unknown, getName: (row: T) => unknown) {
  const tokens = normalizeVetBotLookup(sourceText).split(" ").filter((token) => token.length >= 2);
  if (!tokens.length) return { row: null as T | null, ambiguous: false };
  const matches = rows.filter((row) => {
    const name = normalizeVetBotLookup(getName(row));
    if (!name) return false;
    return tokens.some((token) => {
      const variants = [token, ...(/^[לבכהו]/.test(token) ? [token.slice(1)] : [])].filter((value) => value.length >= 2);
      return variants.some((variant) => {
        if (variant === name) return true;
        if (variant[0] !== name[0] || variant.length < name.length) return false;
        const maximumDistance = name.length <= 3 ? 1 : Math.max(1, Math.floor(name.length * 0.25));
        return editDistance(variant, name) <= maximumDistance;
      });
    });
  });
  if (matches.length === 1) return { row: matches[0], ambiguous: false };
  return { row: null as T | null, ambiguous: matches.length > 1 };
}

export function matchUniqueVetBotNameInTextForTest(names: string[], sourceText: unknown) {
  const match = uniqueNameMatchInText(names, sourceText, (name) => name);
  return { value: match.row, ambiguous: match.ambiguous };
}

export function inferInventoryOperation(value: unknown): ModelActionProposal["inventoryOperation"] {
  const text = normalizeVetBotLookup(value);
  if (/(^| )(הוסף|להוסיף|הגדל|להגדיל|הכנס|להכניס|נכנסו|הגיעו|קיבלנו|צרף|לצרף)( |$)/.test(text)) return "add";
  if (/(^| )(הפחת|להפחית|הורד|להוריד|גרע|לגרוע|הוצא|להוציא|נוצלו|נצרכו|השתמשנו|נמכרו|יצאו)( |$)/.test(text)) return "remove";
  if (/(^| )(הגדר|להגדיר|קבע|לקבוע|עדכן|לעדכן|שנה|לשנות|העמד|להעמיד)( |$)/.test(text) || /יש (עכשיו|כרגע)/.test(text)) return "set";
  return undefined;
}

function referenceFromText(text: string, label: string) {
  const match = text.match(new RegExp(`${label}(?: מספר)? (\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function israelDateWithOffset(days: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const shifted = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + days));
  return shifted.toISOString().slice(0, 10);
}

function appointmentDateFromText(text: string) {
  const absolute = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (absolute) return absolute[1];
  const israeli = text.match(/\b([0-3]?\d)[./]([01]?\d)[./](20\d{2})\b/);
  if (israeli) {
    const day = Number(israeli[1]);
    const month = Number(israeli[2]);
    const year = Number(israeli[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() === year
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === day
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/(^| )ל?מחרתיים( |$)/.test(text)) return israelDateWithOffset(2);
  if (/(^| )ל?מחר( |$)/.test(text)) return israelDateWithOffset(1);
  if (/(^| )ל?היום( |$)/.test(text)) return israelDateWithOffset(0);
  return undefined;
}

function appointmentTimeFromText(text: string) {
  const explicitMatches = [...text.matchAll(/(?:בשעה|בין|מ|^| )\s*(\d{1,2})(?::(\d{2}))?(?= |$)/g)];
  for (const explicit of explicitMatches) {
    const hour = Number(explicit[1]);
    const minute = Number(explicit[2] || 0);
    if (hour <= 23 && minute <= 59) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const wordHours: Record<string, number> = {
    אחת: 1, אחד: 1, שתיים: 2, שניים: 2, שלוש: 3, ארבע: 4, חמש: 5, שש: 6,
    שבע: 7, שמונה: 8, תשע: 9, עשר: 10, אחתעשרה: 11, שתיםעשרה: 12,
  };
  for (const [word, rawHour] of Object.entries(wordHours)) {
    if (!new RegExp(`(^| )(?:ב)?${word}( |$)`).test(text)) continue;
    let hour = rawHour;
    if (/(בערב|אחר הצהריים)/.test(text) && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }
  return undefined;
}

function appointmentTypeFromText(text: string) {
  const types = ["בדיקה כללית", "חיסון", "ביקורת", "מעקב", "ייעוץ", "חירום", "בדיקה"];
  return types.find((type) => text.includes(type));
}

export function refineVetBotActionProposal(
  proposal: ModelActionProposal | null | undefined,
  conversationText: unknown,
  mode?: string,
): ModelActionProposal | null | undefined {
  const refined: ModelActionProposal = { type: proposal?.type || "none", ...(proposal || {}) };
  const rawText = safeText(conversationText, 2_000);
  const text = normalizeVetBotLookup(conversationText);
  if (!text) return proposal;
  const prohibitedIntent = /(מחק|תמחק).*(מטופל|לקוח)|(?:בצע|חייב|סלוק).*(תשלום)|(?:תן|צור|שנה).*(מרשם|מינון)|(?:אבחן|תאבחן)|(?:שנה|תן).*(הרשאה)|(?:שחרר|תשחרר).*(אשפוז)|(?:שלח|תשלח).*(הודעה)/.test(text);
  if (!prohibitedIntent) {
    if (/(תשריין|שריין|תאם|תקבע|קבע).*(תור|מקום)/.test(text)) refined.type = "book_appointment";
    else if (/(הזז|תזיז|דחה|תדחה|הקדם|תקדים|שנה|תשנה).*(תור|מועד)/.test(text)) refined.type = "reschedule_appointment";
    else if (/(בטל|תבטל|וותר|תוותר|הסר).*(תור)/.test(text)) refined.type = "cancel_appointment";
    else if (/(החזר|תחזיר|פתח מחדש|תוציא).*(שיחה|ארכיון)/.test(text)) refined.type = "restore_conversation";
    else if (/(ארכיון|שים בצד|סגור).*(שיחה)|שיחה.*(ארכיון|שים בצד)/.test(text)) refined.type = "archive_conversation";
    else if (/(דחוף|דחיפות|קדימות|לא סובל(?:ת)? דיחוי|רגיל|לא דחוף).*(שיחה)|שיחה.*(דחוף|דחיפות|קדימות|לא סובל(?:ת)? דיחוי|רגיל|לא דחוף)/.test(text)) refined.type = "set_conversation_priority";
    else if (/(דחוף|דחיפות|קדימות|לא סובל(?:ת)? דיחוי|רגיל|לא דחוף).*(בדיקה|מעבדה)|(?:בדיקה|מעבדה).*(דחוף|דחיפות|קדימות|לא סובל(?:ת)? דיחוי|רגיל|לא דחוף)/.test(text)) refined.type = "set_lab_urgency";
    else if (/(חסום|תחסום|סגור|אל תאפשר).*(יומן|תור|קביע)/.test(text)) refined.type = "block_booking_time";
    else if (/(נסח|תנסח|כתוב|תכתוב).*(הודעה|עדכון)/.test(text)) refined.type = "draft_message";
    else if (!/(פריט|מוצר).*(חדש|חדשה)/.test(text) && /(קח אותי|תיקח אותי|העבר אותי|תעביר אותי|עבור|פתח).*(מסך|מלאי|יומן|תורים|מטופלים|לקוחות|פניות|אשפוזים|מעבדה|בדיקות|דוחות)/.test(text)) refined.type = "navigate";
  } else {
    refined.type = "forbidden";
  }

  refined.conversationRef ||= referenceFromText(text, "שיחה");
  refined.labOrderRef ||= referenceFromText(text, "בדיקה");
  refined.appointmentRef ||= referenceFromText(text, "תור");
  if (refined.type === "set_conversation_priority") {
    if (/(לא דחוף|רגיל)/.test(text)) refined.priority = "normal";
    else if (/(דחוף|דחיפות|קדימות|לא סובל(?:ת)? דיחוי)/.test(text)) refined.priority = "urgent";
  }
  if (refined.type === "set_lab_urgency") {
    if (/(לא דחוף|רגיל)/.test(text)) refined.isUrgent = false;
    else if (/(דחוף|דחיפות|קדימות|לא סובל(?:ת)? דיחוי)/.test(text)) refined.isUrgent = true;
  }
  if (refined.type === "book_appointment" || refined.type === "reschedule_appointment") {
    if (!dateValue(refined.appointmentDate)) refined.appointmentDate = appointmentDateFromText(rawText) || appointmentDateFromText(text);
    if (!timeValue(refined.appointmentTime)) refined.appointmentTime = appointmentTimeFromText(rawText) || appointmentTimeFromText(text);
    if (refined.type === "book_appointment") {
      refined.appointmentType ||= appointmentTypeFromText(text);
      if (/(וידאו|מרחוק|שיחת וידאו)/.test(text)) refined.appointmentMode = "video";
    }
  }
  if (refined.type === "block_booking_time") {
    if (!dateValue(refined.blockDate)) refined.blockDate = appointmentDateFromText(rawText);
    const times = [...rawText.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map((match) => `${match[1].padStart(2, "0")}:${match[2]}`);
    refined.blockStart ||= times[0];
    refined.blockEnd ||= times[1];
  }
  const inventoryContext = mode === "inventory" || text.includes("מלאי");
  const createIntent = inventoryContext && (
    /(צור|ליצור|פתח|לפתוח).*(פריט|מוצר)/.test(text)
    || /(הוסף|להוסיף|הכנס|להכניס|צרף|לצרף).*(פריט|מוצר).*(חדש|חדשה)/.test(text)
  );
  const inventoryOperation = inferInventoryOperation(text);
  if (createIntent && (refined.type === "adjust_inventory" || refined.type === "none")) {
    refined.type = "create_inventory_item";
    delete refined.inventoryOperation;
  } else if (inventoryContext && inventoryOperation && (refined.type === "none" || refined.type === "adjust_inventory")) {
    refined.type = "adjust_inventory";
    refined.inventoryOperation ||= inventoryOperation;
  }
  if (refined.type === "adjust_inventory" || refined.type === "create_inventory_item") {
    const quantityMatch = rawText.match(/(?:כמות|עוד|הגיעו|קיבלנו|השתמשנו ב|הוסף|הפחת)?\s*(\d+(?:\.\d+)?)/);
    if (refined.quantity === undefined && quantityMatch) refined.quantity = Number(quantityMatch[1]);
    if (!refined.itemName) {
      const nameMatch = rawText.match(/(?:בשם|של)\s+(.+?)(?=\s+(?:למלאי|במלאי|כמות|סף|מחיר|קטגוריה)|$)/);
      if (nameMatch) refined.itemName = safeText(nameMatch[1], 160);
    }
  }
  if (refined.type === "create_inventory_item") {
    const threshold = rawText.match(/סף(?: מלאי)?\s*(\d+)/);
    const price = rawText.match(/מחיר(?: ליחידה)?\s*(\d+(?:\.\d+)?)/);
    if (refined.lowStockThreshold === undefined && threshold) refined.lowStockThreshold = Number(threshold[1]);
    if (refined.unitPrice === undefined && price) refined.unitPrice = Number(price[1]);
    if (!refined.itemCategory) {
      if (/(תרופה|תרופות)/.test(text)) refined.itemCategory = "medication";
      else if (/(ציוד)/.test(text)) refined.itemCategory = "equipment";
      else if (/(מתכלה|מתכלים)/.test(text)) refined.itemCategory = "consumable";
      else if (/(אחר)/.test(text)) refined.itemCategory = "other";
    }
  }
  return refined.type ? refined : proposal;
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function dateValue(value: unknown) {
  const text = safeText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function timeValue(value: unknown) {
  const text = safeText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function localParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function contextNumber(context: unknown, path: string[]) {
  let current: any = context;
  for (const key of path) current = current && typeof current === "object" ? current[key] : undefined;
  const value = numeric(current);
  return value === null ? undefined : value;
}

function normalizedSpecies(value: unknown) {
  const normalized = normalizeVetBotLookup(value);
  if (["dog", "canine", "כלב", "כלבה"].includes(normalized)) return "dog";
  if (["cat", "feline", "חתול", "חתולה"].includes(normalized)) return "cat";
  return normalized;
}

function missingPlan(type: VetBotActionType, title: string, missing: string[], summary?: string, details: VetBotActionPlan["details"] = []): VetBotActionPlan {
  const unique = [...new Set(missing.map((item) => labels[item] || safeText(item, 60)).filter(Boolean))];
  return {
    type,
    status: "needs_details",
    title,
    summary: summary || `כדי להמשיך חסרים לי: ${unique.join(", ")}.`,
    missingFields: unique,
    details,
  };
}

function blockedPlan(summary: string): VetBotActionPlan {
  return {
    type: "forbidden",
    status: "blocked",
    title: "הפעולה אינה זמינה דרך VetBot",
    summary,
    missingFields: [],
    details: [],
    destructive: true,
  };
}

async function createPending(
  admin: SupabaseClient,
  actorId: string,
  role: VetBotRole,
  type: VetBotActionType,
  payload: Record<string, unknown>,
  plan: Omit<VetBotActionPlan, "requestId" | "status" | "type" | "missingFields">,
): Promise<VetBotActionPlan> {
  const preview = {
    title: safeText(plan.title, 100),
    summary: safeText(plan.summary, 300),
    details: plan.details.slice(0, 8).map((item) => ({ label: safeText(item.label, 50), value: safeText(item.value, 140) })),
    destructive: Boolean(plan.destructive),
  };
  const { data, error } = await admin
    .from("vetbot_action_requests")
    .insert({ actor_id: actorId, actor_role: role, action_type: type, payload, preview })
    .select("action_request_id")
    .single();
  if (error || !data?.action_request_id) throw new Error("ACTION_REQUEST_CREATE_FAILED");
  return {
    requestId: String(data.action_request_id),
    type,
    status: "needs_confirmation",
    title: preview.title,
    summary: preview.summary,
    missingFields: [],
    details: preview.details,
    destructive: preview.destructive,
    confirmationLabel: plan.confirmationLabel || "אישור וביצוע",
  };
}

async function resolvePatient(client: SupabaseClient, patientName: string, patientRef?: number, species?: string, sourceText?: unknown) {
  if (patientRef) {
    const { data } = await client.from("patients").select("pet_id,pet_name,species").eq("pet_id", patientRef).maybeSingle();
    return data ? { row: data, issue: "" } : { row: null, issue: "לא מצאתי מטופל מורשה התואם לבקשה." };
  }
  const { data, error } = await client.from("patients").select("pet_id,pet_name,species").limit(300);
  if (error || !Array.isArray(data)) return { row: null, issue: "לא הצלחתי לאמת את המטופל כרגע." };
  const speciesTarget = normalizedSpecies(species);
  const eligible = data.filter((row: any) => !speciesTarget || normalizedSpecies(row.species) === speciesTarget);
  const match = patientName
    ? uniqueNameMatch(eligible, patientName, (row: any) => row.pet_name)
    : { row: null, ambiguous: false };
  if (match.row) return { row: match.row, issue: "" };
  if (match.ambiguous) return { row: null, issue: "מצאתי יותר ממטופל אחד שמתאים לשם הזה. ציין גם את סוג החיה או פתח את התיק המתאים ובקש שוב." };
  const textMatch = uniqueNameMatchInText(eligible, sourceText, (row: any) => row.pet_name);
  if (textMatch.row) return { row: textMatch.row, issue: "" };
  if (textMatch.ambiguous) return { row: null, issue: "מצאתי יותר ממטופל אחד שמתאים לבקשה. ציין גם את סוג החיה או פתח את התיק המתאים ובקש שוב." };
  return { row: null, issue: "לא מצאתי מטופל מורשה בשם הזה. בדוק את השם ונסה שוב." };
}

async function resolveAvailableSlot(client: SupabaseClient, date: string, time: string) {
  const { data, error } = await client.rpc("myvet_available_slots", { range_start: date, range_end: date });
  if (error || !Array.isArray(data)) return { slot: null, alternatives: [] as string[] };
  const rows = data.map((row: any) => ({ row, local: localParts(String(row.slot_start)) }));
  const match = rows.find((item) => item.local.date === date && item.local.time === time);
  return {
    slot: match?.row || null,
    alternatives: rows.filter((item) => item.local.date === date).slice(0, 6).map((item) => item.local.time),
  };
}

async function resolveAppointment(client: SupabaseClient, proposal: ModelActionProposal, context: unknown, conversationText?: unknown) {
  const directRef = numeric(proposal.appointmentRef) ?? contextNumber(context, ["selectedAppointmentRef"]);
  if (directRef) {
    const { data } = await client.from("appointments").select("appointment_id,pet_id,start_time,end_time,appointment_type,appointment_mode,status").eq("appointment_id", directRef).neq("status", "cancelled").maybeSingle();
    if (data) {
      const patientResult = await client.from("patients").select("pet_id,pet_name,species").eq("pet_id", data.pet_id).maybeSingle();
      return { row: data, patient: patientResult.data || null, issue: "" };
    }
  }

  const patientRef = contextNumber(context, ["selectedPatientRef"]);
  const patient = await resolvePatient(client, safeText(proposal.patientName), patientRef, safeText(proposal.patientSpecies), conversationText);
  if (!patient.row) return { row: null, patient: null, issue: patient.issue || "ציין את שם המטופל של התור." };
  const currentDate = dateValue(proposal.currentAppointmentDate);
  const { data, error } = await client
    .from("appointments")
    .select("appointment_id,pet_id,start_time,end_time,appointment_type,appointment_mode,status")
    .eq("pet_id", patient.row.pet_id)
    .neq("status", "cancelled")
    .gte("start_time", currentDate ? `${currentDate}T00:00:00Z` : new Date(Date.now() - 86_400_000).toISOString())
    .order("start_time", { ascending: true })
    .limit(30);
  if (error || !Array.isArray(data)) return { row: null, patient: patient.row, issue: "לא הצלחתי לאמת את התור כרגע." };
  const currentTime = timeValue(proposal.currentAppointmentTime);
  const matches = data.filter((row: any) => {
    const local = localParts(String(row.start_time));
    return (!currentDate || local.date === currentDate) && (!currentTime || local.time === currentTime);
  });
  if (matches.length === 1) return { row: matches[0], patient: patient.row, issue: "" };
  if (matches.length > 1) return { row: null, patient: patient.row, issue: "יש למטופל כמה תורים מתאימים. ציין את התאריך והשעה של התור הנוכחי." };
  return { row: null, patient: patient.row, issue: "לא מצאתי תור עתידי התואם לפרטים שסיפקת." };
}

function roleAllows(role: VetBotRole, type: VetBotActionType) {
  const entry = VETBOT_ACTION_CATALOG.find((item) => item.type === type);
  return Boolean(entry && (entry.roles as readonly string[]).includes(role));
}

async function canAccessPet(client: SupabaseClient, role: VetBotRole, petId: number) {
  if (role !== "owner") return true;
  const { data, error } = await client.rpc("myvet_pet_owned", { candidate_pet_id: String(petId) });
  return !error && data === true;
}

export async function prepareVetBotAction({
  client,
  admin,
  actorId,
  role,
  proposal,
  context,
  conversationText,
}: {
  client: SupabaseClient;
  admin: SupabaseClient;
  actorId: string;
  role: VetBotRole;
  proposal: ModelActionProposal | null | undefined;
  context: unknown;
  conversationText?: unknown;
}): Promise<VetBotActionPlan | null> {
  const type = proposal?.type || "none";
  if (type === "none" || type === "navigate" || type === "draft_message") return null;
  if (type === "forbidden") return blockedPlan("כדי להגן על המשתמשים והמטופלים, VetBot אינו מבצע תשלומים, מחיקות של לקוחות או מטופלים, שינוי הרשאות, אבחון, מרשמים או מינונים, שינוי רשומה רפואית, שחרור מאשפוז או שליחת הודעות בפועל.");
  if (!roleAllows(role, type)) return blockedPlan("התפקיד המחובר אינו מורשה לבצע את הפעולה הזו דרך VetBot.");

  if (type === "book_appointment") {
    const patientRef = contextNumber(context, ["selectedPatientRef"]);
    const patientName = safeText(proposal?.patientName);
    const date = dateValue(proposal?.appointmentDate);
    const time = timeValue(proposal?.appointmentTime);
    const appointmentType = safeText(proposal?.appointmentType, 120);
    const missing = [!patientName && !patientRef && !safeText(conversationText) ? "patientName" : "", !date ? "appointmentDate" : "", !time ? "appointmentTime" : "", !appointmentType ? "appointmentType" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "קביעת תור", missing);
    const patient = await resolvePatient(client, patientName, patientRef, safeText(proposal?.patientSpecies), conversationText);
    if (!patient.row) return missingPlan(type, "קביעת תור", ["patientName"], patient.issue);
    if (!(await canAccessPet(client, role, Number(patient.row.pet_id)))) {
      return blockedPlan("לא ניתן לקבוע תור למטופל שאינו משויך לחשבון המחובר.");
    }
    const availability = await resolveAvailableSlot(client, date, time);
    if (!availability.slot) {
      const details = availability.alternatives.length ? [{ label: "שעות פנויות באותו יום", value: availability.alternatives.join(", ") }] : [];
      return missingPlan(type, "השעה שביקשת אינה פנויה", ["appointmentTime"], availability.alternatives.length ? "בחר שעה פנויה מהרשימה או בקש יום אחר." : "לא נמצאו שעות פנויות ביום הזה. בקש תאריך אחר.", details);
    }
    const mode = proposal?.appointmentMode === "video" ? "video" : "physical";
    const details = [
      { label: "מטופל", value: safeText(patient.row.pet_name) },
      { label: "מועד", value: `${date} בשעה ${time}` },
      { label: "סוג תור", value: appointmentType },
      { label: "אופן", value: mode === "video" ? "וידאו" : "במרפאה" },
    ];
    return createPending(admin, actorId, role, type, {
      pet_id: patient.row.pet_id,
      start_time: availability.slot.slot_start,
      end_time: availability.slot.slot_end,
      appointment_type: appointmentType,
      appointment_mode: mode,
      urgency: proposal?.urgency === "urgent" ? "urgent" : "normal",
    }, { title: "אישור קביעת תור", summary: "בדקתי את יומן המרפאה והשעה פנויה. התור ייווצר רק לאחר אישורך.", details, confirmationLabel: "קבע את התור" });
  }

  if (type === "reschedule_appointment" || type === "cancel_appointment") {
    const appointment = await resolveAppointment(client, proposal || {}, context, conversationText);
    if (!appointment.row) return missingPlan(type, type === "cancel_appointment" ? "ביטול תור" : "שינוי מועד תור", ["currentAppointmentDate"], appointment.issue);
    if (!(await canAccessPet(client, role, Number(appointment.row.pet_id)))) {
      return blockedPlan("לא ניתן לצפות או לשנות תור שאינו שייך לחשבון המחובר.");
    }
    const current = localParts(String(appointment.row.start_time));
    const petName = safeText(appointment.patient?.pet_name || proposal?.patientName || "המטופל");
    if (type === "cancel_appointment") {
      return createPending(admin, actorId, role, type, { appointment_id: appointment.row.appointment_id }, {
        title: "אישור ביטול תור",
        summary: "הביטול יסיר את התור מהיומן. לא ניתן לשחזר אותו אוטומטית.",
        details: [{ label: "מטופל", value: petName }, { label: "מועד", value: `${current.date} בשעה ${current.time}` }],
        destructive: true,
        confirmationLabel: "בטל את התור",
      });
    }
    const date = dateValue(proposal?.appointmentDate);
    const time = timeValue(proposal?.appointmentTime);
    const missing = [!date ? "appointmentDate" : "", !time ? "appointmentTime" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "שינוי מועד תור", missing);
    const availability = await resolveAvailableSlot(client, date, time);
    if (!availability.slot) return missingPlan(type, "המועד החדש אינו פנוי", ["appointmentTime"], availability.alternatives.length ? `שעות פנויות: ${availability.alternatives.join(", ")}` : "בחר תאריך אחר.");
    return createPending(admin, actorId, role, type, {
      appointment_id: appointment.row.appointment_id,
      start_time: availability.slot.slot_start,
      end_time: availability.slot.slot_end,
    }, {
      title: "אישור שינוי מועד",
      summary: "המועד החדש פנוי. השינוי יתבצע רק לאחר אישורך.",
      details: [{ label: "מטופל", value: petName }, { label: "מועד נוכחי", value: `${current.date} ${current.time}` }, { label: "מועד חדש", value: `${date} ${time}` }],
      confirmationLabel: "שנה את המועד",
    });
  }

  if (type === "adjust_inventory") {
    const itemName = safeText(proposal?.itemName);
    const operation = proposal?.inventoryOperation;
    const quantity = numeric(proposal?.quantity);
    const missing = [!itemName ? "itemName" : "", !operation ? "inventoryOperation" : "", quantity === null ? "quantity" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "עדכון מלאי", missing);
    const { data, error } = await client.from("inventory").select("item_id,item_name,stock_quantity").limit(1000);
    if (error || !Array.isArray(data)) return missingPlan(type, "עדכון מלאי", ["itemName"], "לא הצלחתי לאמת את פריט המלאי כרגע.");
    const match = uniqueNameMatch(data, itemName, (row: any) => row.item_name);
    if (!match.row) return missingPlan(type, "עדכון מלאי", ["itemName"], match.ambiguous ? "נמצאו כמה פריטים שמתאימים לשם הזה. ציין שם מדויק יותר." : "לא נמצא פריט מלאי בשם הזה.");
    const row: any = match.row;
    const current = Number(row.stock_quantity || 0);
    const rounded = Math.trunc(quantity!);
    const next = operation === "add" ? current + rounded : operation === "remove" ? current - rounded : rounded;
    if (rounded < 0 || next < 0 || next > 1_000_000) return blockedPlan("כמות המלאי המבוקשת אינה תקינה או שתיצור מלאי שלילי.");
    return createPending(admin, actorId, role, type, { item_id: row.item_id, new_quantity: next }, {
      title: "אישור עדכון מלאי",
      summary: "כמות הפריט תשתנה רק לאחר אישורך.",
      details: [{ label: "פריט", value: safeText(row.item_name) }, { label: "כמות נוכחית", value: String(current) }, { label: "כמות חדשה", value: String(next) }],
      confirmationLabel: "עדכן את המלאי",
    });
  }

  if (type === "create_inventory_item") {
    const itemName = safeText(proposal?.itemName, 160);
    const category = proposal?.itemCategory;
    const quantity = numeric(proposal?.quantity);
    const lowStockThreshold = numeric(proposal?.lowStockThreshold);
    const unitPrice = numeric(proposal?.unitPrice);
    const allowedCategories = new Set(["medication", "equipment", "consumable", "other"]);
    const missing = [
      !itemName ? "itemName" : "",
      !category || !allowedCategories.has(category) ? "itemCategory" : "",
      quantity === null ? "quantity" : "",
      lowStockThreshold === null ? "lowStockThreshold" : "",
      unitPrice === null ? "unitPrice" : "",
    ].filter(Boolean);
    if (missing.length) return missingPlan(type, "הוספת פריט חדש למלאי", missing);
    const initialQuantity = Math.trunc(quantity!);
    const threshold = Math.trunc(lowStockThreshold!);
    if (initialQuantity < 0 || initialQuantity > 1_000_000 || threshold < 0 || threshold > 1_000_000 || unitPrice! < 0 || unitPrice! > 1_000_000) {
      return blockedPlan("הכמות, הסף או המחיר שביקשת אינם בטווח תקין.");
    }
    const { data, error } = await client.from("inventory").select("item_id,item_name").limit(1000);
    if (error || !Array.isArray(data)) return missingPlan(type, "הוספת פריט חדש למלאי", ["itemName"], "לא הצלחתי לבדוק את רשימת המלאי כרגע.");
    const existing = uniqueNameMatch(data, itemName, (row: any) => row.item_name);
    if (existing.row || existing.ambiguous) {
      return missingPlan(type, "הוספת פריט חדש למלאי", ["itemName"], existing.row
        ? "כבר קיים פריט בשם דומה. כדי למנוע כפילות, בקש לעדכן את הכמות של הפריט הקיים."
        : "נמצאו כמה פריטים דומים. ציין שם ייחודי יותר לפריט החדש.");
    }
    const categoryLabels: Record<string, string> = { medication: "תרופות", equipment: "ציוד", consumable: "מתכלים", other: "אחר" };
    return createPending(admin, actorId, role, type, {
      item_name: itemName,
      category,
      stock_quantity: initialQuantity,
      low_stock_threshold: threshold,
      price: Number(unitPrice!.toFixed(2)),
    }, {
      title: "אישור הוספת פריט למלאי",
      summary: "הפריט ייווצר רק לאחר אישורך. בדוק את כל הפרטים לפני ההוספה.",
      details: [
        { label: "פריט", value: itemName },
        { label: "קטגוריה", value: categoryLabels[category!] || String(category) },
        { label: "כמות התחלתית", value: String(initialQuantity) },
        { label: "סף מלאי נמוך", value: String(threshold) },
        { label: "מחיר ליחידה", value: String(Number(unitPrice!.toFixed(2))) },
      ],
      confirmationLabel: "הוסף את הפריט",
    });
  }

  if (type === "archive_conversation" || type === "restore_conversation" || type === "set_conversation_priority") {
    const conversationRef = numeric(proposal?.conversationRef) ?? contextNumber(context, ["conversation", "conversationRef"]);
    if (!conversationRef) return missingPlan(type, "עדכון שיחה", ["conversationRef"], "בחר שיחה במרפאה הדיגיטלית ובקש שוב.");
    const { data } = await client.from("conversations").select("conversation_id,status,priority,subject").eq("conversation_id", conversationRef).maybeSingle();
    if (!data) return missingPlan(type, "עדכון שיחה", ["conversationRef"], "השיחה אינה זמינה או שאינך מורשה לעדכן אותה.");
    const priority = proposal?.priority === "urgent" ? "urgent" : proposal?.priority === "normal" ? "normal" : "";
    if (type === "set_conversation_priority" && !priority) return missingPlan(type, "עדכון דחיפות שיחה", ["priority"]);
    const actionLabel = type === "archive_conversation" ? "העבר לארכיון" : type === "restore_conversation" ? "החזר לפעילות" : "עדכן דחיפות";
    const payload = { conversation_id: data.conversation_id, ...(priority ? { priority } : {}) };
    return createPending(admin, actorId, role, type, payload, {
      title: `אישור: ${actionLabel}`,
      summary: "השינוי יתבצע בשיחה שנבחרה בלבד.",
      details: [{ label: "שיחה", value: safeText(data.subject || `#${data.conversation_id}`) }, ...(priority ? [{ label: "דחיפות חדשה", value: priority === "urgent" ? "דחופה" : "רגילה" }] : [])],
      destructive: type === "archive_conversation",
      confirmationLabel: actionLabel,
    });
  }

  if (type === "set_lab_urgency") {
    if (typeof proposal?.isUrgent !== "boolean") {
      return missingPlan(type, "עדכון דחיפות בדיקה", ["isUrgent"]);
    }
    let labRef = numeric(proposal?.labOrderRef);
    let lab: any = null;
    if (labRef) {
      const result = await client.from("lab_orders").select("lab_order_id,pet_id,test_name,status,is_urgent").eq("lab_order_id", labRef).maybeSingle();
      lab = result.data;
    } else {
      const patient = await resolvePatient(client, safeText(proposal?.patientName), contextNumber(context, ["selectedPatientRef"]), safeText(proposal?.patientSpecies), conversationText);
      const testName = safeText(proposal?.testName);
      if (!patient.row || !testName) return missingPlan(type, "עדכון דחיפות בדיקה", [!patient.row ? "patientName" : "", !testName ? "testName" : ""].filter(Boolean), patient.issue || undefined);
      const result = await client.from("lab_orders").select("lab_order_id,pet_id,test_name,status,is_urgent").eq("pet_id", patient.row.pet_id).neq("status", "completed").limit(100);
      const matches = Array.isArray(result.data) ? result.data.filter((row: any) => safeText(row.test_name).toLocaleLowerCase("he-IL") === testName.toLocaleLowerCase("he-IL")) : [];
      if (matches.length === 1) lab = matches[0];
    }
    if (!lab) return missingPlan(type, "עדכון דחיפות בדיקה", ["labOrderRef"], "לא מצאתי בדיקה פתוחה אחת שמתאימה לבקשה.");
    labRef = Number(lab.lab_order_id);
    return createPending(admin, actorId, role, type, { lab_order_id: labRef, is_urgent: Boolean(proposal?.isUrgent) }, {
      title: "אישור עדכון דחיפות בדיקה",
      summary: "הפעולה משנה דחיפות תפעולית בלבד ואינה משנה תוצאה רפואית.",
      details: [{ label: "בדיקה", value: safeText(lab.test_name) }, { label: "דחיפות חדשה", value: proposal?.isUrgent ? "דחופה" : "רגילה" }],
      confirmationLabel: "עדכן דחיפות",
    });
  }

  if (type === "block_booking_time") {
    const date = dateValue(proposal?.blockDate);
    const allDay = Boolean(proposal?.allDay);
    const start = timeValue(proposal?.blockStart);
    const end = timeValue(proposal?.blockEnd);
    const missing = [!date ? "blockDate" : "", !allDay && (!start || !end) ? "blockTime" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "חסימת קביעת תורים", missing);
    if (!allDay && start >= end) return missingPlan(type, "חסימת קביעת תורים", ["blockTime"], "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.");
    return createPending(admin, actorId, role, type, { block_date: date, is_all_day: allDay, starts_at: start || null, ends_at: end || null, reason: safeText(proposal?.reason, 200) }, {
      title: "אישור חסימת קביעת תורים",
      summary: "לקוחות לא יוכלו לבחור שעות בתוך הטווח החסום.",
      details: [{ label: "תאריך", value: date }, { label: "טווח", value: allDay ? "כל היום" : `${start}–${end}` }, ...(proposal?.reason ? [{ label: "סיבה", value: safeText(proposal.reason, 120) }] : [])],
      destructive: true,
      confirmationLabel: "חסום את הטווח",
    });
  }

  return blockedPlan("VetBot אינו מורשה לבצע את הפעולה המבוקשת.");
}

function actionErrorMessage(code: string) {
  if (/SLOT_NOT_AVAILABLE/.test(code)) return "המועד כבר אינו פנוי. הנתונים השתנו מאז האישור; בחר מועד אחר.";
  if (/ACTION_EXPIRED|ACTION_NOT_PENDING/.test(code)) return "האישור פג או שכבר טופל. בקש מ־VetBot להכין את הפעולה מחדש.";
  if (/ROLE_CHANGED|NOT_ALLOWED|REQUIRED|NOT_OWNED/.test(code)) return "אין הרשאה לבצע את הפעולה הזו.";
  if (/NOT_FOUND/.test(code)) return "הפריט שביקשת לעדכן כבר אינו קיים או אינו זמין.";
  if (/INVENTORY_ITEM_ALREADY_EXISTS/.test(code)) return "כבר קיים פריט מלאי בשם הזה. בקש לעדכן את הכמות של הפריט הקיים.";
  return "הפעולה לא בוצעה כי הנתונים השתנו או לא עברו אימות. אפשר להכין אותה מחדש.";
}

export async function decideVetBotAction({
  client,
  admin,
  actorId,
  requestId,
  decision,
}: {
  client: SupabaseClient;
  admin: SupabaseClient;
  actorId: string;
  requestId: string;
  decision: "approve" | "reject";
}): Promise<VetBotActionPlan> {
  const { data: requestRow } = await admin
    .from("vetbot_action_requests")
    .select("action_request_id,actor_id,action_type,status,expires_at,preview")
    .eq("action_request_id", requestId)
    .eq("actor_id", actorId)
    .maybeSingle();
  if (!requestRow) throw new Error("ACTION_NOT_FOUND");
  const preview: any = requestRow.preview || {};
  const base = {
    requestId,
    type: requestRow.action_type as VetBotActionType,
    title: safeText(preview.title || "פעולת VetBot", 100),
    summary: safeText(preview.summary || "", 300),
    missingFields: [] as string[],
    details: Array.isArray(preview.details) ? preview.details.slice(0, 8) : [],
    destructive: Boolean(preview.destructive),
  };
  if (requestRow.status !== "pending" || new Date(requestRow.expires_at).getTime() <= Date.now()) {
    return { ...base, status: "failed", summary: "האישור פג או שכבר טופל. בקש להכין את הפעולה מחדש." };
  }
  if (decision === "reject") {
    await admin.from("vetbot_action_requests").update({ status: "rejected" }).eq("action_request_id", requestId).eq("actor_id", actorId).eq("status", "pending");
    return { ...base, status: "rejected", summary: "הפעולה בוטלה ולא בוצע שינוי במערכת." };
  }
  const rpcName = requestRow.action_type === "create_inventory_item"
    ? "myvet_execute_vetbot_inventory_create"
    : "myvet_execute_vetbot_action_v2";
  const { data, error } = await client.rpc(rpcName, { requested_action_id: requestId });
  const result: any = data || {};
  if (error || result.ok !== true) {
    const code = String(result.error_code || error?.message || "ACTION_FAILED");
    return { ...base, status: "failed", summary: actionErrorMessage(code) };
  }
  return { ...base, status: "executed", title: "הפעולה בוצעה בהצלחה", summary: "המערכת אימתה מחדש את ההרשאות והנתונים וביצעה את השינוי שאישרת." };
}
