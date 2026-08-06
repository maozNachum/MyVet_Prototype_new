import type { ReactNode } from "react";
import { CalendarDays, ChevronRight, ChevronLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { useAppointmentStore } from "../../data/AppointmentStore";
import { NotificationPanel } from "../shared/NotificationPanel";
import {
  HEBREW_MONTHS,
  getHebrewDayName,
  type ViewMode,
} from "../../data/calendar-constants";

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: "monthly", label: "חודשי" },
  { key: "weekly",  label: "שבועי" },
  { key: "daily",   label: "יומי" },
];

interface CalendarHeaderProps {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  currentMonth: number;
  currentYear: number;
  weekDays: Date[];
  dailyDate: Date;
  onNav: (dir: "prev" | "next") => void;
  onToday: () => void;
  onCloseSidebar: () => void;
  compactMode?: boolean;
  assistantAction?: ReactNode;
}

export function CalendarHeader({
  viewMode, setViewMode,
  currentMonth, currentYear,
  weekDays, dailyDate,
  onNav, onToday, onCloseSidebar,
  compactMode = false,
  assistantAction,
}: CalendarHeaderProps) {
  const navigate = useNavigate();
  const store = useAppointmentStore();
  const staffNotifs = store.notifications.filter((n) => n.target === "staff");
  const staffUnread = store.unreadCount("staff");

  const title =
    viewMode === "monthly"
      ? `יומן תורים — ${HEBREW_MONTHS[currentMonth]} ${currentYear}`
      : viewMode === "weekly"
      ? `שבוע ${weekDays[0].getDate()}–${weekDays[6].getDate()} ${HEBREW_MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getFullYear()}`
      : `יום ${getHebrewDayName(dailyDate.getDay())}, ${dailyDate.getDate()} ב${HEBREW_MONTHS[dailyDate.getMonth()]} ${dailyDate.getFullYear()}`;

  return (
    <header dir="rtl" className="mb-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm" style={{ fontFamily: "'Heebo', sans-serif" }}>
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#1e40af] ring-1 ring-blue-100">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-blue-700">ניהול תורים</p>
            <h1 className="truncate text-[20px] font-extrabold text-slate-950 sm:text-[24px]">{title}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/appointments/new")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-5 text-[14px] font-bold text-white shadow-md shadow-blue-500/15 transition-colors hover:bg-[#1e3a8a] max-sm:w-full"
        >
          <Plus className="h-4 w-4" />
          תור חדש
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" aria-label="ניווט בטווח התאריכים">
            <button type="button" aria-label="הטווח הבא" onClick={() => onNav("next")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white transition-colors hover:bg-gray-50">
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
            <button type="button" aria-label="הטווח הקודם" onClick={() => onNav("prev")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white transition-colors hover:bg-gray-50">
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
          </div>
          <button type="button" onClick={onToday} className="min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[13px] font-bold text-[#1e40af] transition-colors hover:bg-blue-100">
            היום
          </button>
          {!compactMode && (
          <div className="flex items-center gap-0.5 rounded-xl bg-gray-200/70 p-1" aria-label="בחירת תצוגת יומן">
            {VIEW_OPTIONS.map((v) => (
              <button
                type="button"
                key={v.key}
                aria-pressed={viewMode === v.key}
                onClick={() => { setViewMode(v.key); onCloseSidebar(); }}
                className={`min-h-8 rounded-lg px-3.5 text-[13px] font-semibold transition-all ${
                  viewMode === v.key
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-between">
          <NotificationPanel
            notifications={staffNotifs}
            unreadCount={staffUnread}
            onMarkAllRead={() => store.markAllRead("staff")}
            onDismiss={(id) => store.dismissNotification(id)}
            title="התראות שינויי תורים"
            emptyText="אין התראות חדשות"
          />

          {assistantAction}
        </div>
      </div>
    </header>
  );
}
