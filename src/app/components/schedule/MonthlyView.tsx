import { Plus } from "lucide-react";
import { HEBREW_DAYS, getDeptConfig, getApptStatus } from "../../data/calendar-constants";
import type { CalendarAppointment } from "../../data/AppointmentStore";

interface MonthlyViewProps {
  calendarCells: (number | null)[];
  selectedDay: number | null;
  currentMonth: number;
  currentYear: number;
  isToday: (day: number) => boolean;
  getAppointments: (day: number, month?: number, year?: number) => CalendarAppointment[];
  onDayClick: (day: number) => void;
  onCreateAppointment: (date: Date) => void;
}

function MonthlyApptCard({ appt }: { appt: CalendarAppointment }) {
  const dept = getDeptConfig(appt.department);
  const status = getApptStatus(appt.id);

  return (
    <div
      className={`relative rounded-md text-right overflow-hidden mb-1 ${dept.bg}`}
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: `${dept.borderColor}33`,
        borderRightWidth: 3,
        borderRightColor: dept.borderColor,
      }}
    >
      <span
        className={`absolute top-1 left-1 w-[7px] h-[7px] rounded-full ${status.dotColor}`}
        title={status.label}
      />

      <div className="px-1.5 py-1 pr-2">
        <p className={`text-[10px] leading-tight truncate ${dept.text}`} style={{ fontWeight: 700 }}>
          {appt.time} | {appt.petName}
        </p>
        <p className="text-[9.5px] text-gray-500 leading-tight truncate mt-0.5" style={{ fontWeight: 500 }}>
          {appt.ownerName}
        </p>
        <p className="text-[9px] text-gray-500 font-medium leading-tight truncate" style={{ fontWeight: 400 }}>
          {appt.type}
        </p>
        <p className="text-[9px] text-gray-500 font-medium leading-tight truncate" style={{ fontWeight: 400 }}>
          {appt.vet}
        </p>
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
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onDayClick(day);
              }}
              className={`min-h-[130px] border-b border-l border-gray-50 p-1.5 text-right transition-all cursor-pointer group relative align-top ${
                selected
                  ? "bg-blue-50/50 ring-2 ring-inset ring-blue-300"
                  : "hover:bg-gray-50/60"
              }`}
            >
              <div className="flex items-center justify-between mb-1 px-0.5">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] ${
                    todayHl
                      ? "bg-[#1e40af] text-white"
                      : selected
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-700 group-hover:bg-gray-100"
                  }`}
                  style={{ fontWeight: todayHl ? 700 : 500 }}
                >
                  {day}
                </span>
              </div>

              <div className="space-y-0.5">
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
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateAppointment(date);
                }}
                className="absolute inset-x-2 bottom-2 hidden items-center justify-center gap-1 rounded-xl border border-dashed border-blue-200 bg-white/90 px-2 py-2 text-[11px] font-semibold text-blue-700 shadow-sm backdrop-blur-sm transition hover:bg-blue-50 group-hover:flex focus:flex"
                title="קבע תור ביום זה"
                aria-label={`קבע תור ביום ${day}/${currentMonth + 1}/${currentYear}`}
              >
                <Plus className="h-3.5 w-3.5" />
                קבע תור ביום זה
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
