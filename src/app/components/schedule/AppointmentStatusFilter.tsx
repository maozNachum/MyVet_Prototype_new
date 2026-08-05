import { Check } from "lucide-react";
import {
  APPOINTMENT_STATUS_OPTIONS,
  type AppointmentStatus,
} from "../../data/calendar-constants";

interface AppointmentStatusFilterProps {
  activeStatuses: Set<AppointmentStatus>;
  counts: Record<AppointmentStatus, number>;
  onToggle: (status: AppointmentStatus) => void;
  onClear: () => void;
}

export function AppointmentStatusFilter({
  activeStatuses,
  counts,
  onToggle,
  onClear,
}: AppointmentStatusFilterProps) {
  const isAll = activeStatuses.size === 0;

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1" aria-label="סינון לפי סטטוס">
      <button
        type="button"
        aria-pressed={isAll}
        onClick={onClear}
        className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold transition-colors ${
          isAll
            ? "border-blue-200 bg-blue-50 text-[#1e40af]"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {isAll && <Check className="h-3.5 w-3.5" />}
        הכול
      </button>
      {APPOINTMENT_STATUS_OPTIONS.map((option) => {
        const isActive = activeStatuses.has(option.key);
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(option.key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition-colors ${
              isActive ? option.badgeClass : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${option.dotColor}`} aria-hidden="true" />
            {option.label}
            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
              {counts[option.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
