import { useState } from "react";
import {
  FileText, Syringe, FlaskConical, TrendingUp, ShieldCheck,
  Calendar, ChevronLeft, Download, Share2, CheckCircle2,
  XCircle, AlertTriangle, Clock, User, Pill, Eye,
  Weight, Droplets, Activity,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────
interface VisitSummary {
  id: number;
  date: string;
  reason: string;
  diagnosis: string;
  treatmentPlan: string;
  notes: string;
  vet: string;
  followUp?: string;
  medications?: { name: string; dose: string; duration: string }[];
}

interface Vaccine {
  id: number;
  name: string;
  date: string;
  expiryDate: string;
  serialNumber: string;
  manufacturer: string;
  expired: boolean;
  expiresSoon: boolean;
}

interface LabResult {
  id: number;
  date: string;
  type: "blood" | "urine" | "imaging" | "culture";
  title: string;
  status: "normal" | "abnormal" | "critical";
  vet: string;
  values?: { name: string; value: string; unit: string; range: string; status: "normal" | "high" | "low" }[];
  interpretation?: string;
}

interface WeightEntry { date: string; weight: number }
interface BloodMarkerEntry { date: string; value: number }

interface ConsentRecord {
  id: number;
  date: string;
  type: "consent" | "refusal";
  title: string;
  description: string;
  signedBy: string;
}

// ─── Mock Data per Pet ──────────────────────────────────────────────
const VISIT_SUMMARIES: Record<number, VisitSummary[]> = {
  1: [ // רקס
    {
      id: 1, date: "25/02/2026", reason: "חיסון שנתי — כלבת ומשושה",
      diagnosis: "מצב בריאותי תקין. אין ממצאים חריגים.",
      treatmentPlan: "חיסון כלבת + משושה ניתנו. אין צורך בטיפול נוסף.",
      notes: "יש לעקוב אחרי התנהגות ותיאבון ב-24 השעות הקרובות. במקרה של נפיחות באזור הזריקה — ליצור קשר.",
      vet: 'ד"ר יוסי כהן', followUp: "חיסון הבא: 02/04/2027",
      medications: [],
    },
    {
      id: 2, date: "10/11/2025", reason: "צולע ברגל אחורית ימנית",
      diagnosis: "חשד למתיחת רצועה קלה (Grade 1). אין שבר.",
      treatmentPlan: "מנוחה מוחלטת למשך שבוע, תרופה נוגדת דלקת. צילום ביקורת אם לא משתפר תוך 5 ימים.",
      notes: "להימנע מריצה וקפיצות. הליכות קצרות ברצועה בלבד. לעקוב אחרי הצליעה — אם מחמירה, לפנות מיד.",
      vet: 'ד"ר שרה לוי', followUp: "ביקורת: 17/11/2025",
      medications: [
        { name: "Rimadyl", dose: "50mg", duration: "5 ימים, פעם ביום עם אוכל" },
      ],
    },
    {
      id: 3, date: "05/06/2025", reason: "ניתוח סירוס מתוכנן",
      diagnosis: "ניתוח סירוס שגרתי בוצע ללא סיבוכים.",
      treatmentPlan: "מנוחה למשך 10 ימים. הסרת תפרים ביום ה-10. קולר צוואר חובה.",
      notes: "לוודא שלא מלקק את אזור הניתוח. לא לרחוץ 10 ימים. תזונה רגילה ממחר.",
      vet: 'ד"ר דוד מזרחי', followUp: "הסרת תפרים: 15/06/2025",
      medications: [
        { name: "Amoxicillin", dose: "250mg", duration: "7 ימים, פעמיים ביום" },
        { name: "Tramadol", dose: "50mg", duration: "3 ימים, לפי צורך לכאב" },
      ],
    },
  ],
  2: [ // ניקו
    {
      id: 1, date: "18/02/2026", reason: "טיפול תולעים שגרתי",
      diagnosis: "נמצאו תולעי מעיים (Roundworm). מצב כללי תקין.",
      treatmentPlan: "ניתנה כדורית Drontal. טיפול חוזר בעוד שבועיים.",
      notes: "לעקוב אחרי הצואה. במידה וממשיכים לראות תולעים אחרי הטיפול השני — ליצור קשר.",
      vet: 'ד"ר שרה לוי', followUp: "טיפול חוזר: 04/03/2026",
      medications: [
        { name: "Drontal Cat", dose: "כדורית אחת", duration: "מנה אחת, חוזרים בעוד שבועיים" },
      ],
    },
    {
      id: 2, date: "01/01/2026", reason: "חיסון משושה — מנת חיזוק שנתית",
      diagnosis: "מצב בריאותי תקין. מזריקים חיסון FVRCP.",
      treatmentPlan: "חיסון ניתן. אין צורך בפעולה נוספת.",
      notes: "ייתכנו עייפות קלה ו/או חום ב-24 שעות הקרובות — זה תקין. אם ממשיך מעל 48 שעות — ליצור קשר.",
      vet: 'ד"ר יוסי כהן', followUp: "חיסון הבא: 01/01/2027",
      medications: [],
    },
  ],
};

const VACCINES: Record<number, Vaccine[]> = {
  1: [
    { id: 1, name: "כלבת (Rabies)", date: "25/02/2026", expiryDate: "25/02/2027", serialNumber: "RAB-2026-44821", manufacturer: "Nobivac", expired: false, expiresSoon: false },
    { id: 2, name: "משושה (DHPP)", date: "25/02/2026", expiryDate: "25/02/2027", serialNumber: "DHPP-2026-55932", manufacturer: "Vanguard Plus", expired: false, expiresSoon: false },
    { id: 3, name: "לפטוספירוזיס", date: "10/11/2025", expiryDate: "10/11/2026", serialNumber: "LEP-2025-33210", manufacturer: "Nobivac L4", expired: false, expiresSoon: true },
    { id: 4, name: "Bordetella (שעלת)", date: "05/06/2025", expiryDate: "05/06/2026", serialNumber: "BOR-2025-17894", manufacturer: "Bronchi-Shield", expired: true, expiresSoon: false },
  ],
  2: [
    { id: 1, name: "משושה (FVRCP)", date: "01/01/2026", expiryDate: "01/01/2027", serialNumber: "FVRCP-2026-88412", manufacturer: "Purevax", expired: false, expiresSoon: false },
    { id: 2, name: "כלבת (Rabies)", date: "15/05/2025", expiryDate: "15/05/2026", serialNumber: "RAB-2025-66701", manufacturer: "Nobivac", expired: true, expiresSoon: false },
  ],
};

const LAB_RESULTS: Record<number, LabResult[]> = {
  1: [
    {
      id: 1, date: "25/02/2026", type: "blood", title: "ספירת דם מלאה (CBC)",
      status: "normal", vet: 'ד"ר יוסי כהן',
      values: [
        { name: "כדוריות אדומות (RBC)", value: "7.2", unit: "M/µL", range: "5.5–8.5", status: "normal" },
        { name: "המוגלובין (HGB)", value: "16.1", unit: "g/dL", range: "12–18", status: "normal" },
        { name: "כדוריות לבנות (WBC)", value: "11.3", unit: "K/µL", range: "6–17", status: "normal" },
        { name: "טסיות (PLT)", value: "285", unit: "K/µL", range: "175–500", status: "normal" },
        { name: "המטוקריט (HCT)", value: "48", unit: "%", range: "37–55", status: "normal" },
      ],
    },
    {
      id: 2, date: "10/11/2025", type: "blood", title: "בדיקת כימיה כללית",
      status: "abnormal", vet: 'ד"ר שרה לוי',
      values: [
        { name: "קריאטינין (CREA)", value: "1.8", unit: "mg/dL", range: "0.5–1.5", status: "high" },
        { name: "אוריאה (BUN)", value: "28", unit: "mg/dL", range: "7–27", status: "high" },
        { name: "ALT (כבד)", value: "45", unit: "U/L", range: "10–125", status: "normal" },
        { name: "גלוקוז", value: "95", unit: "mg/dL", range: "70–143", status: "normal" },
        { name: "חלבון כללי", value: "6.5", unit: "g/dL", range: "5.2–8.2", status: "normal" },
      ],
      interpretation: "ערכי כליות מעט גבוהים. מומלץ בדיקת שתן ומעקב חוזר בעוד 3 חודשים.",
    },
    {
      id: 3, date: "05/06/2025", type: "blood", title: "בדיקות טרום-ניתוח",
      status: "normal", vet: 'ד"ר דוד מזרחי',
      values: [
        { name: "קריאטינין (CREA)", value: "1.2", unit: "mg/dL", range: "0.5–1.5", status: "normal" },
        { name: "ALT (כבד)", value: "38", unit: "U/L", range: "10–125", status: "normal" },
        { name: "PT (קרישה)", value: "12", unit: "sec", range: "11–17", status: "normal" },
        { name: "גלוקוז", value: "102", unit: "mg/dL", range: "70–143", status: "normal" },
      ],
    },
    {
      id: 4, date: "10/11/2025", type: "imaging", title: "צילום רנטגן — רגל אחורית ימנית",
      status: "normal", vet: 'ד"ר שרה לוי',
      interpretation: "אין עדות לשבר או נזק מבני. רקמות רכות תקינות. ממצאים תואמים מתיחת רצועה קלה.",
    },
  ],
  2: [
    {
      id: 1, date: "18/02/2026", type: "blood", title: "ספירת דם מלאה (CBC)",
      status: "normal", vet: 'ד"ר שרה לוי',
      values: [
        { name: "כדוריות אדומות (RBC)", value: "8.5", unit: "M/µL", range: "5–10", status: "normal" },
        { name: "כדוריות לבנות (WBC)", value: "9.8", unit: "K/µL", range: "5.5–19.5", status: "normal" },
        { name: "טסיות (PLT)", value: "320", unit: "K/µL", range: "175–500", status: "normal" },
      ],
    },
  ],
};

const WEIGHT_HISTORY: Record<number, WeightEntry[]> = {
  1: [
    { date: "03/2024", weight: 28 }, { date: "06/2024", weight: 29.5 },
    { date: "09/2024", weight: 30.2 }, { date: "12/2024", weight: 31 },
    { date: "03/2025", weight: 31.5 }, { date: "06/2025", weight: 31.8 },
    { date: "09/2025", weight: 32 }, { date: "12/2025", weight: 32.5 },
    { date: "03/2026", weight: 32 },
  ],
  2: [
    { date: "03/2024", weight: 3.8 }, { date: "06/2024", weight: 4.1 },
    { date: "09/2024", weight: 4.3 }, { date: "12/2024", weight: 4.5 },
    { date: "03/2025", weight: 4.6 }, { date: "06/2025", weight: 4.7 },
    { date: "09/2025", weight: 4.8 }, { date: "12/2025", weight: 4.9 },
    { date: "03/2026", weight: 4.8 },
  ],
};

const CREATININE_HISTORY: Record<number, BloodMarkerEntry[]> = {
  1: [
    { date: "06/2024", value: 1.0 }, { date: "09/2024", value: 1.1 },
    { date: "12/2024", value: 1.0 }, { date: "06/2025", value: 1.2 },
    { date: "11/2025", value: 1.8 }, { date: "02/2026", value: 1.4 },
  ],
  2: [
    { date: "06/2025", value: 1.2 }, { date: "02/2026", value: 1.1 },
  ],
};

const CONSENT_RECORDS: Record<number, ConsentRecord[]> = {
  1: [
    { id: 1, date: "05/06/2025", type: "consent", title: "הסכמה לניתוח סירוס", description: "הבעלים הסכימו לביצוע ניתוח סירוס שגרתי כולל הרדמה כללית. הוסברו הסיכונים והסיבוכים האפשריים.", signedBy: "משפחת ישראלי" },
    { id: 2, date: "05/06/2025", type: "consent", title: "הסכמה להרדמה כללית", description: "הבעלים מאשרים ביצוע הרדמה כללית לצורך ניתוח. הוסברו סיכוני הרדמה כולל סיכון נדיר לתגובה אלרגית.", signedBy: "משפחת ישראלי" },
    { id: 3, date: "10/11/2025", type: "refusal", title: "סירוב לצילום MRI", description: "הבעלים סירבו לביצוע MRI לבירור נוסף של הצליעה. הוסבר שהבדיקה תאפשר אבחנה מדויקת יותר. הבעלים מעדיפים להמתין ולראות אם הטיפול השמרני עוזר.", signedBy: "משפחת ישראלי" },
    { id: 4, date: "25/02/2026", type: "consent", title: "הסכמה לחיסון שנתי", description: "הבעלים מאשרים מתן חיסון כלבת ומשושה. הוסברו תופעות לוואי אפשריות (נפיחות מקומית, חום קל).", signedBy: "משפחת ישראלי" },
  ],
  2: [
    { id: 1, date: "01/01/2026", type: "consent", title: "הסכמה לחיסון FVRCP", description: "הבעלים מאשרים מתן חיסון משושה. הוסברו תופעות לוואי.", signedBy: "משפחת ישראלי" },
    { id: 2, date: "18/02/2026", type: "refusal", title: "סירוב לטיפול שיניים", description: "הבעלים סירבו לניקוי שיניים בהרדמה שהומלץ בביקורת. הוסבר שדלקת חניכיים עלולה להחמיר. הבעלים מעוניינים לשקול ולחזור.", signedBy: "משפחת ישראלי" },
  ],
};

// ─── Tabs ─────────────────────────────────────────────────────────────
const REPORT_TABS = [
  { key: "visits" as const, label: "סיכומי ביקור", icon: FileText },
  { key: "vaccines" as const, label: "דרכון חיסונים", icon: Syringe },
  { key: "diagnostics" as const, label: "בדיקות ודימות", icon: FlaskConical },
  { key: "trends" as const, label: "מגמות בריאות", icon: TrendingUp },
  { key: "consents" as const, label: "הסכמות וסירובים", icon: ShieldCheck },
] as const;

type TabKey = typeof REPORT_TABS[number]["key"];

// ─── Sub-Components ──────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>{children}</div>;
}

