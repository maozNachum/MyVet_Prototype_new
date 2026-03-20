import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Radar, AlertTriangle, MapPin, Megaphone,
  Check, ArrowUp, ArrowDown, Shield, Bug, Zap,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Mock Data ───────────────────────────────────────────────────────
interface DiseaseAlert {
  id: number;
  name: string;
  nameEn: string;
  species: "dog" | "cat" | "both";
  casesThisMonth: number;
  casesLastMonth: number;
  trend: "rising" | "falling" | "stable";
  severity: "high" | "medium" | "low";
  affectedAreas: string[];
  description: string;
}

const DISEASE_ALERTS: DiseaseAlert[] = [
  {
    id: 1, name: "שעלת מלונות", nameEn: "Kennel Cough", species: "dog",
    casesThisMonth: 18, casesLastMonth: 7, trend: "rising", severity: "high",
    affectedAreas: ["תל אביב צפון", "רמת אביב", "הרצליה"],
    description: "עלייה חדה של 157% במקרי שעלת מלונות. ריכוז באזור הפארקים בצפון ת\"א. מומלץ להציע חיסון Bordetella ללקוחות באזור.",
  },
  {
    id: 2, name: "פרבו-וירוס", nameEn: "Parvovirus", species: "dog",
    casesThisMonth: 5, casesLastMonth: 2, trend: "rising", severity: "high",
    affectedAreas: ["דרום תל אביב", "יפו", "בת ים"],
    description: "5 מקרים מאושרים החודש, רובם בגורים לא מחוסנים. אזהרה קריטית ללקוחות עם גורים צעירים.",
  },
  {
    id: 3, name: "FIV (איידס חתולים)", nameEn: "FIV", species: "cat",
    casesThisMonth: 3, casesLastMonth: 4, trend: "falling", severity: "medium",
    affectedAreas: ["רמת גן", "גבעתיים"],
    description: "ירידה קלה במקרים. עדיין מומלץ לעודד בדיקת FIV/FeLV לחתולים חדשים.",
  },
  {
    id: 4, name: "לייסמניה", nameEn: "Leishmaniasis", species: "dog",
    casesThisMonth: 8, casesLastMonth: 6, trend: "rising", severity: "medium",
    affectedAreas: ["הרצליה", "כפר שמריהו", "רעננה"],
    description: "עלייה עונתית צפויה עם כניסת האביב. מומלץ להזכיר ללקוחות חידוש רצועת Scalibor.",
  },
  {
    id: 5, name: "דלקת עיניים ויראלית", nameEn: "Feline Herpesvirus", species: "cat",
    casesThisMonth: 4, casesLastMonth: 5, trend: "stable", severity: "low",
    affectedAreas: ["תל אביב מרכז"],
    description: "מספר יציב, ללא מגמת עלייה. מומלץ לעדכן חיסון FVRCP.",
  },
];

// Trend line data (last 6 months)
const TREND_DATA = [
  { month: "אוקטובר", שעלת: 3, פרבו: 1, לייסמניה: 2, FIV: 5 },
  { month: "נובמבר", שעלת: 4, פרבו: 1, לייסמניה: 3, FIV: 4 },
  { month: "דצמבר", שעלת: 5, פרבו: 2, לייסמניה: 4, FIV: 4 },
  { month: "ינואר", שעלת: 7, פרבו: 2, לייסמניה: 5, FIV: 4 },
  { month: "פברואר", שעלת: 10, פרבו: 3, לייסמניה: 6, FIV: 3 },
  { month: "מרץ", שעלת: 18, פרבו: 5, לייסמניה: 8, FIV: 3 },
];

const SEVERITY_STYLE = {
  high: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "סיכון גבוה", dotColor: "bg-red-500" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "סיכון בינוני", dotColor: "bg-amber-500" },
  low: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "סיכון נמוך", dotColor: "bg-emerald-500" },
};

