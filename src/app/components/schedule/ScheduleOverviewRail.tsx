import { AlertTriangle, Stethoscope, Users } from "lucide-react";
import type { AppointmentStatus } from "../../data/calendar-constants";

interface ScheduleOverviewRailProps {
  todayCounts: Record<AppointmentStatus, number>;
  emergencyCount: number;
  activeVet: string;
  doctorOptions: string[];
  vetCounts: Map<string, number>;
  totalAppointments: number;
  onSelectVet: (vet: string) => void;
}

const STATUS_METRICS: Array<{ key: AppointmentStatus; label: string; valueClass: string }> = [
  { key: "scheduled", label: "מתוכננים", valueClass: "text-slate-700" },
  { key: "arrived", label: "הגיעו", valueClass: "text-sky-700" },
  { key: "in_progress", label: "בטיפול", valueClass: "text-amber-700" },
  { key: "completed", label: "הושלמו", valueClass: "text-emerald-700" },
];

export function ScheduleOverviewRail({
  todayCounts,
  emergencyCount,
  activeVet,
  doctorOptions,
  vetCounts,
  totalAppointments,
  onSelectVet,
}: ScheduleOverviewRailProps) {
  return (
    <div className="space-y-4" dir="rtl">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-blue-100 bg-gradient-to-l from-blue-50 to-white px-4 py-3.5">
          <p className="text-[14px] font-bold text-slate-900">תמונת מצב היום</p>
          <p className="mt-0.5 text-[12px] text-slate-500">מה דורש את תשומת הלב של הצוות</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {STATUS_METRICS.map((metric) => (
            <div key={metric.key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className={`text-[20px] font-extrabold tabular-nums ${metric.valueClass}`}>
                {todayCounts[metric.key]}
              </div>
              <div className="text-[11px] font-medium text-slate-500">{metric.label}</div>
            </div>
          ))}
        </div>
        {emergencyCount > 0 && (
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-red-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-[12px] font-bold">{emergencyCount} תורי חירום היום</span>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1e40af]/10">
              <Stethoscope className="h-3.5 w-3.5 text-[#1e40af]" />
            </span>
            <span className="text-[14px] font-bold text-gray-800">יומן לפי רופא</span>
          </div>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
            {activeVet === "all" ? "כולם" : "מסונן"}
          </span>
        </div>
        <div className="space-y-1.5 p-3">
          {doctorOptions.map((vetName) => {
            const isAll = vetName === "all";
            const isActive = activeVet === vetName;
            const count = isAll ? totalAppointments : vetCounts.get(vetName) || 0;
            return (
              <button
                key={vetName}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectVet(vetName)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-right transition-colors ${
                  isActive
                    ? "border-blue-100 bg-blue-50 text-[#1e40af]"
                    : "border-transparent text-gray-700 hover:border-gray-100 hover:bg-gray-50"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-[#1e40af] text-white" : "bg-gray-100 text-gray-500"}`}>
                  {isAll ? <Users className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {isAll ? "כל היומנים" : vetName}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isActive ? "border border-blue-100 bg-white" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
