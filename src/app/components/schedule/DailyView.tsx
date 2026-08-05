import { useMemo } from "react";
import { AlertTriangle, Calendar, Plus, Video } from "lucide-react";
import {
  HEBREW_MONTHS,
  TIMELINE_HOURS,
  getHebrewDayName,
  getDeptConfig,
  getApptStatus,
  isAppointmentPast,
} from "../../data/calendar-constants";
import { PetIcon } from "../shared/PetIcon";
import type { CalendarAppointment } from "../../data/AppointmentStore";

interface DailyViewProps {
  dailyDate: Date;
  getAppointments: (day: number, month?: number, year?: number) => CalendarAppointment[];
  onApptClick: (appt: CalendarAppointment) => void;
  onSlotClick: (date: Date, hour: number) => void;
}

export function DailyView({ dailyDate, getAppointments, onApptClick, onSlotClick }: DailyViewProps) {
  const dayAppts = useMemo(
    () => getAppointments(dailyDate.getDate(), dailyDate.getMonth(), dailyDate.getFullYear()),
    [dailyDate, getAppointments]
  );

  const byHour = useMemo(() => {
    const map = new Map<number, CalendarAppointment[]>();
    for (const a of dayAppts) {
      const h = parseInt(a.time.split(":")[0]);
      const arr = map.get(h);
      if (arr) arr.push(a);
      else map.set(h, [a]);
    }
    return map;
  }, [dayAppts]);

  return (
    <div
      dir="rtl"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
        <Calendar className="w-5 h-5 text-[#1e40af]" />
        <h2 className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>
          לוח זמנים — יום {getHebrewDayName(dailyDate.getDay())}, {dailyDate.getDate()} ב{HEBREW_MONTHS[dailyDate.getMonth()]}
        </h2>
        <span
          className="bg-blue-50 text-blue-700 text-[12px] px-2.5 py-0.5 rounded-full border border-blue-200"
          style={{ fontWeight: 600 }}
        >
          {dayAppts.length} תורים
        </span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {TIMELINE_HOURS.map((hour) => {
          const hourAppts = byHour.get(hour) || [];
          const slotDate = new Date(dailyDate);

          return (
            <div key={hour} className="flex border-b border-gray-50">
              <div
                className="w-[72px] shrink-0 py-4 px-3 border-r border-gray-100 text-center"
                style={{ fontFamily: "'Heebo', sans-serif" }}
              >
                <span className="text-[12px] text-gray-500 font-medium" style={{ fontWeight: 600 }}>
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => onSlotClick(slotDate, hour)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSlotClick(slotDate, hour);
                }}
                className="group flex-1 p-2 min-h-[64px] cursor-pointer transition-colors hover:bg-blue-50/40"
                title={`קבע תור ב-${String(hour).padStart(2, "0")}:00`}
              >
                {hourAppts.map((appt) => {
                  const dept = getDeptConfig(appt.department);
                  const status = getApptStatus(appt.status);
                  const isPast = isAppointmentPast(appt.year, appt.month, appt.day, appt.endTime);
                  const isMuted = isPast || appt.status === "completed" || appt.status === "cancelled";
                  return (
                    <button
                      key={appt.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onApptClick(appt);
                      }}
                      className={`group/card relative mb-2 flex w-full cursor-pointer items-center gap-4 rounded-xl px-4 py-3 text-right transition-all hover:shadow-md ${dept.bg} ${isMuted ? "opacity-55" : ""}`}
                      style={{
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: `${dept.borderColor}30`,
                        borderRightWidth: 4,
                        borderRightColor: dept.borderColor,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 border shrink-0 group-hover/card:scale-105 transition-transform"
                        style={{ borderColor: `${dept.borderColor}40` }}
                      >
                        <PetIcon species={appt.petSpecies} className={`w-5 h-5 ${dept.text}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[14px] font-bold ${dept.text} ${appt.status === "cancelled" ? "line-through" : ""}`}>
                            {appt.time}–{appt.endTime} | {appt.petName}
                          </span>
                          {appt.color === "red" && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              <AlertTriangle className="h-3 w-3" /> חירום
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-[12.5px] mt-0.5" style={{ fontWeight: 500 }}>
                          {appt.ownerName}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-gray-500 text-[12px]">{appt.type}</p>
                          {appt.appointmentMode === "video" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-100">
                              <Video className="w-2.5 h-2.5" />
                              וידאו
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 font-medium text-[11.5px]">{appt.vet}</p>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <span
                          className={`text-[13px] px-2.5 py-0.5 rounded-full border ${dept.text} bg-white/70`}
                          style={{ borderColor: `${dept.borderColor}50`, fontWeight: 600 }}
                        >
                          {appt.department}
                        </span>
                        <span className="text-gray-500 font-medium text-[13px]">{appt.appointmentMode === "video" ? "דיגיטל" : appt.room}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${status.badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
                          {status.label}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {hourAppts.length === 0 && (
                  <div className="hidden min-h-[44px] items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white/80 text-[12px] font-semibold text-blue-700 group-hover:flex">
                    <Plus className="ml-1 h-4 w-4" />
                    לחץ לקביעת תור ב-{String(hour).padStart(2, "0")}:00
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
