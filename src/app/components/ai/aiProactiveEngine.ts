import { redactSensitiveText } from "./aiSanitizer";
import type { AiAssistantMode, AiAssistantResult, AiFinding, AiSuggestedAction } from "./aiTypes";
import { VETBOT_PRIVACY_NOTICE_VERSION } from "./aiPolicy";

const URGENT_PATTERNS = [
  /קושי\s+לנשום/i,
  /לא\s+נושם/i,
  /דימום(?:\s+חזק|\s+רב)?/i,
  /פרכוס|עווית/i,
  /איבד(?:ה|)\s+הכרה|מחוסר(?:ת|)\s+הכרה/i,
  /הרעלה|בלע(?:ה|)\s+(?:רעל|תרופה|שוקולד)/i,
  /דריסה|נפילה\s+מגובה/i,
  /לא\s+מצליח(?:ה|)\s+להשתין/i,
  /קורס|התמוטט/i,
  /emergency|difficulty breathing|seizure|poison|unconscious/i,
];

export function inferOperationalUrgency(...parts: Array<string | null | undefined>) {
  const text = redactSensitiveText(parts.filter(Boolean).join(" "));
  return URGENT_PATTERNS.some((pattern) => pattern.test(text)) ? "urgent" : "normal";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function finding(id: string, title: string, detail: string, urgency: AiFinding["urgency"], source: string): AiFinding {
  return { id, title, detail, urgency, source };
}

function action(id: string, label: string, route: string, reason: string): AiSuggestedAction {
  return { id, label, route, reason, kind: "navigate", requiresConfirmation: true };
}

export function buildLocalProactiveBriefing(mode: AiAssistantMode, rawContext: unknown): AiAssistantResult | null {
  const context = asRecord(rawContext);
  const findings: AiFinding[] = [];
  const suggestedActions: AiSuggestedAction[] = [];

  if (mode === "dashboard") {
    const summary = asRecord(context.workSummary);
    if (Number(summary.urgentLabOrders) > 0) {
      findings.push(finding("urgent-labs", "בדיקות דחופות ממתינות", `${summary.urgentLabOrders} בדיקות דחופות עדיין פתוחות.`, "urgent", "נתוני מעבדה חיים"));
      suggestedActions.push(action("open-urgent-labs", "פתח בדיקות דחופות", "/lab-orders?filter=urgent", "בדיקה רפואית דורשת איש צוות מוסמך."));
    }
    if (Number(summary.highPriorityConversations) > 0) {
      findings.push(finding("urgent-digital", "פניות דחופות ממתינות", `${summary.highPriorityConversations} שיחות סומנו כדחופות.`, "urgent", "מרפאה דיגיטלית"));
      suggestedActions.push(action("open-urgent-digital", "פתח פניות דחופות", "/digital-care?priority=urgent", "הדחיפות היא תפעולית ודורשת אימות אנושי."));
    }
    if (Number(summary.activeHospitalizations) > 0) {
      findings.push(finding("hospitalizations", "מאושפזים פעילים", `${summary.activeHospitalizations} מאושפזים נמצאים במעקב.`, "important", "מערך אשפוזים"));
      suggestedActions.push(action("open-hospitalizations", "פתח אשפוזים", "/hospitalizations?filter=active", "סקירת סטטוס על ידי הצוות."));
    }
    if (Number(summary.lowStockInventory) > 0) {
      findings.push(finding("low-stock", "מלאי דורש בדיקה", `${summary.lowStockInventory} פריטים נמצאים מתחת לסף.`, "important", "מלאי"));
      suggestedActions.push(action("open-low-stock", "פתח מלאי נמוך", "/inventory?filter=low-stock", "בדיקת כמות לפני הזמנה."));
    }
    if (findings.length === 0 && Number(summary.appointmentsToday) >= 0) {
      findings.push(finding("clinic-clear", "אין חריגה מרכזית", "לא זוהה כרגע אות דחוף בנתונים המצומצמים.", "normal", "בדיקה מקומית"));
    }
  }

  if (mode === "schedule") {
    const summary = asRecord(context.summary);
    if (Number(summary.missingStaffOrRoom) > 0) {
      findings.push(finding("schedule-missing", "תורים דורשים השלמה", `${summary.missingStaffOrRoom} תורים ללא שיבוץ מלא.`, "important", "יומן תורים"));
      suggestedActions.push(action("open-schedule", "פתח את היומן", "/appointments", "יש לאמת צוות וחדר לפני שינוי."));
    }
    if (Number(summary.totalAppointments) > 0) {
      findings.push(finding("schedule-load", "עומס ביומן", `${summary.totalAppointments} תורים מוצגים בטווח הנוכחי.`, "normal", "יומן תורים"));
    }
  }

  if (mode === "inventory") {
    const summary = asRecord(context.summary);
    const low = Number(summary.lowStockItems || 0);
    if (low > 0) {
      findings.push(finding("inventory-low", "פריטים מתחת לסף", `${low} פריטים דורשים בדיקת מלאי.`, low >= 5 ? "urgent" : "important", "מלאי"));
      suggestedActions.push(action("inventory-review", "בדוק מלאי נמוך", "/inventory?filter=low-stock", "VetBot אינו מבצע הזמנה בעצמו."));
    }
  }

  if (mode === "digital-care") {
    const conversation = asRecord(context.conversation);
    const recentMessages = Array.isArray(context.recentMessages) ? context.recentMessages : [];
    const recentText = recentMessages.slice(-6).map((message) => String(message?.text || ""));
    const urgency = inferOperationalUrgency(String(conversation.subject || ""), ...recentText);
    if (urgency === "urgent") {
      findings.push(finding("digital-red-flag", "זוהה ביטוי שמצריך בדיקה מהירה", "השיחה כוללת סימן אזהרה תפעולי. יש לאמת מיד מול איש צוות רפואי.", "urgent", "בדיקה מקומית של נוסח השיחה"));
    } else if (conversation.status) {
      findings.push(finding("digital-status", "השיחה נותחה", "לא זוהה ביטוי חירום מובהק. ההחלטה הרפואית נשארת בידי הצוות.", "normal", "בדיקה מקומית של נוסח השיחה"));
    }
  }

  if (mode === "medical-record") {
    const hospitalization = asRecord(context.activeHospitalization);
    const visits = Array.isArray(context.recentVisits) ? context.recentVisits : [];
    if (hospitalization.status === "active") {
      findings.push(finding("active-hospitalization", "אשפוז פעיל", "התיק משויך לאשפוז פעיל ודורש אימות מול תכנית המעקב.", "important", "תיק רפואי מצומצם"));
    }
    const incomplete = visits.filter((visit) => !visit?.hasFinalDiagnosis || visit?.hasFollowUp).length;
    if (incomplete > 0) {
      findings.push(finding("record-follow-up", "פרטים למעקב", `${incomplete} רשומות אחרונות כוללות מעקב או חסר בתיעוד הסופי.`, "important", "תיק רפואי מצומצם"));
    }
  }

  if (mode === "clients") {
    const summary = asRecord(context.summary);
    if (Number(summary.clientsWithoutPets) > 0) {
      findings.push(finding("clients-unlinked", "לקוחות ללא חיה משויכת", `${summary.clientsWithoutPets} רשומות לקוח דורשות בדיקת שיוך.`, "normal", "סיכום לקוחות"));
    }
  }

  if (mode === "portal") {
    const summary = asRecord(context.summary);
    if (Number(summary.unreadNotifications) > 0) {
      findings.push(finding("portal-notifications", "יש עדכונים חדשים", `${summary.unreadNotifications} התראות טרם נקראו.`, "normal", "אזור אישי"));
    }
    if (Number(summary.billingFollowUps) > 0) {
      findings.push(finding("portal-billing", "קיימים פריטי תשלום לבדיקה", "אפשר לפתוח את אזור התשלומים ולבדוק את הסטטוס.", "important", "אזור אישי"));
    }
  }

  if (findings.length === 0) return null;
  const topUrgency = findings.some((item) => item.urgency === "urgent")
    ? "urgent"
    : findings.some((item) => item.urgency === "important")
      ? "important"
      : "normal";

  return {
    answer: topUrgency === "urgent" ? "זוהו נושאים שמומלץ לבדוק כעת." : "הכנתי תמונת מצב קצרה מהנתונים במסך.",
    summary: "תדריך מקומי שנוצר ללא שליחת מידע לספק AI.",
    urgency: topUrgency,
    confidence: "high",
    findings: findings.slice(0, 3),
    suggestedActions: suggestedActions.slice(0, 3),
    usedTools: ["מנוע תעדוף מקומי"],
    privacy: {
      mode: "strict-minimization",
      piiRemoved: false,
      removedCategories: [],
      externalProcessing: false,
      noticeVersion: VETBOT_PRIVACY_NOTICE_VERSION,
    },
  };
}
