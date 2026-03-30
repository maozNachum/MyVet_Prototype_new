import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Clock, Users, Timer, AlertTriangle, TrendingUp, ArrowUp, ArrowDown,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Mock Data ───────────────────────────────────────────────────────
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

// Heatmap data: [day][hour] = intensity 0-10
const HEATMAP_RAW: number[][] = [
  [3, 7, 9, 8, 4, 2, 6, 8, 9, 7, 3], // Sunday
  [2, 5, 7, 9, 6, 3, 5, 7, 8, 6, 2], // Monday
  [4, 8, 10, 9, 5, 2, 7, 9, 10, 8, 4], // Tuesday
  [3, 6, 8, 7, 4, 3, 5, 6, 7, 5, 2], // Wednesday
  [5, 9, 10, 10, 7, 4, 8, 10, 9, 6, 3], // Thursday
];

interface VetMetrics {
  name: string;
  avgWaitTime: number; // minutes
  scheduledDuration: number; // avg minutes
  actualDuration: number; // avg minutes
  totalAppointments: number;
  overrunRate: number; // percentage
  patientSatisfaction: number; // 1-5
}

const VET_METRICS: VetMetrics[] = [
  { name: 'ד"ר שרה לוי', avgWaitTime: 8, scheduledDuration: 20, actualDuration: 24, totalAppointments: 42, overrunRate: 35, patientSatisfaction: 4.7 },
  { name: 'ד"ר יוסי כהן', avgWaitTime: 14, scheduledDuration: 20, actualDuration: 28, totalAppointments: 38, overrunRate: 55, patientSatisfaction: 4.5 },
  { name: 'ד"ר דוד מזרחי', avgWaitTime: 6, scheduledDuration: 30, actualDuration: 32, totalAppointments: 28, overrunRate: 22, patientSatisfaction: 4.8 },
];

const WAIT_TIME_HOURLY = HOURS.map((h, i) => ({
  hour: h,
  waitTime: [5, 8, 14, 18, 12, 6, 9, 15, 19, 11, 4][i],
}));

// ─── Helpers ─────────────────────────────────────────────────────────
function getHeatColor(intensity: number): string {
  if (intensity <= 2) return "bg-emerald-100 text-emerald-700";
  if (intensity <= 4) return "bg-emerald-200 text-emerald-800";
  if (intensity <= 6) return "bg-amber-200 text-amber-800";
  if (intensity <= 8) return "bg-orange-300 text-orange-900";
  return "bg-red-400 text-white";
}

