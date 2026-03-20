import { ChevronRight, ChevronLeft, Plus, Search } from "lucide-react";
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
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function CalendarHeader({
  viewMode, setViewMode,
  currentMonth, currentYear,
  weekDays, dailyDate,
  onNav, onToday, onCloseSidebar,
  searchQuery, onSearchChange,
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
    <div dir="rtl" className="mb-6 space-y-3" style={{ fontFamily: "'Heebo', sans-serif" }}>
      {/* Row 1: Title + nav + view toggle + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Right: title + arrows */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNav("next")}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => onNav("prev")}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <h1 className="text-gray-900 text-[22px]" style={{ fontWeight: 700 }}>{title}</h1>
          <button
            onClick={onToday}
            className="text-[12px] text-[#1e40af] border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ fontWeight: 500 }}
          >
            היום
          </button>
        </div>

        {/* Left: view toggle + notifications + new appt */}
        <div className="flex items-center gap-3">
          {/* View toggle pills */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v.key}
                onClick={() => { setViewMode(v.key); onCloseSidebar(); }}
                className={`px-4 py-1.5 rounded-lg text-[13px] transition-all cursor-pointer ${
                  viewMode === v.key
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                style={{ fontWeight: viewMode === v.key ? 600 : 400 }}
              >
                {v.label}
              </button>
            ))}
          </div>

          <NotificationPanel
            notifications={staffNotifs}
            unreadCount={staffUnread}
            onMarkAllRead={() => store.markAllRead("staff")}
            onDismiss={(id) => store.dismissNotification(id)}
            title="התראות שינויי תורים"
            emptyText="אין התראות חדשות"
          />

          <button
            onClick={() => navigate("/appointments/new")}
            className="flex items-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-5 py-2.5 rounded-xl transition-colors cursor-pointer shadow-md shadow-blue-500/15 text-[14px]"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            קביעת תור חדש
          </button>
        </div>
      </div>

      {/* Row 2: Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute top-1/2 -translate-y-1/2 right-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חיפוש מהיר ביומן — שם חיה, בעלים, סוג טיפול, וטרינר..."
          dir="rtl"
          className="w-full pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all shadow-sm"
          style={{ fontFamily: "'Heebo', sans-serif" }}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute top-1/2 -translate-y-1/2 left-3 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4" style={{ transform: "rotate(90deg)" }} />
          </button>
        )}
      </div>
    </div>
  );
}
