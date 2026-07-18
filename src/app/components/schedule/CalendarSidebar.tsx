import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Calendar, CalendarClock, CalendarPlus, Clock, MapPin, Pencil, Trash2, Video, X } from "lucide-react";
import { HEBREW_MONTHS, getHebrewDayName, getDeptConfig } from "../../data/calendar-constants";
import { PetIcon } from "../shared/PetIcon";
import type { CalendarAppointment } from "../../data/AppointmentStore";
import type { ActionMode } from "../../data/calendar-constants";

export type DayPopoverAnchor = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

interface DayAppointmentsPopoverProps {
  selectedDay: number;
  currentMonth: number;
  currentYear: number;
  appointments: CalendarAppointment[];
  anchor: DayPopoverAnchor;
  onClose: () => void;
  onCreateAppointment: () => void;
  onApptAction: (appt: CalendarAppointment, mode: ActionMode) => void;
}

type PopoverPosition = {
  left: number;
  top: number;
  width: number;
  arrowLeft: number;
  arrowPlacement: "top" | "bottom";
};

const VIEWPORT_GAP = 12;
const ANCHOR_GAP = 10;
const MAX_POPOVER_WIDTH = 420;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function DayAppointmentsPopover({
  selectedDay,
  currentMonth,
  currentYear,
  appointments,
  anchor,
  onClose,
  onCreateAppointment,
  onApptAction,
}: DayAppointmentsPopoverProps) {
  const dayName = getHebrewDayName(new Date(currentYear, currentMonth, selectedDay).getDay());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(MAX_POPOVER_WIDTH, viewportWidth - VIEWPORT_GAP * 2);
    const measuredHeight = Math.min(popover.getBoundingClientRect().height, viewportHeight - VIEWPORT_GAP * 2);
    const anchorCenter = anchor.left + anchor.width / 2;
    const left = clamp(anchorCenter - width / 2, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP);
    const hasRoomBelow = anchor.bottom + ANCHOR_GAP + measuredHeight <= viewportHeight - VIEWPORT_GAP;
    const top = hasRoomBelow
      ? anchor.bottom + ANCHOR_GAP
      : Math.max(VIEWPORT_GAP, anchor.top - measuredHeight - ANCHOR_GAP);

    setPosition({
      left,
      top,
      width,
      arrowLeft: clamp(anchorCenter - left, 24, width - 24),
      arrowPlacement: hasRoomBelow ? "top" : "bottom",
    });
  }, [anchor, appointments.length, selectedDay]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div
        ref={popoverRef}
        dir="rtl"
        role="dialog"
        aria-modal="false"
        aria-labelledby="day-appointments-title"
        className="fixed z-[210] flex max-h-[min(72vh,620px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
        style={{
          fontFamily: "'Heebo', sans-serif",
          left: position?.left ?? anchor.left,
          top: position?.top ?? anchor.bottom + ANCHOR_GAP,
          width: position?.width ?? Math.min(MAX_POPOVER_WIDTH, window.innerWidth - VIEWPORT_GAP * 2),
          visibility: position ? "visible" : "hidden",
        }}
      >
        {position && (
          <span
            aria-hidden="true"
            className={`absolute z-20 h-4 w-4 rotate-45 border-slate-200 ${
              position.arrowPlacement === "top" ? "-top-2 border-l border-t bg-blue-600" : "-bottom-2 border-b border-r bg-white"
            }`}
            style={{ left: position.arrowLeft - 8 }}
          />
        )}

        <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 bg-gradient-to-l from-[#1e40af] to-blue-600 px-4 py-3.5 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20"><Calendar className="h-4.5 w-4.5" /></span>
            <div className="min-w-0">
              <h2 id="day-appointments-title" className="truncate text-[16px] font-extrabold">יום {dayName}, {selectedDay} ב{HEBREW_MONTHS[currentMonth]}</h2>
              <p className="mt-0.5 text-[12px] text-blue-100">{currentYear} · {appointments.length} תורים</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירת חלון תורי היום" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"><X className="h-4.5 w-4.5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 p-3">
          {appointments.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-5 text-center">
              <Calendar className="mb-2 h-7 w-7 text-slate-300" />
              <h3 className="text-[15px] font-extrabold text-slate-800">אין תורים ביום זה</h3>
              <button type="button" onClick={onCreateAppointment} className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-blue-50 px-4 text-[12.5px] font-bold text-blue-700 transition-colors hover:bg-blue-100"><CalendarPlus className="h-4 w-4" />קביעת תור ליום זה</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {appointments.map((appt) => {
                const dept = getDeptConfig(appt.department);
                return (
                  <article key={appt.id} className={`group overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200/80 ${dept.bg}`} style={{ borderRight: `4px solid ${dept.borderColor}` }}>
                    <button type="button" onClick={() => onApptAction(appt, "view")} className="block w-full p-3 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90" style={{ borderColor: `${dept.borderColor}35` }}><PetIcon species={appt.petSpecies} className={`h-4.5 w-4.5 ${dept.text}`} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`truncate text-[14px] font-extrabold ${dept.text}`}>{appt.petName}</p>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-[11px] font-bold text-slate-700"><Clock className="h-3 w-3" />{appt.time}–{appt.endTime}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-700">{appt.ownerName} · {appt.type}</p>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><MapPin className="h-3 w-3" /><span>{appt.department} · {appt.room}</span>{appt.appointmentMode === "video" && <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-1.5 py-0.5 font-bold text-purple-700"><Video className="h-2.5 w-2.5" />וידאו</span>}</div>
                        </div>
                        <ArrowLeft className="mt-2.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-1" />
                      </div>
                    </button>
                    <div className="flex items-center gap-1 border-t border-black/5 bg-white/55 px-3 py-1.5">
                      {([
                        { mode: "reschedule" as ActionMode, icon: CalendarClock, label: "הזז", cls: "text-blue-700 hover:bg-blue-50" },
                        { mode: "edit" as ActionMode, icon: Pencil, label: "ערוך", cls: "text-amber-700 hover:bg-amber-50" },
                        { mode: "delete" as ActionMode, icon: Trash2, label: "מחק", cls: "text-red-600 hover:bg-red-50" },
                      ]).map(({ mode, icon: Icon, label, cls }) => (
                        <button key={mode} type="button" onClick={() => onApptAction(appt, mode)} className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-bold transition-colors ${cls}`}><Icon className="h-3 w-3" />{label}</button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {appointments.length > 0 && (
          <footer className="flex shrink-0 items-center border-t border-slate-100 bg-white px-3 py-2.5">
            <button type="button" onClick={onCreateAppointment} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-bold text-blue-700 transition-colors hover:bg-blue-50"><CalendarPlus className="h-3.5 w-3.5" />תור חדש ביום זה</button>
          </footer>
        )}
      </div>,
    document.body,
  );
}
