import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Building2, DollarSign, FileText, Send, Check,
  ArrowUp, Crown, TrendingUp, Clock,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Mock Data ───────────────────────────────────────────────────────
interface ReferringClinic {
  id: number;
  name: string;
  city: string;
  contactPerson: string;
  phone: string;
  referralsThisMonth: number;
  referralsLastMonth: number;
  totalRevenue: number;
  avgRevenuePerCase: number;
  rank: number;
  referrals: {
    id: number;
    patientName: string;
    date: string;
    reason: string;
    revenue: number;
    dischargeStatus: "sent" | "pending" | "overdue";
  }[];
}

const REFERRING_CLINICS: ReferringClinic[] = [
  {
    id: 1, name: "מרפאת חי-פט", city: "תל אביב", contactPerson: "ד\"ר רונן שפירא", phone: "03-5551234",
    referralsThisMonth: 12, referralsLastMonth: 8, totalRevenue: 24800, avgRevenuePerCase: 2067, rank: 1,
    referrals: [
      { id: 1, patientName: "Sky (shpritz)", date: "16/03/2026", reason: "ניתוח אורתופדי", revenue: 4200, dischargeStatus: "sent" },
      { id: 2, patientName: "בלה (מלטז)", date: "14/03/2026", reason: "אולטרסאונד בטן", revenue: 1200, dischargeStatus: "sent" },
      { id: 3, patientName: "זאוס (דוברמן)", date: "12/03/2026", reason: "MRI עמוד שדרה", revenue: 3800, dischargeStatus: "pending" },
      { id: 4, patientName: "נלה (גולדן)", date: "10/03/2026", reason: "כירורגיית רקמות רכות", revenue: 5500, dischargeStatus: "overdue" },
    ],
  },
  {
    id: 2, name: "ד\"ר כהן וטרינר", city: "רמת גן", contactPerson: "ד\"ר אהוד כהן", phone: "03-6782345",
    referralsThisMonth: 8, referralsLastMonth: 10, totalRevenue: 18200, avgRevenuePerCase: 2275, rank: 2,
    referrals: [
      { id: 1, patientName: "צ'יקו (יורקי)", date: "15/03/2026", reason: "ניתוח שיניים מורכב", revenue: 2800, dischargeStatus: "sent" },
      { id: 2, patientName: "רוקי (בולדוג)", date: "11/03/2026", reason: "אנדוסקופיה", revenue: 2400, dischargeStatus: "pending" },
    ],
  },
  {
    id: 3, name: "מרפאת הפארק", city: "הרצליה", contactPerson: "ד\"ר מיכל ארנון", phone: "09-9553456",
    referralsThisMonth: 6, referralsLastMonth: 5, totalRevenue: 11500, avgRevenuePerCase: 1917, rank: 3,
    referrals: [
      { id: 1, patientName: "לילי (סיאמי)", date: "13/03/2026", reason: "ייעוץ דרמטולוגי", revenue: 850, dischargeStatus: "sent" },
      { id: 2, patientName: "בובו (צ'יוואווה)", date: "09/03/2026", reason: "צילום CT ראש", revenue: 3200, dischargeStatus: "sent" },
    ],
  },
  {
    id: 4, name: "מרפאת כנען", city: "חיפה", contactPerson: "ד\"ר נועם לבנון", phone: "04-8524567",
    referralsThisMonth: 4, referralsLastMonth: 3, totalRevenue: 7800, avgRevenuePerCase: 1950, rank: 4,
    referrals: [
      { id: 1, patientName: "סמבה (בוקסר)", date: "08/03/2026", reason: "כירורגיה אורתופדית", revenue: 4500, dischargeStatus: "overdue" },
    ],
  },
  {
    id: 5, name: "וטלב - מעבדה", city: "ראשון לציון", contactPerson: "ד\"ר עדי פרץ", phone: "03-9605678",
    referralsThisMonth: 3, referralsLastMonth: 2, totalRevenue: 4200, avgRevenuePerCase: 1400, rank: 5,
    referrals: [
      { id: 1, patientName: "מילו (קוקר)", date: "07/03/2026", reason: "בדיקות מעבדה מתקדמות", revenue: 1800, dischargeStatus: "sent" },
    ],
  },
];

const CHART_DATA = REFERRING_CLINICS.map((c) => ({
  name: c.name,
  referrals: c.referralsThisMonth,
  revenue: c.totalRevenue,
}));

