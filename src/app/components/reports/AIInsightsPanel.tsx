import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarClock,
  CreditCard,
  FlaskConical,
  HeartPulse,
  Lightbulb,
  Package,
  MessageCircle,
  RefreshCw,
  Send,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../../../services/supabaseClient";
import {
  DateRangeKey,
  LOW_STOCK_THRESHOLD,
  buildLookups,
  daysBetween,
  fetchReportDataset,
  formatCurrency,
  getDateRangeLabel,
  getDateRangeStart,
  getFilteredDataset,
  ownerName,
  petName,
} from "../../data/reportMetrics";

export type ReportInsightContext =
  "overview" | "revenue" | "staff" | "inventory" | "medical" | "compliance";

type InsightSeverity = "critical" | "warning" | "info" | "success";
type InsightCategory =
  | "payments"
  | "inventory"
  | "appointments"
  | "medical"
  | "labs"
  | "clients"
  | "general";

interface AIInsightsPanelProps {
  dateRange: DateRangeKey;
  context?: ReportInsightContext;
  maxItems?: number;
}

interface StoredInsightRow {
  insight_id: number;
  title: string;
  description: string;
  category: InsightCategory;
  severity: InsightSeverity;
  status: "open" | "in_progress" | "resolved" | "dismissed" | string;
  impact?: string | null;
  recommended_action?: string | null;
  action_label?: string | null;
  action_url?: string | null;
  created_at?: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  createdAt: string;
}

interface InsightItem {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  category: InsightCategory;
  whyItMatters: string;
  recommendedAction: string;
  actionLabel?: string;
  actionUrl?: string;
  score: number;
  metric?: string;
  persistedId?: number;
  status?: "open" | "in_progress" | "resolved" | "dismissed" | string;
  source?: "generated" | "saved";
}

const severityRank: Record<InsightSeverity, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  success: 1,
};

const severityLabels: Record<InsightSeverity, string> = {
  critical: "קריטי",
  warning: "חשוב",
  info: "מידע",
  success: "תקין",
};

const severityStyles: Record<InsightSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const categoryIcons: Record<InsightCategory, any> = {
  payments: CreditCard,
  inventory: Package,
  appointments: CalendarClock,
  medical: HeartPulse,
  labs: FlaskConical,
  clients: Users,
  general: Lightbulb,
};

const categoryLabels: Record<InsightCategory, string> = {
  payments: "תשלומים",
  inventory: "מלאי",
  appointments: "תורים",
  medical: "רפואי",
  labs: "מעבדה",
  clients: "לקוחות",
  general: "כללי",
};

const statusLabels: Record<string, string> = {
  open: "פתוחה",
  in_progress: "בטיפול",
  resolved: "טופלה",
  dismissed: "נדחתה",
};

const statusStyles: Record<string, string> = {
  open: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dismissed: "bg-gray-50 text-gray-600 border-gray-200",
};

function insightKey(insight: Pick<InsightItem, "title" | "category">) {
  return `${insight.category}::${insight.title}`.trim().toLowerCase();
}

function mapStoredInsight(row: StoredInsightRow): InsightItem {
  return {
    id: `saved-${row.insight_id}`,
    persistedId: row.insight_id,
    title: row.title,
    description: row.description,
    severity: row.severity || "info",
    category: row.category || "general",
    whyItMatters:
      row.impact ||
      "התובנה נשמרה למעקב כדי לאפשר לצוות המרפאה לסגור פעולות בצורה מסודרת.",
    recommendedAction:
      row.recommended_action ||
      "לעבור למסך הרלוונטי, לבדוק את הנתונים ולסמן את התובנה כטופלה לאחר ביצוע.",
    actionLabel: row.action_label || undefined,
    actionUrl: row.action_url || undefined,
    score: (severityRank[row.severity || "info"] || 1) * 1000,
    metric: statusLabels[row.status] || row.status || "פתוחה",
    status: row.status,
    source: "saved",
  };
}

