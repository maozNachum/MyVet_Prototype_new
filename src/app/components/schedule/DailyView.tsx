import { useMemo } from "react";
import { Calendar } from "lucide-react";
import {
  HEBREW_MONTHS, TIMELINE_HOURS, getHebrewDayName,
  getDeptConfig, getApptStatus,
} from "../../data/calendar-constants";
import { PetIcon } from "../shared/PetIcon";
import type { CalendarAppointment } from "../../data/AppointmentStore";

interface DailyViewProps {
  dailyDate: Date;
  getAppointments: (day: number, month?: number, year?: number) => CalendarAppointment[];
  onApptClick: (appt: CalendarAppointment) => void;
}

export function DailyView({ dailyDate, getAppointments, onApptClick }: DailyViewProps) {
  const dayAppts = useMemo(
    () => getAppointments(dailyDate.getDate(), dailyDate.getMonth(), dailyDate.getFullYear()),
    [dailyDate, getAppointments]
  );

  const byHour = useMemo(() => {
    const map = new Map<number, CalendarAppointment[]>();
    for (const a of dayAppts) {
      const h = parseInt(a.time.split(":")[0]);
      const arr = map.get(h);
      if (arr) arr.push(a); else map.set(h, [a]);
    }
    return map;
  }, [dayAppts]);

  return (
    <div
      dir="rtl"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
        <Calendar className="w-5 h-5 text-[#1e40af]" />
        <h2 className="text-gray-900 text-[16px]" style={{ fontWeight: 600 }}>
          לוח זמנים — יום {getHebrewDayName(dailyDate.getDay())},{" "}
          {dailyDate.getDate()} ב{HEBREW_MONTHS[dailyDate.getMonth()]}
        </h2>
        <span
          className="bg-blue-50 text-blue-700 text-[12px] px-2.5 py-0.5 rounded-full border border-blue-200"
          style={{ fontWeight: 600 }}
        >
          {dayAppts.length} תורים
        </span>
      </div>

      {/* Timeline */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {TIMELINE_HOURS.map((hour) => {
          const hourAppts = byHour.get(hour) || [];
          return (
            <div key={hour} className="flex border-b border-gray-50">
              {/* Hour label */}
              <div
                className="w-[72px] shrink-0 py-4 px-3 border-r border-gray-100 text-center"
                style={{ fontFamily: "'Heebo', sans-serif" }}
              >
                <span className="text-[12px] text-gray-500 font-medium" style={{ fontWeight: 600 }}>
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>

              {/* Appointments */}
              <div className="flex-1 p-2 min-h-[64px]">
                {hourAppts.map((appt) => {
                  const dept = getDeptConfig(appt.department);
                  const status = getApptStatus(appt.id);
                  return (
                    <button
                      key={appt.id}
                      onClick={() => onApptClick(appt)}
                      className={`relative w-full text-right flex items-center gap-4 px-4 py-3 rounded-xl mb-2 cursor-pointer transition-all hover:shadow-md group ${dept.bg}`}
                      style={{
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: `${dept.borderColor}30`,
                        borderRightWidth: 4,
                        borderRightColor: dept.borderColor,
                      }}
                    >
                      {/* Status dot */}
                      <span
                        className={`absolute top-2 left-2 w-2 h-2 rounded-full ${status.dotColor}`}
                        title={status.label}
                      />

                      {/* Pet icon */}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 border shrink-0 group-hover:scale-105 transition-transform`}
                        style={{ borderColor: `${dept.borderColor}40` }}
                      >
                        <PetIcon species={appt.petSpecies} className={`w-5 h-5 ${dept.text}`} />
                      </div>

                      {/* Main info: 4 lines */}
                      <div className="flex-1 min-w-0">
                        {/* Line 1 */}
                        <div className="flex items-center gap-2">
                          <span className={`text-[14px] ${dept.text}`} style={{ fontWeight: 700 }}>
                            {appt.time}–{appt.endTime} | {appt.petName}
                          </span>
                        </div>
                        {/* Line 2 */}
                        <p className="text-gray-600 text-[12.5px] mt-0.5" style={{ fontWeight: 500 }}>
                          {appt.ownerName}
                        </p>
                        {/* Line 3 */}
                        <p className="text-gray-500 text-[12px]">{appt.type}</p>
                        {/* Line 4 */}
                        <p className="text-gray-500 font-medium text-[11.5px]">{appt.vet}</p>
                      </div>

                      {/* Right meta */}
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <span
                          className={`text-[13px] px-2.5 py-0.5 rounded-full border ${dept.text} bg-white/70`}
                          style={{ borderColor: `${dept.borderColor}50`, fontWeight: 600 }}
                        >
                          {appt.department}
                        </span>
                        <span className="text-gray-500 font-medium text-[13px]">{appt.room}</span>
                        <span
                          className={`w-2 h-2 rounded-full ${status.dotColor}`}
                          title={status.label}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