function ShareButton({ label = "שיתוף קישור מאובטח" }: { label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-blue-200"
      style={{ fontWeight: 500 }}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
      {copied ? "הקישור הועתק!" : label}
    </button>
  );
}

function PDFButton() {
  return (
    <button
      className="flex items-center gap-1.5 text-[12px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-emerald-200"
      style={{ fontWeight: 500 }}
    >
      <Download className="w-3.5 h-3.5" /> ייצוא PDF
    </button>
  );
}

function StatusBadge({ status }: { status: "normal" | "abnormal" | "critical" | "high" | "low" }) {
  const config = {
    normal: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", label: "תקין" },
    abnormal: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", label: "חריג" },
    critical: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200", label: "קריטי" },
    high: { bg: "bg-red-50", text: "text-red-500", border: "border-red-200", label: "גבוה ↑" },
    low: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200", label: "נמוך ↓" },
  }[status];
  return (
    <span className={`${config.bg} ${config.text} ${config.border} border text-[10px] px-2 py-0.5 rounded-full`} style={{ fontWeight: 600 }}>
      {config.label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
interface ClientMedicalReportsProps {
  petId: number;
  petName: string;
}

export function ClientMedicalReports({ petId, petName }: ClientMedicalReportsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("visits");
  const [expandedVisit, setExpandedVisit] = useState<number | null>(null);
  const [expandedLab, setExpandedLab] = useState<number | null>(null);

  const visits = VISIT_SUMMARIES[petId] || [];
  const vaccines = VACCINES[petId] || [];
  const labResults = LAB_RESULTS[petId] || [];
  const weightHistory = WEIGHT_HISTORY[petId] || [];
  const creatinineHistory = CREATININE_HISTORY[petId] || [];
  const consents = CONSENT_RECORDS[petId] || [];

  const nextVaccineDate = vaccines
    .filter((v) => !v.expired)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]?.expiryDate;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 rounded-xl p-1">
        {REPORT_TABS.map((tab) => {
          const TIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] transition-all cursor-pointer ${
                isActive ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
              style={{ fontWeight: isActive ? 600 : 400 }}
            >
              <TIcon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* FHIR compliance badge */}
      <div className="flex items-center gap-2 text-[13px] text-gray-500 font-medium">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>נתונים מאובטחים בהתאם לחוק הגנת הפרטיות · תקן HL7 FHIR · שיתוף בקליק אחד</span>
      </div>

      {/* ═══ 1. Visit Summaries ═══ */}
      {activeTab === "visits" && (
        <div className="space-y-3">
          {visits.length === 0 ? (
            <div className="text-center py-10 text-gray-500 font-medium">
              <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-[14px]">אין סיכומי ביקור עדיין</p>
            </div>
          ) : (
            visits.map((visit) => {
              const isExpanded = expandedVisit === visit.id;
              return (
                <SectionCard key={visit.id}>
                  <button
                    onClick={() => setExpandedVisit(isExpanded ? null : visit.id)}
                    className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-right">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{visit.reason}</span>
                          <span className="text-gray-500 font-medium text-[12px]">{visit.date}</span>
                        </div>
                        <p className="text-gray-500 font-medium text-[12px]">{visit.vet}</p>
                      </div>
                    </div>
                    <ChevronLeft className={`w-4 h-4 text-gray-500 font-medium transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-5 space-y-4">
                      {/* Reason */}
                      <div>
                        <p className="text-gray-500 text-[13px] mb-1" style={{ fontWeight: 600 }}>סיבת הביקור</p>
                        <p className="text-gray-800 text-[13px] bg-blue-50/50 rounded-lg px-3 py-2 border border-blue-100">{visit.reason}</p>
                      </div>

                      {/* Diagnosis */}
                      <div>
                        <p className="text-gray-500 text-[13px] mb-1" style={{ fontWeight: 600 }}>🩺 מה הרופא/ה חושב/ת?</p>
                        <p className="text-gray-800 text-[13px]" style={{ lineHeight: 1.7 }}>{visit.diagnosis}</p>
                      </div>

                      {/* Treatment Plan */}
                      <div>
                        <p className="text-gray-500 text-[13px] mb-1" style={{ fontWeight: 600 }}>📋 תוכנית טיפול — מה עושים עכשיו?</p>
                        <p className="text-gray-800 text-[13px]" style={{ lineHeight: 1.7 }}>{visit.treatmentPlan}</p>
                      </div>

                      {/* Medications */}
                      {visit.medications && visit.medications.length > 0 && (
                        <div>
                          <p className="text-gray-500 text-[13px] mb-2" style={{ fontWeight: 600 }}>💊 תרופות</p>
                          <div className="space-y-2">
                            {visit.medications.map((med, i) => (
                              <div key={i} className="flex items-center gap-3 bg-amber-50/60 rounded-lg px-3 py-2 border border-amber-100">
                                <Pill className="w-4 h-4 text-amber-600 shrink-0" />
                                <div className="text-[13px]">
                                  <span className="text-gray-900" style={{ fontWeight: 600 }}>{med.name}</span>
                                  <span className="text-gray-500"> — {med.dose}</span>
                                  <p className="text-gray-500 font-medium text-[13px]">{med.duration}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <p className="text-gray-500 text-[13px] mb-1" style={{ fontWeight: 600 }}>📝 הנחיות לבעלים — מה חשוב שתעשו</p>
                        <p className="text-gray-800 text-[13px] bg-emerald-50/50 rounded-lg px-3 py-2 border border-emerald-100" style={{ lineHeight: 1.7 }}>{visit.notes}</p>
                      </div>

                      {/* Follow-up */}
                      {visit.followUp && (
                        <div className="flex items-center gap-2 text-[12px] text-indigo-600 bg-indigo-50/60 rounded-lg px-3 py-2 border border-indigo-100">
                          <Calendar className="w-3.5 h-3.5" />
                          <span style={{ fontWeight: 500 }}>{visit.followUp}</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <PDFButton />
                        <ShareButton />
                      </div>
                    </div>
                  )}
                </SectionCard>
              );
            })
          )}
        </div>
      )}

      {/* ═══ 2. Vaccine Passport ═══ */}
      {activeTab === "vaccines" && (
        <div className="space-y-4">
          {/* Consolidated reminder */}
          {nextVaccineDate && (
            <div className="bg-gradient-to-l from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>תזכורת חיסונים מאוחדת</p>
                <p className="text-gray-600 text-[12px]">
                  החיסון הקרוב ביותר שפג תוקפו: <span style={{ fontWeight: 600 }}>{nextVaccineDate}</span>.
                  {vaccines.filter((v) => v.expired).length > 0 && (
                    <span className="text-red-500"> · {vaccines.filter((v) => v.expired).length} חיסונים פגי תוקף!</span>
                  )}
                </p>
              </div>
              <ShareButton label="שתף דרכון" />
            </div>
          )}

          {/* Vaccine list */}
          <SectionCard>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>דרכון חיסונים דיגיטלי — {petName}</h4>
                <p className="text-gray-500 font-medium text-[13px]">כולל מספר סידורי ומועד תפוגה · תקף לנסיעות ופנסיונים</p>
              </div>
              <PDFButton />
            </div>
            <div className="divide-y divide-gray-50">
              {vaccines.map((vac) => (
                <div key={vac.id} className={`px-5 py-4 flex items-center gap-4 ${vac.expired ? "bg-red-50/30" : ""}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    vac.expired ? "bg-red-100" : vac.expiresSoon ? "bg-amber-100" : "bg-emerald-50"
                  }`}>
                    <Syringe className={`w-5 h-5 ${
                      vac.expired ? "text-red-500" : vac.expiresSoon ? "text-amber-600" : "text-emerald-600"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{vac.name}</span>
                      {vac.expired && (
                        <span className="bg-red-50 text-red-500 border border-red-200 text-[10px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>פג תוקף</span>
                      )}
                      {vac.expiresSoon && !vac.expired && (
                        <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>עומד לפוג</span>
                      )}
                      {!vac.expired && !vac.expiresSoon && (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>בתוקף</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-[13px] text-gray-500">
                      <span>תאריך: {vac.date}</span>
                      <span>תפוגה: {vac.expiryDate}</span>
                      <span>יצרן: {vac.manufacturer}</span>
                    </div>
                    <p className="text-gray-500 font-medium text-[10px] mt-0.5 font-mono">S/N: {vac.serialNumber}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ═══ 3. Diagnostics & Imaging ═══ */}
      {activeTab === "diagnostics" && (
        <div className="space-y-3">
          {labResults.length === 0 ? (
            <div className="text-center py-10 text-gray-500 font-medium">
              <FlaskConical className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-[14px]">אין תוצאות בדיקות</p>
            </div>
          ) : (
            labResults.map((lab) => {
              const isExpanded = expandedLab === lab.id;
              const typeIcon = lab.type === "imaging" ? Eye : FlaskConical;
              const TypeIcon = typeIcon;
              return (
                <SectionCard key={lab.id}>
                  <button
                    onClick={() => setExpandedLab(isExpanded ? null : lab.id)}
                    className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 text-right">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        lab.status === "normal" ? "bg-emerald-50" : lab.status === "abnormal" ? "bg-amber-50" : "bg-red-50"
                      }`}>
                        <TypeIcon className={`w-5 h-5 ${
                          lab.status === "normal" ? "text-emerald-600" : lab.status === "abnormal" ? "text-amber-600" : "text-red-500"
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{lab.title}</span>
                          <StatusBadge status={lab.status} />
                        </div>
                        <p className="text-gray-500 font-medium text-[12px]">{lab.date} · {lab.vet}</p>
                      </div>
                    </div>
                    <ChevronLeft className={`w-4 h-4 text-gray-500 font-medium transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-5 space-y-4">
                      {/* Values table */}
                      {lab.values && lab.values.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="border-b border-gray-200">
                                {["בדיקה", "תוצאה", "יחידה", "טווח תקין", "סטטוס"].map((h) => (
                                  <th key={h} className="py-2.5 px-3 text-right text-gray-500" style={{ fontWeight: 600 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {lab.values.map((v, i) => (
                                <tr key={i} className={`border-b border-gray-50 ${v.status !== "normal" ? "bg-red-50/30" : ""}`}>
                                  <td className="py-2.5 px-3 text-gray-900" style={{ fontWeight: 500 }}>{v.name}</td>
                                  <td className={`py-2.5 px-3 ${v.status !== "normal" ? "text-red-600" : "text-gray-700"}`} style={{ fontWeight: v.status !== "normal" ? 700 : 400 }}>{v.value}</td>
                                  <td className="py-2.5 px-3 text-gray-500">{v.unit}</td>
                                  <td className="py-2.5 px-3 text-gray-500 font-medium">{v.range}</td>
                                  <td className="py-2.5 px-3"><StatusBadge status={v.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Interpretation */}
                      {lab.interpretation && (
                        <div className="bg-amber-50/50 rounded-lg px-4 py-3 border border-amber-100">
                          <p className="text-gray-500 text-[13px] mb-1" style={{ fontWeight: 600 }}>פירוש הרופא/ה</p>
                          <p className="text-gray-800 text-[13px]" style={{ lineHeight: 1.7 }}>{lab.interpretation}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <PDFButton />
                        <ShareButton label="שלח לרופא/ה אחר/ת" />
                      </div>
                    </div>
                  )}
                </SectionCard>
              );
            })
          )}
        </div>
      )}

      {/* ═══ 4. Medical Trends ═══ */}
      {activeTab === "trends" && (
        <div className="space-y-4">
          {/* Weight Chart */}
          <SectionCard>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Weight className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>מעקב משקל — {petName}</h4>
                  <p className="text-gray-500 font-medium text-[13px]">3 שנים אחרונות</p>
                </div>
              </div>
              <ShareButton />
            </div>
            <div className="p-5">
              {weightHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weightHistory}>
                    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis key="xaxis" dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis key="yaxis" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                    <Tooltip key="tooltip" contentStyle={{ borderRadius: 12, fontSize: 13 }} formatter={(v: number) => [`${v} ק"ג`, "משקל"]} />
                    <Line key="weight-line" type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: "#6366f1" }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-gray-500 font-medium py-8 text-[14px]">אין נתוני משקל</p>
              )}
            </div>
          </SectionCard>

          {/* Creatinine Chart */}
          {creatinineHistory.length > 1 && (
            <SectionCard>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                    <Droplets className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>מעקב קריאטינין (תפקודי כליות)</h4>
                    <p className="text-gray-500 font-medium text-[13px]">סמן קריטי למעקב מחלת כליות כרונית</p>
                  </div>
                </div>
                <ShareButton />
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={creatinineHistory}>
                    <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis key="xaxis" dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis key="yaxis" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                    <Tooltip key="tooltip" contentStyle={{ borderRadius: 12, fontSize: 13 }} formatter={(v: number) => [`${v} mg/dL`, "קריאטינין"]} />
                    <ReferenceLine key="ref-line" y={1.5} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "גבול עליון (1.5)", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                    <Line key="creatinine-line" type="monotone" dataKey="value" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4, fill: "#f43f5e" }} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 bg-amber-50/60 rounded-lg px-3 py-2 border border-amber-100 text-[12px] text-gray-600 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>ערך הקריאטינין חרג מהטווח התקין בנובמבר 2025 (1.8). בדיקת מעקב בפברואר 2026 הראתה ירידה ל-1.4 — מגמה חיובית.</span>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Vital stats summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Weight, label: "משקל נוכחי", value: weightHistory[weightHistory.length - 1]?.weight + ' ק"ג' || "—", color: "bg-indigo-50 text-indigo-600" },
              { icon: Activity, label: "קריאטינין אחרון", value: creatinineHistory[creatinineHistory.length - 1]?.value + " mg/dL" || "—", color: "bg-rose-50 text-rose-500" },
              { icon: TrendingUp, label: "מגמה כללית", value: "יציבה", color: "bg-emerald-50 text-emerald-600" },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-gray-500 font-medium text-[13px]">{item.label}</p>
                  <p className="text-gray-900 text-[16px]" style={{ fontWeight: 700 }}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 5. Consents & Refusals ═══ */}
      {activeTab === "consents" && (
        <div className="space-y-3">
          {consents.length === 0 ? (
            <div className="text-center py-10 text-gray-500 font-medium">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-[14px]">אין רשומות הסכמה או סירוב</p>
            </div>
          ) : (
            <>
              {/* Summary pills */}
              <div className="flex items-center gap-3 mb-1">
                <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[12px] px-3 py-1.5 rounded-lg border border-emerald-200" style={{ fontWeight: 500 }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {consents.filter((c) => c.type === "consent").length} הסכמות חתומות
                </span>
                <span className="flex items-center gap-1.5 bg-red-50 text-red-600 text-[12px] px-3 py-1.5 rounded-lg border border-red-200" style={{ fontWeight: 500 }}>
                  <XCircle className="w-3.5 h-3.5" />
                  {consents.filter((c) => c.type === "refusal").length} סירובים מתועדים
                </span>
              </div>

              {consents.map((consent) => {
                const isRefusal = consent.type === "refusal";
                return (
                  <SectionCard key={consent.id}>
                    <div className={`px-5 py-4 flex items-start gap-4 ${isRefusal ? "bg-red-50/20" : ""}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isRefusal ? "bg-red-100" : "bg-emerald-50"
                      }`}>
                        {isRefusal
                          ? <XCircle className="w-5 h-5 text-red-500" />
                          : <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{consent.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            isRefusal
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200"
                          }`} style={{ fontWeight: 600 }}>
                            {isRefusal ? "סירוב" : "הסכמה"}
                          </span>
                        </div>
                        <p className="text-gray-600 text-[13px] mb-2" style={{ lineHeight: 1.7 }}>{consent.description}</p>
                        <div className="flex items-center gap-3 text-[13px] text-gray-500 font-medium">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{consent.date}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{consent.signedBy}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <PDFButton />
                      </div>
                    </div>
                  </SectionCard>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}