const DISCHARGE_STYLE = {
  sent: { label: "נשלח", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Check },
  pending: { label: "ממתין", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  overdue: { label: "חורג!", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: Clock },
};

const BAR_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd"];

// ─── Component ──────────────────────────────────────────────────────
export function ReferralDashboard() {
  const [expandedClinic, setExpandedClinic] = useState<number | null>(null);
  const [sentDischarges, setSentDischarges] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const filteredClinics = REFERRING_CLINICS.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.referrals.some((r) => r.patientName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))
    );
  });

  const totalReferrals = REFERRING_CLINICS.reduce((s, c) => s + c.referralsThisMonth, 0);
  const totalRevenue = REFERRING_CLINICS.reduce((s, c) => s + c.totalRevenue, 0);
  const pendingDischarges = REFERRING_CLINICS.reduce(
    (s, c) => s + c.referrals.filter((r) => r.dischargeStatus !== "sent").length, 0
  );

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: "מרפאות מפנות", value: String(REFERRING_CLINICS.length), color: "bg-blue-50 text-blue-600" },
          { icon: ArrowUp, label: "הפניות החודש", value: String(totalReferrals), color: "bg-indigo-50 text-indigo-600" },
          { icon: DollarSign, label: "הכנסות מהפניות", value: `₪${totalRevenue.toLocaleString()}`, color: "bg-emerald-50 text-emerald-600" },
          { icon: FileText, label: "דוחות שחרור ממתינים", value: String(pendingDischarges), color: "bg-amber-50 text-amber-600" },
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

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>דירוג מרפאות מפנות — מרץ 2026</h3>
          <p className="text-gray-400 text-[12px] mt-0.5">מספר הפניות לפי מרפאה</p>
        </div>
        <div className="p-6">
          <div dir="ltr">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={CHART_DATA} layout="vertical">
              <defs>
                {CHART_DATA.map((entry, i) => (
                  <linearGradient key={`grad-${entry.name}-${i}`} id={`barColor-${i}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={BAR_COLORS[i % BAR_COLORS.length]} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={BAR_COLORS[i % BAR_COLORS.length]} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} />
              <Bar
                dataKey="referrals"
                name="הפניות"
                radius={[0, 8, 8, 0]}
                shape={(props: any) => {
                  const { x, y, width, height, index } = props;
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      rx={8}
                      ry={8}
                      fill={BAR_COLORS[(index ?? 0) % BAR_COLORS.length]}
                    />
                  );
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <ReportSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="חיפוש לפי מרפאה, עיר, איש קשר, מטופל..." />

      <div className="space-y-3">
        {filteredClinics.map((clinic) => {
          const isExpanded = expandedClinic === clinic.id;
          const trend = clinic.referralsThisMonth - clinic.referralsLastMonth;
          return (
            <div key={clinic.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedClinic(isExpanded ? null : clinic.id)}
                className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    clinic.rank === 1 ? "bg-amber-100" : clinic.rank === 2 ? "bg-gray-200" : clinic.rank === 3 ? "bg-orange-100" : "bg-blue-50"
                  }`}>
                    {clinic.rank <= 3 ? (
                      <Crown className={`w-5 h-5 ${
                        clinic.rank === 1 ? "text-amber-600" : clinic.rank === 2 ? "text-gray-600" : "text-orange-600"
                      }`} />
                    ) : (
                      <span className="text-blue-600 text-[14px]" style={{ fontWeight: 700 }}>#{clinic.rank}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{clinic.name}</span>
                      <span className="text-gray-400 text-[12px]">({clinic.city})</span>
                    </div>
                    <p className="text-gray-400 text-[12px]">{clinic.contactPerson} · {clinic.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-gray-400 text-[10px]">הפניות</p>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-900 text-[18px]" style={{ fontWeight: 700 }}>{clinic.referralsThisMonth}</span>
                      {trend !== 0 && (
                        <span className={`text-[11px] ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {trend > 0 ? `+${trend}` : trend}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 text-[10px]">הכנסות</p>
                    <span className="text-emerald-600 text-[16px]" style={{ fontWeight: 700 }}>₪{clinic.totalRevenue.toLocaleString()}</span>
                  </div>
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>הפניות אחרונות ודוחות שחרור</span>
                  </div>
                  <div className="space-y-2">
                    {clinic.referrals.map((ref) => {
                      const ds = DISCHARGE_STYLE[ref.dischargeStatus];
                      const DIcon = ds.icon;
                      const wasSent = sentDischarges.has(`${clinic.id}-${ref.id}`);
                      const showAsSent = ref.dischargeStatus === "sent" || wasSent;
                      return (
                        <div key={ref.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{ref.patientName}</span>
                              <span className="text-gray-400 text-[11px]">{ref.date}</span>
                            </div>
                            <p className="text-gray-500 text-[12px]">{ref.reason}</p>
                          </div>
                          <span className="text-emerald-600 text-[14px] shrink-0" style={{ fontWeight: 600 }}>₪{ref.revenue.toLocaleString()}</span>
                          <div className="shrink-0">
                            {showAsSent ? (
                              <span className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border ${DISCHARGE_STYLE.sent.bg} ${DISCHARGE_STYLE.sent.color}`} style={{ fontWeight: 500 }}>
                                <Check className="w-3 h-3" /> דוח נשלח
                              </span>
                            ) : (
                              <button
                                onClick={() => setSentDischarges((p) => new Set(p).add(`${clinic.id}-${ref.id}`))}
                                className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${ds.bg} ${ds.color} hover:opacity-80`}
                                style={{ fontWeight: 500 }}
                              >
                                <Send className="w-3 h-3" /> שלח דוח שחרור
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}