async function fetchSavedInsights(context: ReportInsightContext, dateRange: DateRangeKey): Promise<InsightItem[]> {
  const allowedCategories =
    contextCategories[context] || contextCategories.overview;

  let query = supabase
    .from("insights")
    .select("*")
    .in("category", allowedCategories)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(30);

  const rangeStart = getDateRangeStart(dateRange);
  // תובנות שמורות הן אירועי מעקב בפני עצמם, לכן מסננים אותן לפי מועד יצירת התובנה.
  // בטווח "הכל" אין סינון.
  if (rangeStart) {
    query = query.gte("created_at", rangeStart.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch saved insights", error);
    return [] as InsightItem[];
  }

  return ((data || []) as StoredInsightRow[]).map(mapStoredInsight);
}

async function persistGeneratedInsights(generated: InsightItem[]) {
  const actionable = generated
    .filter((insight) => ["critical", "warning"].includes(insight.severity))
    .filter((insight) => insight.id !== "report-data-errors")
    .slice(0, 6);

  if (actionable.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("insights")
    .select("insight_id,title,category,status")
    .in("status", ["open", "in_progress"])
    .limit(500);

  if (existingError) {
    console.error("Failed to check existing insights", existingError);
    return;
  }

  const existingKeys = new Set(
    ((existing || []) as StoredInsightRow[]).map((row) =>
      insightKey({ title: row.title, category: row.category }),
    ),
  );
  const rowsToInsert = actionable
    .filter((insight) => !existingKeys.has(insightKey(insight)))
    .map((insight) => ({
      title: insight.title,
      description: insight.description,
      category: insight.category,
      severity: insight.severity,
      status: "open",
      impact: insight.whyItMatters,
      recommended_action: insight.recommendedAction,
      action_label: insight.actionLabel || null,
      action_url: insight.actionUrl || getActionUrl(insight.category) || null,
    }));

  if (rowsToInsert.length === 0) return;

  const { error } = await supabase.from("insights").insert(rowsToInsert);
  if (error) {
    console.error("Failed to persist generated insights", error);
  }
}

function mergeInsights(saved: InsightItem[], generated: InsightItem[]): InsightItem[] {
  const savedKeys = new Set(saved.map(insightKey));
  const generatedWithoutSavedDuplicates = generated
    .map((insight) => ({
      ...insight,
      source: insight.source || ("generated" as const),
    }))
    .filter((insight) => !savedKeys.has(insightKey(insight)));

  return sortInsights([...saved, ...generatedWithoutSavedDuplicates]);
}

const contextCategories: Record<ReportInsightContext, InsightCategory[]> = {
  overview: [
    "payments",
    "inventory",
    "appointments",
    "labs",
    "medical",
    "clients",
    "general",
  ],
  revenue: ["payments"],
  staff: ["appointments"],
  inventory: ["inventory"],
  medical: ["medical", "labs"],
  compliance: ["clients", "medical", "payments"],
};

function sortInsights(insights: InsightItem[]): InsightItem[] {
  return [...insights].sort((a, b) => {
    const severityDiff = severityRank[b.severity] - severityRank[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.score - a.score;
  });
}

function getContextTitle(context?: ReportInsightContext) {
  switch (context) {
    case "revenue":
      return "תובנות חכמות — תשלומים וגבייה";
    case "staff":
      return "תובנות חכמות — תורים וצוות";
    case "inventory":
      return "תובנות חכמות — מלאי";
    case "medical":
      return "תובנות חכמות — פעילות רפואית";
    case "compliance":
      return "תובנות חכמות — מעקב לקוחות";
    default:
      return "תובנות חכמות — תמונת מצב";
  }
}

function getActionUrl(category: InsightCategory) {
  switch (category) {
    case "payments":
      return "/reports";
    case "inventory":
      return "/inventory";
    case "appointments":
      return "/appointments";
    case "medical":
      return "/patients";
    case "labs":
      return "/patients";
    case "clients":
      return "/clients";
    default:
      return undefined;
  }
}

const quickQuestions: Array<{ label: string; question: string }> = [
  {
    label: "מה דחוף עכשיו?",
    question: "תנתח את מצב המרפאה ותן לי את שלושת הדברים הכי דחופים לטיפול היום, לפי סדר עדיפות, כולל פעולה מומלצת לכל אחד",
  },
  {
    label: "תוכנית ל-24 שעות",
    question: "בנה לי תוכנית פעולה קצרה ל-24 השעות הקרובות: מה לבדוק, למי לפנות, ומה לסגור קודם",
  },
  {
    label: "גבייה",
    question: "מי הלקוחות או החיובים שהכי חשוב לטפל בהם בגבייה, למה הם חשובים ומה כדאי לעשות בפועל?",
  },
  {
    label: "מלאי",
    question: "איזה בעיות מלאי עלולות להשפיע על פעילות המרפאה ומה צריך להזמין או לבדוק קודם?",
  },
  {
    label: "תורים ועומסים",
    question: "האם יש עומס תורים או סיכון תפעולי ביומן? תן לי המלצה איך לפזר או לתעדף את העבודה",
  },
  {
    label: "מעקב לקוחות",
    question: "אילו לקוחות או חיות דורשים מעקב יזום עכשיו, ומה הודעה או פעולה שכדאי לבצע מולם?",
  },
];

function contextLabel(context: ReportInsightContext) {
  switch (context) {
    case "revenue":
      return "תשלומים וגבייה";
    case "staff":
      return "תורים וצוות";
    case "inventory":
      return "מלאי";
    case "medical":
      return "פעילות רפואית";
    case "compliance":
      return "מעקב לקוחות";
    default:
      return "סקירה כללית";
  }
}

async function generateInsights(
  dateRange: DateRangeKey,
  context: ReportInsightContext = "overview",
): Promise<InsightItem[]> {
  const { dataset, errors } = await fetchReportDataset();
  const filtered = getFilteredDataset(dataset, dateRange);
  const { ownersById, patientsById } = buildLookups(dataset);
  const now = new Date();
  const insights: InsightItem[] = [];

  const paymentsScope = dateRange === "custom" ? dataset.payments : filtered.payments;
  const unpaidPayments = paymentsScope.filter(
    (p) => p.status === "unpaid" || p.status === "partial",
  );
  const openDebt = unpaidPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );
  const overduePayments = unpaidPayments.filter(
    (p) => p.due_date && new Date(p.due_date) < now,
  );
  const debtByOwner = new Map<string, number>();
  unpaidPayments.forEach((p) =>
    debtByOwner.set(
      p.owner_id,
      (debtByOwner.get(p.owner_id) || 0) + Number(p.amount || 0),
    ),
  );
  const highestOwnerDebt = [...debtByOwner.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (openDebt > 0) {
    const owner = highestOwnerDebt ? ownersById.get(highestOwnerDebt[0]) : null;
    insights.push({
      id: "open-debt-risk",
      title: `חיובים פתוחים בסך ${formatCurrency(openDebt)}`,
      description: highestOwnerDebt
        ? `הלקוח עם החוב הגבוה ביותר הוא ${ownerName(owner)} עם ${formatCurrency(highestOwnerDebt[1])}.`
        : `קיימים ${unpaidPayments.length} חיובים פתוחים במערכת.`,
      severity:
        openDebt >= 1500 || overduePayments.length > 0 ? "critical" : "warning",
      category: "payments",
      metric: `${unpaidPayments.length} חיובים`,
      whyItMatters:
        "חובות פתוחים משפיעים ישירות על גבייה ותזרים, במיוחד אם הם נשארים פתוחים אחרי תאריך היעד.",
      recommendedAction:
        overduePayments.length > 0
          ? "לשלוח תזכורת תשלום ללקוחות עם חוב שעבר תאריך יעד ולתעד מעקב."
          : "לעבור לדוח הגבייה ולוודא שהחיובים משויכים ללקוחות הנכונים.",
      actionLabel: "פתח דוח גבייה",
      actionUrl: "/reports",
      score: openDebt + overduePayments.length * 500,
    });
  }

  const appointmentsScope = dateRange === "custom" ? dataset.appointments : filtered.appointments;
  const futureAppointments = appointmentsScope.filter(
    (a) => a.start_time && new Date(a.start_time) >= now,
  );
  const futurePetIds = new Set(futureAppointments.map((a) => Number(a.pet_id)));
  const ownersWithFutureAppointmentAndDebt = unpaidPayments.filter((p) => {
    if (p.pet_id && futurePetIds.has(Number(p.pet_id))) return true;
    const pet = p.pet_id ? patientsById.get(Number(p.pet_id)) : null;
    if (!pet) return false;
    return futureAppointments.some(
      (a) => Number(a.pet_id) === Number(pet.pet_id),
    );
  });

  if (ownersWithFutureAppointmentAndDebt.length > 0) {
    const sample = ownersWithFutureAppointmentAndDebt[0];
    const owner = ownersById.get(sample.owner_id);
    insights.push({
      id: "debt-before-appointment",
      title: "לקוחות עם חוב פתוח לפני תור עתידי",
      description: `${ownerName(owner)} הוא דוגמה ללקוח עם חיוב פתוח ותור עתידי במערכת.`,
      severity: "warning",
      category: "payments",
      metric: `${ownersWithFutureAppointmentAndDebt.length} חיובים רלוונטיים`,
      whyItMatters:
        "זוהי נקודת זמן טובה להסדיר תשלום לפני ביקור נוסף ולמנוע הצטברות חובות.",
      recommendedAction:
        "להוסיף תזכורת לצוות הקבלה או לשלוח לבעלים תזכורת תשלום לפני התור.",
      actionLabel: "פתח לקוחות",
      actionUrl: "/clients",
      score: 900 + ownersWithFutureAppointmentAndDebt.length * 100,
    });
  }

  const stockItems = dataset.inventory;
  const zeroStockItems = stockItems.filter(
    (item) => Number(item.stock_quantity || 0) <= 0,
  );
  const lowStockItems = stockItems.filter(
    (item) =>
      Number(item.stock_quantity || 0) > 0 &&
      Number(item.stock_quantity || 0) <= LOW_STOCK_THRESHOLD,
  );
  const lowStockAll = [...zeroStockItems, ...lowStockItems];
  if (lowStockAll.length > 0) {
    const firstItems = lowStockAll
      .slice(0, 3)
      .map((i) => i.item_name)
      .filter(Boolean)
      .join(", ");
    insights.push({
      id: "low-stock-risk",
      title: `${lowStockAll.length} פריטי מלאי דורשים טיפול`,
      description:
        zeroStockItems.length > 0
          ? `${zeroStockItems.length} פריטים אזלו לחלוטין. ${firstItems ? `דוגמאות: ${firstItems}.` : ""}`
          : `הפריטים מתחת לסף המינימלי. ${firstItems ? `דוגמאות: ${firstItems}.` : ""}`,
      severity: zeroStockItems.length > 0 ? "critical" : "warning",
      category: "inventory",
      metric: `${zeroStockItems.length} אזלו`,
      whyItMatters:
        "חוסר במלאי עלול לעכב טיפולים, חיסונים או מכירה של תרופות ומוצרים ללקוחות.",
      recommendedAction:
        "לעבור למסך מלאי, לעדכן כמות בפועל ולייצר רשימת הזמנה לספק.",
      actionLabel: "פתח מלאי",
      actionUrl: "/inventory",
      score: zeroStockItems.length * 700 + lowStockItems.length * 250,
    });
  }

  const labsScope = dateRange === "custom" ? dataset.labOrders : filtered.labOrders;
  const pendingLabs = labsScope.filter((lab) =>
    ["pending", "ordered", "in_progress"].includes(String(lab.status || "")),
  );
  const urgentPendingLabs = pendingLabs.filter((lab) => lab.is_urgent);
  const oldPendingLabs = pendingLabs.filter((lab) => {
    if (!lab.ordered_date) return false;
    return daysBetween(new Date(lab.ordered_date), now) >= 2;
  });
  if (pendingLabs.length > 0) {
    insights.push({
      id: "lab-follow-up",
      title: `${pendingLabs.length} בדיקות מעבדה ממתינות`,
      description:
        urgentPendingLabs.length > 0
          ? `${urgentPendingLabs.length} בדיקות מסומנות כדחופות, ו-${oldPendingLabs.length} ממתינות מעל 48 שעות.`
          : `${oldPendingLabs.length} בדיקות ממתינות מעל 48 שעות.`,
      severity:
        urgentPendingLabs.length > 0 || oldPendingLabs.length > 0
          ? "critical"
          : "info",
      category: "labs",
      metric: `${pendingLabs.length} ממתינות`,
      whyItMatters:
        "בדיקות שלא נסגרות בזמן יכולות לעכב אבחנה, טיפול והעברת מידע לבעלים.",
      recommendedAction:
        "לבדוק את פאנל תוצאות המעבדה, לעדכן סטטוסים וליצור קשר עם המעבדה אם צריך.",
      actionLabel: "פתח תיקי מטופלים",
      actionUrl: "/patients",
      score:
        pendingLabs.length * 200 +
        urgentPendingLabs.length * 700 +
        oldPendingLabs.length * 400,
    });
  }

  const appointmentsByDay = new Map<string, number>();
  futureAppointments.forEach((a) => {
    const key = new Date(a.start_time || "").toISOString().slice(0, 10);
    appointmentsByDay.set(key, (appointmentsByDay.get(key) || 0) + 1);
  });
  const busiestDay = [...appointmentsByDay.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];
  const avgAppointments = appointmentsByDay.size
    ? futureAppointments.length / appointmentsByDay.size
    : 0;
  if (
    busiestDay &&
    busiestDay[1] >= Math.max(5, Math.ceil(avgAppointments * 1.5))
  ) {
    insights.push({
      id: "appointment-load",
      title: `עומס תורים חריג בתאריך ${new Date(busiestDay[0]).toLocaleDateString("he-IL")}`,
      description: `נמצאו ${busiestDay[1]} תורים עתידיים באותו יום, לעומת ממוצע של ${avgAppointments.toFixed(1)} תורים ליום פעיל.`,
      severity: busiestDay[1] >= 8 ? "critical" : "warning",
      category: "appointments",
      metric: `${busiestDay[1]} תורים`,
      whyItMatters:
        "עומס יומי עלול להגדיל זמני המתנה, לחץ על הצוות ופגיעה בחוויית הלקוח.",
      recommendedAction:
        "לבדוק חלוקת תורים לפי רופא וחדר, ולשקול העברת תורים לא דחופים ליום רגוע יותר.",
      actionLabel: "פתח יומן תורים",
      actionUrl: "/appointments",
      score: busiestDay[1] * 180,
    });
  }

  const visitsByPet = new Map<number, Date>();
  dataset.medicalVisits.forEach((visit) => {
    if (!visit.pet_id || !visit.visit_date) return;
    const date = new Date(visit.visit_date);
    const prev = visitsByPet.get(Number(visit.pet_id));
    if (!prev || date > prev) visitsByPet.set(Number(visit.pet_id), date);
  });
  const inactivePets = dataset.patients.filter((pet) => {
    const lastVisit = visitsByPet.get(Number(pet.pet_id));
    if (!lastVisit) return true;
    return daysBetween(lastVisit, now) > 365;
  });
  if (inactivePets.length > 0) {
    const sample = inactivePets
      .slice(0, 3)
      .map((p) => petName(p))
      .join(", ");
    insights.push({
      id: "inactive-patient-followup",
      title: `${inactivePets.length} חיות ללא ביקור שנתי מתועד`,
      description: sample
        ? `דוגמאות: ${sample}.`
        : "יש חיות ללא ביקור עדכני במערכת.",
      severity: "info",
      category: "medical",
      metric: `${inactivePets.length} חיות`,
      whyItMatters:
        "חיות שלא מגיעות לביקורת עלולות לפספס חיסונים, מעקב משקל או זיהוי מוקדם של בעיות.",
      recommendedAction:
        "ליצור תזכורות ביקורת שנתית או לשלוח הודעה לבעלים הרלוונטיים.",
      actionLabel: "פתח לקוחות",
      actionUrl: "/clients",
      score: inactivePets.length * 120,
    });
  }

  if (filtered.medicalVisits.length > 0) {
    const diagnosisCounts = new Map<string, number>();
    filtered.medicalVisits.forEach((visit) => {
      const diagnosis = (visit.diagnosis || "").trim();
      if (!diagnosis) return;
      const normalized =
        diagnosis.length > 40 ? diagnosis.slice(0, 40) + "…" : diagnosis;
      diagnosisCounts.set(
        normalized,
        (diagnosisCounts.get(normalized) || 0) + 1,
      );
    });
    const topDiagnosis = [...diagnosisCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (topDiagnosis && topDiagnosis[1] >= 2) {
      insights.push({
        id: "repeated-diagnosis",
        title: `אבחנה שחוזרת על עצמה: ${topDiagnosis[0]}`,
        description: `האבחנה הופיעה ${topDiagnosis[1]} פעמים בטווח הדוח הנוכחי.`,
        severity: topDiagnosis[1] >= 5 ? "warning" : "info",
        category: "medical",
        metric: `${topDiagnosis[1]} מופעים`,
        whyItMatters:
          "חזרה על אבחנות יכולה להעיד על עונתיות, מגמה רפואית או צורך במעקב יזום.",
        recommendedAction:
          "לבדוק בדוח פעילות רפואית האם מדובר בעלייה חריגה או באירועים נקודתיים.",
        actionLabel: "פתח פעילות רפואית",
        actionUrl: "/reports",
        score: topDiagnosis[1] * 220,
      });
    }
  }

  const remindersScope = dateRange === "custom" ? dataset.reminders : filtered.reminders;
  const openReminders = remindersScope.filter((r) => r.status === "open");
  const overdueReminders = openReminders.filter(
    (r) => r.due_at && new Date(r.due_at) < now,
  );
  if (overdueReminders.length > 0) {
    insights.push({
      id: "client-reminder-gap",
      title: `${overdueReminders.length} תזכורות פתוחות שעבר זמנן`,
      description:
        "חלק מהלקוחות דורשים מעקב יזום סביב חיסונים, ביקורות, בדיקות או תשלומים.",
      severity: overdueReminders.length >= 5 ? "warning" : "info",
      category: "clients",
      metric: `${overdueReminders.length} באיחור`,
      whyItMatters:
        "תזכורות שלא נסגרות יוצרות פער בין המלצה רפואית לבין ביצוע בפועל.",
      recommendedAction: "לעבור לדוח מעקב לקוחות ולסגור/לעדכן תזכורות שבוצעו.",
      actionLabel: "פתח לקוחות",
      actionUrl: "/clients",
      score: overdueReminders.length * 180,
    });
  }

  const ownersWithoutPets = dataset.owners.filter(
    (owner) => !dataset.patients.some((pet) => pet.owner_id === owner.owner_id),
  );
  if (ownersWithoutPets.length > 0) {
    insights.push({
      id: "owners-without-pets",
      title: `${ownersWithoutPets.length} לקוחות ללא חיות משויכות`,
      description:
        "ייתכן שמדובר ברישום חלקי או בלקוח שנוצר אך לא הושלם לו כרטיס חיה.",
      severity: "info",
      category: "clients",
      metric: `${ownersWithoutPets.length} לקוחות`,
      whyItMatters:
        "לקוח ללא חיה לא יוכל לראות מידע מלא בפורטל ולא יופיע בתהליכי טיפול רפואי.",
      recommendedAction:
        "לעבור למסך לקוחות ולשייך חיה או למחוק רשומות בדיקה מיותרות.",
      actionLabel: "פתח לקוחות",
      actionUrl: "/clients",
      score: ownersWithoutPets.length * 90,
    });
  }

  const prescriptionsScope = dateRange === "custom" ? dataset.prescriptions : filtered.prescriptions;
  const activePrescriptions = prescriptionsScope.filter(
    (p) => p.start_date && daysBetween(new Date(p.start_date), now) <= 30,
  );
  if (activePrescriptions.length > 0) {
    insights.push({
      id: "active-prescriptions",
      title: `${activePrescriptions.length} מרשמים פעילים/חדשים בחודש האחרון`,
      description:
        "קיימים מרשמים שיכולים לדרוש מעקב מול הבעלים לגבי נטילה, תופעות לוואי או חידוש תרופה.",
      severity: "info",
      category: "medical",
      metric: `${activePrescriptions.length} מרשמים`,
      whyItMatters:
        "מעקב אחרי מרשמים מחזק המשכיות טיפול ומונע פספוס של טיפול תרופתי.",
      recommendedAction: "לוודא שבסיכומי הביקור מופיעות הוראות ברורות לבעלים.",
      actionLabel: "פתח תיקי מטופלים",
      actionUrl: "/patients",
      score: activePrescriptions.length * 80,
    });
  }

  const notificationsScope = dateRange === "custom" ? dataset.notifications : filtered.notifications;
  const unreadOwnerNotifications = notificationsScope.filter(
    (n) => n.target !== "staff" && !n.is_read,
  );
  if (unreadOwnerNotifications.length >= 5) {
    insights.push({
      id: "unread-owner-notifications",
      title: `${unreadOwnerNotifications.length} התראות בעלים עדיין לא נקראו`,
      description:
        "כמות גבוהה של התראות שלא נקראו יכולה להעיד על צורך במעקב בערוץ נוסף.",
      severity: "info",
      category: "clients",
      metric: `${unreadOwnerNotifications.length} לא נקראו`,
      whyItMatters:
        "אם בעלים לא רואה התראות, ייתכן שתזכורות רפואיות או תשלומים לא יטופלו בזמן.",
      recommendedAction:
        "לשקול יצירת קשר טלפוני עם לקוחות בעלי התראות קריטיות.",
      actionLabel: "פתח לקוחות",
      actionUrl: "/clients",
      score: unreadOwnerNotifications.length * 70,
    });
  }

  if (errors.length > 0) {
    insights.unshift({
      id: "report-data-errors",
      title: "חלק מהנתונים לא נטענו",
      description: `לא ניתן היה לטעון ${errors.length} טבלאות. ייתכן שחסרות הרשאות RLS או שהטבלאות עדיין לא קיימות.`,
      severity: "warning",
      category: "general",
      metric: `${errors.length} שגיאות`,
      whyItMatters: "תובנות חלקיות עלולות להוביל לתמונה ניהולית לא מלאה.",
      recommendedAction: errors
        .map((e) => `${e.table}: ${e.message}`)
        .join(" | "),
      actionLabel: "בדוק הרשאות",
      score: 9999,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "healthy-system",
      title: "לא זוהו חריגות משמעותיות",
      description:
        "המערכת לא מצאה חובות חריגים, עומסי תורים, בדיקות דחופות או בעיות מלאי בטווח שנבחר.",
      severity: "success",
      category: "general",
      metric: "תקין",
      whyItMatters:
        "זה מצביע על פעילות תפעולית יציבה לפי הנתונים הזמינים כרגע.",
      recommendedAction:
        "להמשיך לעקוב אחרי הדוחות התקופתיים ולשמור על עדכון נתונים שוטף.",
      actionLabel: "המשך מעקב",
      score: 1,
    });
  }

  const allowedCategories =
    contextCategories[context] || contextCategories.overview;
  const contextInsights = insights.filter((insight) =>
    allowedCategories.includes(insight.category),
  );

  if (contextInsights.length > 0) {
    return sortInsights(contextInsights);
  }

  // אם אין תובנה רלוונטית לדוח הנוכחי, לא מחזירים תובנה מדוח אחר.
  // כך נמנע מצב שבו דוח מלאי מציג תובנה על גבייה או דוח צוות מציג חוב כספי.
  const healthyInsight: InsightItem = {
      id: `healthy-${context}-${dateRange}`,
      title: `לא זוהו חריגות משמעותיות ב${contextLabel(context)}`,
      description: `בטווח ${getDateRangeLabel(dateRange)} לא נמצאו חריגות מהותיות בתחום הדוח הנוכחי.`,
      severity: "success",
      category: allowedCategories[0] || "general",
      metric: "תקין",
      whyItMatters: "הדוח הנוכחי אינו מצביע על סיכון מיידי שדורש טיפול מיוחד.",
      recommendedAction: "להמשיך לעקוב אחרי המדדים ולוודא שהנתונים מתעדכנים באופן שוטף.",
      actionLabel: "המשך מעקב",
      score: 1,
    };

  return [healthyInsight];
}


function splitAgentText(text: string) {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderInlineMarkdown(
  text: string,
  variant: "user" | "agent" | "system" = "agent",
) {
  const strongClass =
    variant === "user"
      ? "font-black text-white"
      : variant === "system"
        ? "font-black text-amber-950"
        : "font-black text-slate-950";

  const segments = text.split(/(\*\*[^*]+\*\*)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={index} className={strongClass}>
          {segment.slice(2, -2)}
        </strong>
      );
    }

    // במקרה שהמודל החזיר סימון Markdown לא סגור, לא מציגים כוכביות שבורות למשתמש.
    return <span key={index}>{segment.replace(/\*\*/g, "")}</span>;
  });
}

function normalizeAgentParagraph(part: string) {
  return part
    .replace(/^[-•]\s*/gm, "• ")
    .replace(/^\d+\.\s*/gm, (match) => match)
    .trim();
}

export function AIInsightsPanel({
  dateRange,
  context = "overview",
}: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "agent",
      text: "אני כאן כמו עוזר ניהולי למרפאה: אפשר לשאול אותי מה דחוף, איפה יש סיכון, למי לפנות ומה כדאי לעשות עכשיו. אני אתבסס על התובנות והנתונים שסוכמו מהמערכת, ואנסה לתת תשובה עם סדר עדיפויות ופעולות מעשיות.",
      createdAt: new Date().toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"chat" | "insights">("chat");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const generatedAt = useMemo(
    () =>
      new Date().toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [insights],
  );

  useEffect(() => {
    let mounted = true;

    async function loadInsights() {
      setIsLoading(true);
      setError(null);
      try {
        const generatedInsights = await generateInsights(dateRange, context);
        await persistGeneratedInsights(generatedInsights);
        const savedInsights = await fetchSavedInsights(context, dateRange);
        const nextInsights = mergeInsights(savedInsights, generatedInsights);
        if (mounted) setInsights(nextInsights);
      } catch (err) {
        console.error("Failed to generate report insights", err);
        if (mounted) setError("לא הצלחנו להפיק תובנות מהנתונים כרגע");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadInsights();
    setShowAll(false);

    return () => {
      mounted = false;
    };
  }, [dateRange, context]);

  useEffect(() => {
    if (!showAll || drawerTab !== "chat") return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, showAll, drawerTab, isChatLoading]);

  const criticalCount = insights.filter(
    (insight) => insight.severity === "critical",
  ).length;
  const warningCount = insights.filter(
    (insight) => insight.severity === "warning",
  ).length;

  async function updateInsightStatus(
    insight: InsightItem,
    status: "open" | "in_progress" | "resolved" | "dismissed",
  ) {
    if (!insight.persistedId) return;
    setActionLoadingId(insight.id);

    const { error } = await supabase
      .from("insights")
      .update({
        status,
        resolved_at:
          status === "resolved" || status === "dismissed"
            ? new Date().toISOString()
            : null,
      })
      .eq("insight_id", insight.persistedId);

    if (error) {
      console.error("Failed to update insight status", error);
      alert("לא הצלחנו לעדכן את סטטוס התובנה");
      setActionLoadingId(null);
      return;
    }

    setInsights((prev) => {
      if (status === "resolved" || status === "dismissed") {
        return prev.filter((item) => item.id !== insight.id);
      }

      return prev.map((item) =>
        item.id === insight.id
          ? { ...item, status, metric: statusLabels[status] }
          : item,
      );
    });
    setActionLoadingId(null);
  }

  async function saveGeneratedInsight(insight: InsightItem) {
    setActionLoadingId(insight.id);

    const { data, error } = await supabase
      .from("insights")
      .insert({
        title: insight.title,
        description: insight.description,
        category: insight.category,
        severity: insight.severity,
        status: "open",
        impact: insight.whyItMatters,
        recommended_action: insight.recommendedAction,
        action_label: insight.actionLabel || null,
        action_url: insight.actionUrl || getActionUrl(insight.category) || null,
      })
      .select("insight_id,status")
      .single();

    if (error) {
      console.error("Failed to save insight", error);
      alert("לא הצלחנו לשמור את התובנה למעקב");
      setActionLoadingId(null);
      return;
    }

    setInsights((prev) =>
      prev.map((item) =>
        item.id === insight.id
          ? {
              ...item,
              persistedId: data.insight_id,
              status: data.status,
              source: "saved",
              metric: statusLabels[data.status] || data.status,
            }
          : item,
      ),
    );
    setActionLoadingId(null);
  }

  async function askAgent(questionFromButton?: string) {
    const question = (questionFromButton || chatInput).trim();
    if (!question || isChatLoading) return;

    const nowText = new Date().toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: question,
      createdAt: nowText,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const payloadInsights = insights.slice(0, 10).map((insight) => ({
        title: insight.title,
        description: insight.description,
        severity: insight.severity,
        category: insight.category,
        whyItMatters: insight.whyItMatters,
        recommendedAction: insight.recommendedAction,
        metric: insight.metric,
      }));

      const { data, error } = await supabase.functions.invoke(
        "ai-insights-chat",
        {
          body: {
            question,
            context: contextLabel(context),
            dateRange,
            dateRangeLabel: rangeLabel,
            insights: payloadInsights,
            history: chatMessages
              .filter((message) => message.role === "user" || message.role === "agent")
              .slice(-8)
              .map((message) => ({
                role: message.role,
                text: message.text,
              })),
          },
        },
      );

      if (error) throw error;

      const answerText = typeof data?.answer === "string" && data.answer.trim()
        ? data.answer.trim()
        : "לא התקבלה תשובה מהסוכן.";
      const finalAnswer = data?.truncated
        ? `${answerText}

הערה: התשובה נחתכה בגלל מגבלת אורך. אפשר לכתוב "תמשיך מאיפה שעצרת".`
        : answerText;

      setChatMessages((prev) => [
        ...prev,
        {
          id: `agent-${Date.now()}`,
          role: "agent",
          text: finalAnswer,
          createdAt: new Date().toLocaleTimeString("he-IL", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } catch (err) {
      console.error("AI agent chat failed", err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `agent-error-${Date.now()}`,
          role: "system",
          text: "לא הצלחתי לפנות כרגע ל-AI. אפשר להמשיך להשתמש בתובנות החכמות שמבוססות על הנתונים המקומיים.",
          createdAt: new Date().toLocaleTimeString("he-IL", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  const primaryInsight = insights[0];
  const renderInsightActionButtons = (insight: InsightItem) => (
    <div className="flex flex-wrap items-center gap-2">
      {insight.actionLabel && (
        <button
          type="button"
          onClick={() => {
            const target = insight.actionUrl || getActionUrl(insight.category);
            if (target) window.location.href = target;
          }}
          className="text-[#1e40af] hover:text-[#1e3a8a] text-[12px] font-bold flex items-center gap-1.5 cursor-pointer"
        >
          {insight.actionLabel} <ArrowLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {insight.persistedId ? (
        <>
          {insight.status !== "in_progress" && (
            <button
              type="button"
              disabled={actionLoadingId === insight.id}
              onClick={() => updateInsightStatus(insight, "in_progress")}
              className="text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer disabled:opacity-60"
            >
              סמן בטיפול
            </button>
          )}
          <button
            type="button"
            disabled={actionLoadingId === insight.id}
            onClick={() => updateInsightStatus(insight, "resolved")}
            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer disabled:opacity-60"
          >
            סמן כטופל
          </button>
          <button
            type="button"
            disabled={actionLoadingId === insight.id}
            onClick={() => updateInsightStatus(insight, "dismissed")}
            className="text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer disabled:opacity-60"
          >
            דחה
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={actionLoadingId === insight.id}
          onClick={() => saveGeneratedInsight(insight)}
          className="text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer disabled:opacity-60"
        >
          שמור למעקב
        </button>
      )}
    </div>
  );

  const renderChatText = (text: string, variant: "user" | "agent" | "system" = "agent") => {
    const isUserMessage = variant === "user";
    const paragraphs = splitAgentText(text);
    if (paragraphs.length === 0) return null;

    return (
      <div className="space-y-2 break-words overflow-visible">
        {paragraphs.map((part, index) => {
          const normalized = normalizeAgentParagraph(part);
          const isBulletList = normalized.includes("\n• ") || normalized.startsWith("• ");
          if (isBulletList) {
            const lines = normalized.split("\n").filter(Boolean);
            return (
              <ul key={index} className={`space-y-1.5 text-[13px] leading-6 break-words ${isUserMessage ? "text-white" : "text-slate-700"}`}>
                {lines.map((line, lineIndex) => (
                  <li key={lineIndex} className="flex gap-2">
                    <span className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${isUserMessage ? "bg-white/80" : "bg-blue-400"}`} />
                    <span className="min-w-0 break-words">{renderInlineMarkdown(line.replace(/^•\s*/, ""), variant)}</span>
                  </li>
                ))}
              </ul>
            );
          }

          const isHeading = normalized.endsWith(":") && normalized.length < 45;
          return (
            <p
              key={index}
              className={`break-words whitespace-pre-wrap ${isHeading ? `text-[13px] font-black mt-3 ${isUserMessage ? "text-white" : "text-slate-900"}` : `text-[13px] leading-6 font-medium ${isUserMessage ? "text-white" : "text-slate-700"}`}`}
            >
              {renderInlineMarkdown(normalized, variant)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderInsightRow = (insight: InsightItem, featured = false) => {
    const Icon = categoryIcons[insight.category] || Lightbulb;
    const statusText = insight.status ? statusLabels[insight.status] || insight.status : "מחושבת";

    return (
      <article
        key={insight.id}
        className={`group rounded-2xl border bg-white transition-all ${featured ? "border-blue-100 shadow-sm" : "border-slate-100 hover:border-blue-100 hover:shadow-sm"}`}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`h-11 w-11 rounded-2xl border flex items-center justify-center shrink-0 ${severityStyles[insight.severity]}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-black ${severityStyles[insight.severity]}`}>
                  {severityLabels[insight.severity]}
                </span>
                <span className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full font-bold">
                  {categoryLabels[insight.category]}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusStyles[insight.status || "open"] || statusStyles.open}`}>
                  {statusText}
                </span>
              </div>
              <h3 className="text-[14px] leading-5 text-slate-950 font-black">
                {insight.title}
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-slate-600 font-medium">
                {insight.description}
              </p>
            </div>
          </div>

          {featured && (
            <div className="mt-3 grid gap-2">
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                <p className="text-[10px] font-black text-slate-400 mb-1">למה זה חשוב</p>
                <p className="text-[12px] leading-5 text-slate-700 font-medium">{insight.whyItMatters}</p>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-[10px] font-black text-blue-500 mb-1">פעולה מומלצת</p>
                <p className="text-[12px] leading-5 text-blue-800 font-bold">{insight.recommendedAction}</p>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {renderInsightActionButtons(insight)}
          </div>
        </div>
      </article>
    );
  };

  const openDrawer = (tab: "chat" | "insights" = "chat") => {
    setDrawerTab(tab);
    setShowAll(true);
  };

  const rangeLabel = getDateRangeLabel(dateRange);
  const topInsightText = primaryInsight
    ? `${primaryInsight.title} — ${primaryInsight.description}`
    : `לא זוהו חריגות משמעותיות בדוח ${contextLabel(context)} בטווח ${rangeLabel}.`;

  return (
    <>
      <section className="mb-4">
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-slate-950 to-blue-900 text-white flex items-center justify-center shadow-sm shrink-0">
                <Bot className="w-5 h-5" />
                {(criticalCount + warningCount) > 0 && (
                  <span className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                    {criticalCount + warningCount}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-slate-950 text-[15px] font-black">סוכן תובנות</h2>
                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-bold">Smart Agent</span>
                  <span className="hidden sm:inline-flex text-[11px] text-slate-400 font-semibold">{contextLabel(context)} · {rangeLabel} · עודכן {generatedAt}</span>
                </div>

                {isLoading ? (
                  <p className="text-slate-500 text-[12px] font-medium flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> מנתח את נתוני הדוח...
                  </p>
                ) : error ? (
                  <p className="text-red-600 text-[12px] font-bold flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> {error}
                  </p>
                ) : (
                  <p className="text-slate-600 text-[12px] leading-5 font-medium line-clamp-2 max-w-[820px]">
                    <span className="text-slate-900 font-black">תובנה מובילה:</span> {topInsightText}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden md:grid grid-cols-3 gap-1.5">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center min-w-[72px]">
                  <p className="text-[10px] text-slate-400 font-bold">סה״כ</p>
                  <p className="text-[15px] text-slate-900 font-black">{insights.length}</p>
                </div>
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center min-w-[72px]">
                  <p className="text-[10px] text-red-400 font-bold">קריטי</p>
                  <p className="text-[15px] text-red-700 font-black">{criticalCount}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-center min-w-[72px]">
                  <p className="text-[10px] text-amber-500 font-bold">חשוב</p>
                  <p className="text-[15px] text-amber-700 font-black">{warningCount}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openDrawer("chat")}
                className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white rounded-2xl px-4 py-3 text-[12px] font-black cursor-pointer shadow-sm flex items-center gap-2"
              >
                שאל את הסוכן <MessageCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openDrawer("insights")}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl px-4 py-3 text-[12px] font-black cursor-pointer flex items-center gap-2"
              >
                כל התובנות <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {!showAll && insights.length > 0 && (
        <button
          type="button"
          onClick={() => openDrawer("chat")}
          className="fixed right-6 bottom-6 z-[220] h-14 w-14 rounded-2xl bg-slate-950 hover:bg-slate-900 text-white shadow-2xl flex items-center justify-center cursor-pointer border border-white/10"
          aria-label="פתח סוכן תובנות"
        >
          <Bot className="w-6 h-6" />
          {(criticalCount + warningCount) > 0 && (
            <span className="absolute -top-2 -left-2 bg-red-500 text-white text-[11px] rounded-full min-w-6 h-6 px-1 flex items-center justify-center font-black border-2 border-white">
              {criticalCount + warningCount}
            </span>
          )}
        </button>
      )}

      {showAll && (
        <div className="fixed inset-0 z-[500] pointer-events-none" dir="rtl">
          <button
            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] pointer-events-auto lg:bg-transparent lg:backdrop-blur-0"
            type="button"
            onClick={() => setShowAll(false)}
            aria-label="סגור סוכן תובנות"
          />

          <aside className="absolute right-4 top-4 bottom-4 w-[min(460px,calc(100vw-2rem))] bg-white shadow-2xl border border-slate-200 rounded-3xl flex flex-col pointer-events-auto overflow-hidden">
            <header className="shrink-0 border-b border-slate-100 bg-white">
              <div className="px-4 py-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-2xl bg-slate-950 text-white flex items-center justify-center shadow-sm shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-slate-950 text-[18px] font-black">סוכן תובנות</h3>
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-bold">Smart Agent</span>
                    </div>
                    <p className="text-slate-500 text-[12px] font-semibold mt-0.5 truncate">
                      {getContextTitle(context)} · {rangeLabel} · עודכן {generatedAt}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="h-10 w-10 rounded-2xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center cursor-pointer text-slate-500 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2">
                  <p className="text-slate-400 text-[10px] font-black">סה״כ</p>
                  <p className="text-slate-950 text-[18px] font-black">{insights.length}</p>
                </div>
                <div className="rounded-2xl bg-red-50 border border-red-100 px-3 py-2">
                  <p className="text-red-400 text-[10px] font-black">קריטי</p>
                  <p className="text-red-700 text-[18px] font-black">{criticalCount}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2">
                  <p className="text-amber-500 text-[10px] font-black">חשוב</p>
                  <p className="text-amber-700 text-[18px] font-black">{warningCount}</p>
                </div>
              </div>

              <div className="px-4 pb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerTab("chat")}
                  className={`flex-1 rounded-2xl px-3 py-2 text-[12px] font-black border cursor-pointer ${drawerTab === "chat" ? "bg-[#1e40af] text-white border-[#1e40af]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >
                  צ׳אט
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("insights")}
                  className={`flex-1 rounded-2xl px-3 py-2 text-[12px] font-black border cursor-pointer ${drawerTab === "insights" ? "bg-[#1e40af] text-white border-[#1e40af]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >
                  תובנות למעקב
                </button>
              </div>
            </header>

            {drawerTab === "chat" ? (
              <>
                <div className="shrink-0 border-b border-slate-100 bg-blue-50/50 px-4 py-3">
                  <p className="text-[11px] font-black text-[#1e40af] mb-2 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" /> שאלות מהירות
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickQuestions.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        disabled={isChatLoading}
                        onClick={() => askAgent(item.question)}
                        className="bg-white hover:bg-blue-50 border border-blue-100 text-[#1e40af] rounded-full px-3 py-1.5 text-[11px] font-black cursor-pointer disabled:opacity-60"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/50 px-4 py-4 space-y-3">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[94%] min-w-0 rounded-3xl border px-4 py-3 shadow-sm break-words overflow-visible ${
                        message.role === "user"
                          ? "mr-auto bg-[#1e40af] text-white border-[#1e40af] rounded-bl-lg"
                          : message.role === "system"
                            ? "ml-auto bg-amber-50 text-amber-900 border-amber-100 rounded-br-lg"
                            : "ml-auto bg-white text-slate-700 border-slate-100 rounded-br-lg"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-black text-[10px] opacity-80">
                          {message.role === "user" ? "אתה" : message.role === "system" ? "מערכת" : "סוכן"}
                        </span>
                        <span className="text-[10px] opacity-60">{message.createdAt}</span>
                      </div>
                      <div className={`${message.role === "user" ? "text-white [&_*]:text-white" : message.role === "system" ? "text-amber-900" : "text-slate-700"} break-words overflow-visible`}>
                        {renderChatText(message.text, message.role)}
                      </div>
                    </div>
                  ))}

                  {isChatLoading && (
                    <div className="ml-auto max-w-[86%] rounded-3xl rounded-br-lg border border-slate-100 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500 text-[12px] font-bold">
                        <RefreshCw className="w-4 h-4 animate-spin" /> הסוכן מנתח את הדוח...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <footer className="shrink-0 border-t border-slate-100 bg-white p-4">
                  <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          askAgent();
                        }
                      }}
                      rows={2}
                      placeholder="שאל למשל: מה הייתי עושה היום כמנהל המרפאה?"
                      className="flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[13px] leading-5 focus:outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      disabled={!chatInput.trim() || isChatLoading}
                      onClick={() => askAgent()}
                      className="h-11 w-11 rounded-2xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {isChatLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-slate-400 font-medium">
                    הסוכן מסייע בניתוח תפעולי בלבד. החלטות רפואיות נשארות בידי הווטרינר.
                  </p>
                </footer>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 space-y-3">
                {isLoading ? (
                  <div className="rounded-2xl bg-white border border-slate-100 p-5 text-slate-500 text-[13px] font-bold flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> מנתח נתונים מהמסד...
                  </div>
                ) : insights.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-700 text-[13px] font-bold">
                    אין כרגע תובנות פתוחות.
                  </div>
                ) : (
                  insights.map((insight, index) => renderInsightRow(insight, index === 0))
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