// ─── Component ──────────────────────────────────────────────────────
export function EpiRadar() {
  const [campaignSent, setCampaignSent] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const filteredDiseases = DISEASE_ALERTS.filter((d) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.nameEn.toLowerCase().includes(q) ||
      d.species.includes(q) ||
      d.affectedAreas.some((a) => a.toLowerCase().includes(q)) ||
      d.description.toLowerCase().includes(q)
    );
  });

  const totalCases = DISEASE_ALERTS.reduce((s, d) => s + d.casesThisMonth, 0);
  const highAlerts = DISEASE_ALERTS.filter((d) => d.severity === "high").length;

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { icon: Bug, label: "מקרים החודש", value: String(totalCases), color: "bg-rose-50 text-rose-600" },
          { icon: AlertTriangle, label: "התראות גבוהות", value: String(highAlerts), color: "bg-red-50 text-red-600" },
          { icon: Radar, label: "מחלות פעילות", value: String(DISEASE_ALERTS.length), color: "bg-purple-50 text-purple-600" },
          { icon: Shield, label: "אזורים מושפעים", value: String(new Set(DISEASE_ALERTS.flatMap((d) => d.affectedAreas)).size), color: "bg-blue-50 text-blue-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-gray-400 text-[12px]">{kpi.label}</p>
              <p className="text-gray-900 text-[22px]" style={{ fontWeight: 700 }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>מגמות מחלות — 6 חודשים אחרונים</h3>
          <p className="text-gray-400 text-[12px] mt-0.5">אבחנות מאומתות ברדיוס המרפאה</p>
        </div>
        <div className="p-6">
          <div dir="ltr">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={TREND_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* No explicit key props — recharts manages them internally to avoid duplicate key warnings */}
              <Area type="monotone" dataKey="שעלת" stroke="#ef4444" fill="#fee2e2" strokeWidth={2} />
              <Area type="monotone" dataKey="פרבו" stroke="#f59e0b" fill="#fef3c7" strokeWidth={2} />
              <Area type="monotone" dataKey="לייסמניה" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} />
              <Area type="monotone" dataKey="FIV" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Disease Cards */}
      <div className="space-y-3">
        <ReportSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="חיפוש לפי מחלה, אזור, מין חיה..." />
        {filteredDiseases.map((disease) => {
          const style = SEVERITY_STYLE[disease.severity];
          const trendPercent = disease.casesLastMonth > 0
            ? Math.round(((disease.casesThisMonth - disease.casesLastMonth) / disease.casesLastMonth) * 100)
            : 100;
          const isCampaignSent = campaignSent.has(disease.id);

          return (
            <div key={disease.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${style.border}`}>
              <div className="px-5 py-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center`}>
                      <Zap className={`w-5 h-5 ${style.text}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{disease.name}</span>
                        <span className="text-gray-400 text-[11px]">({disease.nameEn})</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text}`} style={{ fontWeight: 600 }}>
                          {style.badge}
                        </span>
                        <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                          {disease.species === "dog" ? "כלבים" : disease.species === "cat" ? "חתולים" : "כלבים + חתולים"}
                        </span>
                      </div>
                      <p className="text-gray-400 text-[12px]">{disease.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 mr-4">
                    <div className="text-center">
                      <p className="text-gray-400 text-[10px]">מקרים</p>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-900 text-[20px]" style={{ fontWeight: 700 }}>{disease.casesThisMonth}</span>
                        {disease.trend === "rising" && (
                          <span className="text-red-500 text-[11px] flex items-center"><ArrowUp className="w-3 h-3" />+{trendPercent}%</span>
                        )}
                        {disease.trend === "falling" && (
                          <span className="text-emerald-600 text-[11px] flex items-center"><ArrowDown className="w-3 h-3" />{trendPercent}%</span>
                        )}
                        {disease.trend === "stable" && (
                          <span className="text-gray-400 text-[11px]">יציב</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Affected Areas */}
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    {disease.affectedAreas.map((area) => (
                      <span key={area} className="bg-gray-100 text-gray-600 text-[11px] px-2.5 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Campaign Action */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <div className={`w-2 h-2 rounded-full ${style.dotColor}`} />
                    <span>חודש קודם: {disease.casesLastMonth} מקרים</span>
                  </div>
                  {isCampaignSent ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 text-[12px] bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-200" style={{ fontWeight: 500 }}>
                      <Check className="w-3.5 h-3.5" /> קמפיין נשלח ללקוחות באזור
                    </span>
                  ) : (
                    <button
                      onClick={() => setCampaignSent((p) => new Set(p).add(disease.id))}
                      className="flex items-center gap-1.5 bg-gradient-to-l from-[#1e40af] to-[#2563eb] hover:from-[#1e3a8a] hover:to-[#1e40af] text-white text-[12px] px-4 py-2 rounded-lg transition-all cursor-pointer shadow-sm"
                      style={{ fontWeight: 500 }}
                    >
                      <Megaphone className="w-3.5 h-3.5" /> הפק קמפיין שיווקי ללקוחות באזור
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
