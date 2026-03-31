import { Calendar, Clock, X, MapPin, CalendarClock, Pencil, Trash2 } from "lucide-react";
import { HEBREW_MONTHS, getHebrewDayName, getDeptConfig, getApptStatus } from "../../data/calendar-constants";
import { PetIcon } from "../shared/PetIcon";
import type { CalendarAppointment } from "../../data/AppointmentStore";
import type { ActionMode } from "../../data/calendar-constants";

interface CalendarSidebarProps {
  selectedDay: number;
  currentMonth: number;
  currentYear: number;
  appointments: CalendarAppointment[];
  onClose: () => void;
  onApptAction: (appt: CalendarAppointment, mode: ActionMode) => void;
}

export function CalendarSidebar({
  selectedDay, currentMonth, currentYear,
  appointments, onClose, onApptAction,
}: CalendarSidebarProps) {
  const dayName = getHebrewDayName(new Date(currentYear, currentMonth, selectedDay).getDay());

  return (
    <div
      dir="rtl"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 py-3.5 bg-gradient-to-l from-[#1e40af] to-[#2563eb] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-white/80" />
          <div>
            <h3 className="text-white text-[14px] flex" style={{ fontWeight: 600 }}>
              יום {dayName}
            </h3>
            <p className="text-white/60 text-[13px]">
              {selectedDay} ב{HEBREW_MONTHS[currentMonth]} {currentYear}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div
            className="flex flex-col items-center justify-center gap-0.5 bg-white/20 text-white rounded-full px-3 py-2"
            style={{ fontWeight: 600 }}
          >
            <span className="text-[13px] leading-none">{appointments.length}</span>
            <span className="text-[12px] leading-none">תורים</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white cursor-pointer p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Appointments list */}
      <div className="max-h-[500px] overflow-y-auto">
        {appointments.length === 0 ? (
          <div className="py-12 text-center">
            <Calendar className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-500 font-medium text-[13px]">אין תורים ביום זה</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {appointments.map((appt) => {
              const dept = getDeptConfig(appt.department);
              const status = getApptStatus(appt.id);
              return (
                <div
                  key={appt.id}
                  className={`relative rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md group ${dept.bg}`}
                  style={{
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: `${dept.borderColor}35`,
                    borderRightWidth: 4,
                    borderRightColor: dept.borderColor,
                  }}
                  onClick={() => onApptAction(appt, "view")}
                >
                  {/* Status dot */}
                  <span
                    className={`absolute top-2 left-2 w-2 h-2 rounded-full ${status.dotColor}`}
                    title={status.label}
                  />

                  <div className="px-3 py-3 pr-3">
                    {/* Row 1: time + pet */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center border shrink-0"
                        style={{ borderColor: `${dept.borderColor}40` }}
                      >
                        <PetIcon species={appt.petSpecies} className={`w-4 h-4 ${dept.text}`} />
                      </div>
                      <div className="min-w-0">
                        {/* Line 1 */}
                        <p className={`text-[12.5px] truncate ${dept.text}`} style={{ fontWeight: 700 }}>
                          {appt.time}–{appt.endTime} | {appt.petName}
                        </p>
                        {/* Line 2 */}
                        <p className="text-[13px] text-gray-600 truncate" style={{ fontWeight: 500 }}>
                          {appt.ownerName}
                        </p>
                        {/* Line 3 */}
                        <p className="text-[13px] text-gray-500 truncate">{appt.type}</p>
                        {/* Line 4 */}
                        <p className="text-[10.5px] text-gray-500 font-medium truncate">{appt.vet}</p>
                      </div>
                    </div>

                    {/* Department + Room */}
                    <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500 font-medium mb-2">
                      <MapPin className="w-3 h-3" />
                      <span>{appt.department}</span>
                      <span className="text-gray-300">·</span>
                      <span>{appt.room}</span>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-black/5">
                      {([
                        { mode: "reschedule" as ActionMode, icon: CalendarClock, label: "הזז",  cls: "text-blue-600 border-blue-200 hover:bg-blue-50" },
                        { mode: "edit"       as ActionMode, icon: Pencil,        label: "ערוך", cls: "text-amber-600 border-amber-200 hover:bg-amber-50" },
                        { mode: "delete"     as ActionMode, icon: Trash2,        label: "מחק",  cls: "text-red-500 border-red-200 hover:bg-red-50" },
                      ]).map(({ mode, icon: Icon, label, cls }) => (
                        <button
                          key={mode}
                          onClick={(e) => { e.stopPropagation(); onApptAction(appt, mode); }}
                          className={`flex items-center gap-1 bg-white/80 ${cls} text-[10.5px] px-2 py-1 rounded-lg border transition-colors cursor-pointer`}
                          style={{ fontWeight: 500 }}
                        >
                          <Icon className="w-3 h-3" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
