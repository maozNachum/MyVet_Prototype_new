import { useMemo } from "react";
import {
  HEBREW_DAYS, TIMELINE_HOURS, TODAY,
  isSameDateObj, getDeptConfig, getApptStatus,
} from "../../data/calendar-constants";
import type { CalendarAppointment } from "../../data/AppointmentStore";

interface WeeklyViewProps {
  weekDays: Date[];
  getAppointments: (day: number, month?: number, year?: number) => CalendarAppointment[];
  onApptClick: (appt: CalendarAppointment) => void;
}

// Full 4-line card for weekly view
function WeeklyApptCard({
  appt, onClick,
}: {
  appt: CalendarAppointment;
  onClick: () => void;
}) {
  const dept = getDeptConfig(appt.department);
  const status = getApptStatus(appt.id);

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-right rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md hover:scale-[1.01] mb-1.5 ${dept.bg}`}
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: `${dept.borderColor}40`,
        borderRightWidth: 4,
        borderRightColor: dept.borderColor,
      }}
    >
      {/* Status dot */}
      <span
        className={`absolute top-1.5 left-1.5 w-2 h-2 rounded-full ${status.dotColor}`}
        title={status.label}
      />

      <div className="px-2 py-2 pr-3 space-y-0.5">
        {/* Line 1: Time + Pet Name */}
        <p
          className={`text-[13px] leading-tight ${dept.text} truncate`}
          style={{ fontWeight: 700 }}
        >
          {appt.time}–{appt.endTime} | {appt.petName}
        </p>
        {/* Line 2: Owner */}
        <p className="text-[10.5px] text-gray-600 leading-tight truncate" style={{ fontWeight: 500 }}>
          {appt.ownerName}
        </p>
        {/* Line 3: Treatment type */}
        <p className="text-[10px] text-gray-500 leading-tight truncate" style={{ fontWeight: 400 }}>
          {appt.type}
        </p>
        {/* Line 4: Vet */}
        <p className="text-[10px] text-gray-500 font-medium leading-tight truncate" style={{ fontWeight: 400 }}>
          {appt.vet}
        </p>
      </div>
    </button>
  );
}

export function WeeklyView({ weekDays, getAppointments, onApptClick }: WeeklyViewProps) {
  // Group appointments by dayIndex + hour
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

  // Count per day for header badge
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
      {/* Day headers */}
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
              <div
                className="text-[10px] text-gray-500 font-medium uppercase tracking-wide"
                style={{ fontWeight: 600 }}
              >
                {HEBREW_DAYS[wd.getDay()]}
              </div>
              <div
                className={`text-[18px] mt-0.5 leading-tight ${
                  isT ? "text-[#1e40af]" : "text-gray-800"
                }`}
                style={{ fontWeight: isT ? 700 : 600 }}
              >
                {wd.getDate()}
              </div>
              {count > 0 && (
                <div
                  className={`text-[10px] mt-0.5 ${
                    isT ? "text-blue-600" : "text-gray-500 font-medium"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {count} תורים
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 400 }}>
        {TIMELINE_HOURS.map((hour) => {
          // Check if any day has appointments this hour
          const anyAppts = weekDays.some((_, i) => (weekGrid.get(`${i}-${hour}`) || []).length > 0);

          return (
            <div
              key={hour}
              className={`grid border-b border-gray-50 ${anyAppts ? "min-h-[90px]" : "min-h-[44px]"}`}
              style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
            >
              {/* Hour label */}
              <div
                className={`px-2 py-2 border-r border-gray-100 text-center shrink-0 ${
                  anyAppts ? "pt-3" : ""
                }`}
              >
                <span
                  className="text-[13px] text-gray-500 font-medium"
                  style={{ fontWeight: 600 }}
                >
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>

              {/* Day columns */}
              {weekDays.map((_, i) => {
                const appts = weekGrid.get(`${i}-${hour}`) || [];
                const isT = isSameDateObj(weekDays[i], TODAY);

                return (
                  <div
                    key={i}
                    className={`border-r border-gray-50 p-1.5 min-w-0 ${
                      isT ? "bg-blue-50/20" : ""
                    }`}
                  >
                    {appts.map((appt) => (
                      <WeeklyApptCard
                        key={appt.id}
                        appt={appt}
                        onClick={() => onApptClick(appt)}
                      />
                    ))}
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
