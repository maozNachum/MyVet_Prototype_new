import { AlertTriangle, Plus, Video } from "lucide-react";
import { HEBREW_DAYS, getDeptConfig, getApptStatus, isAppointmentPast } from "../../data/calendar-constants";
import type { CalendarAppointment } from "../../data/AppointmentStore";
import type { DayPopoverAnchor } from "./CalendarSidebar";

interface MonthlyViewProps {
  calendarCells: (number | null)[];
  selectedDay: number | null;
  currentMonth: number;
  currentYear: number;
  isToday: (day: number) => boolean;
  getAppointments: (day: number, month?: number, year?: number) => CalendarAppointment[];
  onDayClick: (day: number, anchor: DayPopoverAnchor) => void;
  onCreateAppointment: (date: Date) => void;
}

function MonthlyApptCard({ appt }: { appt: CalendarAppointment }) {
  const dept = getDeptConfig(appt.department);
  const status = getApptStatus(appt.status);
  const isPast = isAppointmentPast(appt.year, appt.month, appt.day, appt.endTime);
  const isEmergency = appt.color === "red";
  const isMuted = isPast || appt.status === "completed" || appt.status === "cancelled";

  return (
    <div
      className={`relative mb-1 overflow-hidden rounded-lg text-right transition-opacity ${dept.bg} ${isMuted ? "opacity-55" : ""}`}
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: `${dept.borderColor}33`,
        borderRightWidth: 3,
        borderRightColor: dept.borderColor,
      }}
    >
      <div className="px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className={`min-w-0 flex-1 truncate text-[11px] font-bold leading-tight ${dept.text} ${appt.status === "cancelled" ? "line-through" : ""}`}>
            <span dir="ltr">{appt.time}</span> · {appt.petName}
          </p>
          {isEmergency && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" aria-label="חירום" />}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1">
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${status.badgeClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
            {status.label}
          </span>
          <p className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight text-gray-600">
            {appt.type}
          </p>
          {appt.appointmentMode === "video" && <Video className="w-2.5 h-2.5 text-purple-600 shrink-0" />}
        </div>
      </div>
    </div>
  );
}

export function MonthlyView({
  calendarCells,
  selectedDay,
  currentMonth,
  currentYear,
  isToday,
  getAppointments,
  onDayClick,
  onCreateAppointment,
}: MonthlyViewProps) {
  return (
    <div
      dir="rtl"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <div className="grid grid-cols-7 border-b border-gray-100">
        {HEBREW_DAYS.map((day) => (
          <div
            key={day}
            className="py-3 text-center text-gray-500 text-[12px] bg-gray-50/60"
            style={{ fontWeight: 600 }}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarCells.map((day, idx) => {
          if (day === null) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[130px] border-b border-l border-gray-50 bg-gray-50/20"
              />
            );
          }

          const appts = getAppointments(day, currentMonth, currentYear);
          const selected = selectedDay === day;
          const todayHl = isToday(day);
          const visible = appts.slice(0, 3);
          const overflow = appts.length - visible.length;
          const date = new Date(currentYear, currentMonth, day);

          return (
            <div
              key={day}
              className={`group relative min-h-[130px] border-b border-l border-gray-50 p-1.5 text-right transition-all align-top ${
                selected
                  ? "bg-blue-50/50 ring-2 ring-inset ring-blue-300"
                  : "hover:bg-gray-50/60"
              }`}
            >
              <div className="flex items-center justify-between mb-1 px-0.5">
                <button
                  type="button"
                  onClick={(event) => onDayClick(day, event.currentTarget.getBoundingClientRect())}
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    todayHl
                      ? "bg-[#1e40af] text-white"
                      : selected
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  style={{ fontWeight: todayHl ? 700 : 500 }}
                  aria-label={`הצג תורים ביום ${day}/${currentMonth + 1}/${currentYear}`}
                >
                  {day}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateAppointment(date);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50/80 text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  title="קבע תור ביום זה"
                  aria-label={`קבע תור ביום ${day}/${currentMonth + 1}/${currentYear}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={(event) => onDayClick(day, event.currentTarget.getBoundingClientRect())}
                className="block min-h-[78px] w-full space-y-0.5 rounded-lg text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={`הצג ${appts.length} תורים ביום ${day}/${currentMonth + 1}/${currentYear}`}
              >
                {visible.map((appt) => (
                  <MonthlyApptCard key={appt.id} appt={appt} />
                ))}
                {overflow > 0 && (
                  <div
                    className="text-[10px] text-[#1e40af] px-1.5 py-0.5 bg-blue-50 rounded-md text-center"
                    style={{ fontWeight: 600 }}
                  >
                    +{overflow} נוספים
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
