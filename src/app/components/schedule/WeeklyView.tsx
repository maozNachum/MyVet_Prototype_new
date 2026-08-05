import { useMemo } from "react";
import { AlertTriangle, Plus, Video } from "lucide-react";
import {
  HEBREW_DAYS,
  TIMELINE_HOURS,
  TODAY,
  isSameDateObj,
  getDeptConfig,
  getApptStatus,
  isAppointmentPast,
} from "../../data/calendar-constants";
import type { CalendarAppointment } from "../../data/AppointmentStore";

interface WeeklyViewProps {
  weekDays: Date[];
  getAppointments: (day: number, month?: number, year?: number) => CalendarAppointment[];
  onApptClick: (appt: CalendarAppointment) => void;
  onSlotClick: (date: Date, hour: number) => void;
}

function WeeklyApptCard({
  appt,
  onClick,
}: {
  appt: CalendarAppointment;
  onClick: () => void;
}) {
  const dept = getDeptConfig(appt.department);
  const status = getApptStatus(appt.status);
  const isPast = isAppointmentPast(appt.year, appt.month, appt.day, appt.endTime);
  const isMuted = isPast || appt.status === "completed" || appt.status === "cancelled";

  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`relative mb-1.5 w-full cursor-pointer overflow-hidden rounded-xl text-right transition-all hover:shadow-md ${dept.bg} ${isMuted ? "opacity-55" : ""}`}
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: `${dept.borderColor}40`,
        borderRightWidth: 4,
        borderRightColor: dept.borderColor,
      }}
    >
      <div className="px-2 py-2 pr-3 space-y-0.5">
        <p className={`truncate text-[13px] font-bold leading-tight ${dept.text} ${appt.status === "cancelled" ? "line-through" : ""}`}>
          {appt.time}–{appt.endTime} | {appt.petName}
        </p>
        <p className="text-[10.5px] text-gray-600 leading-tight truncate" style={{ fontWeight: 500 }}>
          {appt.ownerName}
        </p>
        <div className="flex items-center gap-1.5 truncate">
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${status.badgeClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
            {status.label}
          </span>
          {appt.color === "red" && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" aria-label="חירום" />}
          <p className="text-[10px] text-gray-500 leading-tight truncate" style={{ fontWeight: 400 }}>
            {appt.type}
          </p>
          {appt.appointmentMode === "video" && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-1 py-0.5 text-[9px] font-semibold text-purple-700 border border-purple-100">
              <Video className="w-2 h-2" />
              וידאו
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-500 font-medium leading-tight truncate" style={{ fontWeight: 400 }}>
          {appt.vet}
        </p>
      </div>
    </button>
  );
}

export function WeeklyView({ weekDays, getAppointments, onApptClick, onSlotClick }: WeeklyViewProps) {
  const weekGrid = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (let i = 0; i < 7; i++) {
      const wd = weekDays[i];
      const dayAppts = getAppointments(wd.getDate(), wd.getMonth(), wd.getFullYear());
      for (const a of dayAppts) {
        const hour = parseInt(a.time.split(":")[0]);
        const key = `${i}-${hour}`;
        const arr = map.get(key);
        if (arr) arr.push(a);
        else map.set(key, [a]);
      }
    }
    return map;
  }, [weekDays, getAppointments]);

  const dayTotals = useMemo(() => {
    return weekDays.map((wd) =>
      getAppointments(wd.getDate(), wd.getMonth(), wd.getFullYear()).length
    );
  }, [weekDays, getAppointments]);

  return (
    <div
      dir="rtl"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <div
        className="grid border-b border-gray-100"
        style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
      >
        <div className="py-3 bg-gray-50/60" />
        {weekDays.map((wd, i) => {
          const isT = isSameDateObj(wd, TODAY);
          const count = dayTotals[i];
          return (
            <div
              key={i}
              className={`py-3 px-2 text-center border-r border-gray-50 ${
                isT ? "bg-blue-50" : "bg-gray-50/60"
              }`}
            >
              <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide" style={{ fontWeight: 600 }}>
                {HEBREW_DAYS[wd.getDay()]}
              </div>
              <div
                className={`text-[18px] mt-0.5 leading-tight ${isT ? "text-[#1e40af]" : "text-gray-800"}`}
                style={{ fontWeight: isT ? 700 : 600 }}
              >
                {wd.getDate()}
              </div>
              {count > 0 && (
                <div
                  className={`text-[10px] mt-0.5 ${isT ? "text-blue-600" : "text-gray-500 font-medium"}`}
                  style={{ fontWeight: 600 }}
                >
                  {count} תורים
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 400 }}>
        {TIMELINE_HOURS.map((hour) => {
          const anyAppts = weekDays.some((_, i) => (weekGrid.get(`${i}-${hour}`) || []).length > 0);

          return (
            <div
              key={hour}
              className={`grid border-b border-gray-50 ${anyAppts ? "min-h-[90px]" : "min-h-[50px]"}`}
              style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
            >
              <div className={`px-2 py-2 border-r border-gray-100 text-center shrink-0 ${anyAppts ? "pt-3" : ""}`}>
                <span className="text-[13px] text-gray-500 font-medium" style={{ fontWeight: 600 }}>
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>

              {weekDays.map((dayDate, i) => {
                const appts = weekGrid.get(`${i}-${hour}`) || [];
                const isT = isSameDateObj(dayDate, TODAY);
                const slotDate = new Date(dayDate);

                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSlotClick(slotDate, hour)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onSlotClick(slotDate, hour);
                    }}
                    className={`group min-w-0 border-r border-gray-50 p-1.5 transition-colors hover:bg-blue-50/40 cursor-pointer ${
                      isT ? "bg-blue-50/20" : ""
                    }`}
                    title={`קבע תור ב-${String(hour).padStart(2, "0")}:00`}
                  >
                    {appts.map((appt) => (
                      <WeeklyApptCard
                        key={appt.id}
                        appt={appt}
                        onClick={() => onApptClick(appt)}
                      />
                    ))}

                    {appts.length === 0 && (
                      <div className="hidden h-full min-h-[34px] items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white/70 text-[11px] font-semibold text-blue-700 group-hover:flex">
                        <Plus className="ml-1 h-3.5 w-3.5" />
                        קבע תור
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
