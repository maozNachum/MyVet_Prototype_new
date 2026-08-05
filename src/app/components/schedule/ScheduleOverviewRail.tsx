import { AlertTriangle, CalendarRange } from "lucide-react";
import type { AppointmentStatus } from "../../data/calendar-constants";

interface ScheduleOverviewRailProps {
  counts: Record<AppointmentStatus, number>;
  emergencyCount: number;
  rangeLabel: string;
  totalAppointments: number;
}

const STATUS_METRICS: Array<{ key: AppointmentStatus; label: string; valueClass: string }> = [
  { key: "scheduled", label: "מתוכננים", valueClass: "text-slate-700" },
  { key: "arrived", label: "הגיעו", valueClass: "text-sky-700" },
  { key: "in_progress", label: "בטיפול", valueClass: "text-amber-700" },
  { key: "completed", label: "הושלמו", valueClass: "text-emerald-700" },
];

export function ScheduleOverviewRail({
  counts,
  emergencyCount,
  rangeLabel,
  totalAppointments,
}: ScheduleOverviewRailProps) {
  return (
    <div dir="rtl">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#1e40af] ring-1 ring-blue-100">
              <CalendarRange className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-slate-900">תמונת מצב</p>
              <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{rangeLabel}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-semibold text-blue-800">
            {totalAppointments} תורים בטווח המוצג
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {STATUS_METRICS.map((metric) => (
            <div key={metric.key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className={`text-[20px] font-extrabold tabular-nums ${metric.valueClass}`}>
                {counts[metric.key]}
              </div>
              <div className="text-[11px] font-medium text-slate-500">{metric.label}</div>
            </div>
          ))}
        </div>
        {emergencyCount > 0 && (
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-red-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-[12px] font-bold">{emergencyCount} תורי חירום בטווח</span>
          </div>
        )}
      </section>
    </div>
  );
}