// ─── Component ──────────────────────────────────────────────────────
export function StaffUtilization() {
  const [selectedVet, setSelectedVet] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredVets = VET_METRICS.filter((v) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return v.name.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { icon: Clock, label: "זמן המתנה ממוצע", value: "9 דק׳", trend: "down" as const, trendLabel: "-2 דק׳", color: "bg-blue-50 text-blue-600" },
          { icon: Timer, label: "חריגת זמן תור", value: "37%", trend: "up" as const, trendLabel: "+5%", color: "bg-amber-50 text-amber-600" },
          { icon: Users, label: "תפוסת צוות", value: "82%", trend: "up" as const, trendLabel: "+4%", color: "bg-purple-50 text-purple-600" },
          { icon: TrendingUp, label: "שביעות רצון", value: "4.67", trend: "up" as const, trendLabel: "+0.1", color: "bg-emerald-50 text-emerald-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <div className={`flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full ${
                kpi.trend === "up" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
              }`} style={{ fontWeight: 500 }}>
                {kpi.trend === "up" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {kpi.trendLabel}
              </div>
            </div>
            <p className="text-gray-500 font-medium text-[12px]">{kpi.label}</p>
            <p className="text-gray-900 text-[24px]" style={{ fontWeight: 700 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Heatmap ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>מפת חום — עומס לפי יום ושעה</h3>
            <p className="text-gray-500 font-medium text-[12px] mt-0.5">עוצמת הצבע = מספר תורים מקבילים</p>
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="py-2 px-1 text-right text-gray-500 text-[13px]" style={{ fontWeight: 600 }}>יום / שעה</th>
                  {HOURS.map((h) => (
                    <th key={h} className="py-2 px-1 text-center text-gray-500 font-medium text-[10px]" style={{ fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, di) => (
                  <tr key={day}>
                    <td className="py-1 px-1 text-right text-gray-600 text-[12px]" style={{ fontWeight: 500 }}>{day}</td>
                    {HEATMAP_RAW[di].map((val, hi) => (
                      <td key={`${di}-${hi}`} className="py-1 px-0.5">
                        <div className={`w-full h-9 rounded-lg flex items-center justify-center text-[13px] ${getHeatColor(val)}`} style={{ fontWeight: 600 }}>
                          {val}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 mt-4 text-[10px] text-gray-500 font-medium">
              <span>נמוך</span>
              <div className="flex gap-0.5">
                {["bg-emerald-100", "bg-emerald-200", "bg-amber-200", "bg-orange-300", "bg-red-400"].map((c) => (
                  <div key={c} className={`w-6 h-3 rounded ${c}`} />
                ))}
              </div>
              <span>גבוה</span>
            </div>
          </div>
        </div>

        {/* ── Wait Time by Hour ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>זמן המתנה ממוצע לפי שעה</h3>
            <p className="text-gray-500 font-medium text-[12px] mt-0.5">בדקות · כולל שהייה בקבלה ובחדר המתנה</p>
          </div>
          <div className="p-5">
            <div dir="ltr">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={WAIT_TIME_HOURLY}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 13 }} formatter={(v: number) => [`${v} דק׳`, "המתנה"]} />
                <Bar dataKey="waitTime" radius={[6, 6, 0, 0]}>
                  {WAIT_TIME_HOURLY.map((d, i) => (
                    <Cell key={`cell-wait-${i}`} fill={d.waitTime > 15 ? "#ef4444" : d.waitTime > 10 ? "#f59e0b" : "#10b981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Vet Breakdown ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>ניתוח ביצועים לפי רופא/ה</h3>
          <p className="text-gray-500 font-medium text-[12px] mt-0.5">זמן מתוכנן מול בפועל · חריגות · שביעות רצון</p>
        </div>
        <div className="p-5 space-y-3">
          <ReportSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="חיפוש לפי שם רופא/ה..." />
          {filteredVets.map((vet) => {
            const isSelected = selectedVet === vet.name;
            const durationDiff = vet.actualDuration - vet.scheduledDuration;
            const isOverrun = durationDiff > 0;
            return (
              <div
                key={vet.name}
                onClick={() => setSelectedVet(isSelected ? null : vet.name)}
                className={`rounded-xl border p-5 transition-all cursor-pointer ${
                  isSelected ? "border-[#1e40af] bg-blue-50/30 shadow-sm" : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl flex items-center justify-center">
                      <Users className="w-5 h-5 text-[#1e40af]" />
                    </div>
                    <div>
                      <p className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{vet.name}</p>
                      <p className="text-gray-500 font-medium text-[12px]">{vet.totalAppointments} תורים החודש</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[13px]">
                    <div className="text-center">
                      <p className="text-gray-500 font-medium text-[10px]">שביעות רצון</p>
                      <p className="text-gray-900" style={{ fontWeight: 700 }}>{vet.patientSatisfaction}/5</p>
                    </div>
                  </div>
                </div>

                {/* Metric bars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Wait time */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-gray-500 text-[13px]">המתנה ממוצעת</span>
                      <span className={`text-[13px] ${vet.avgWaitTime > 12 ? "text-red-500" : "text-emerald-600"}`} style={{ fontWeight: 600 }}>{vet.avgWaitTime} דק׳</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${vet.avgWaitTime > 12 ? "bg-red-400" : "bg-emerald-400"}`}
                        style={{ width: `${Math.min((vet.avgWaitTime / 25) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Scheduled vs Actual */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-gray-500 text-[13px]">מתוכנן → בפועל</span>
                      <span className={`text-[13px] flex items-center gap-1 ${isOverrun ? "text-amber-600" : "text-emerald-600"}`} style={{ fontWeight: 600 }}>
                        {vet.scheduledDuration}→{vet.actualDuration} דק׳
                        {isOverrun && <AlertTriangle className="w-3 h-3" />}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                      <div className="h-full rounded-full bg-blue-200" style={{ width: `${(vet.scheduledDuration / 40) * 100}%` }} />
                      <div className={`absolute top-0 h-full rounded-full ${isOverrun ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${(vet.actualDuration / 40) * 100}%`, opacity: 0.6 }} />
                    </div>
                  </div>

                  {/* Overrun Rate */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-gray-500 text-[13px]">שיעור חריגה</span>
                      <span className={`text-[13px] ${vet.overrunRate > 40 ? "text-red-500" : "text-emerald-600"}`} style={{ fontWeight: 600 }}>{vet.overrunRate}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${vet.overrunRate > 40 ? "bg-red-400" : vet.overrunRate > 25 ? "bg-amber-400" : "bg-emerald-400"}`}
                        style={{ width: `${vet.overrunRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}