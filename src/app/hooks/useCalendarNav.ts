import { useState, useMemo, useCallback } from "react";
import {
  TODAY,
  buildCalendarGrid,
  type ViewMode,
} from "../data/calendar-constants";
import { useAppointmentStore } from "../data/AppointmentStore";
import type { CalendarAppointment } from "../data/AppointmentStore";

/** Central hook for all calendar navigation state & derived data. */
export function useCalendarNav() {
  const { calendarAppointments } = useAppointmentStore();

  const [currentMonth, setCurrentMonth] = useState(TODAY.getMonth());
  const [currentYear, setCurrentYear] = useState(TODAY.getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedDay, setSelectedDay] = useState<number | null>(TODAY.getDate());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [dailyDate, setDailyDate] = useState(new Date(TODAY));

  // ─── O(1) lookup dictionary: "day-month-year" → sorted appointments ──
  const apptsByDate = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of calendarAppointments) {
      const key = `${a.day}-${a.month}-${a.year}`;
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    // Sort each bucket once
    for (const arr of map.values()) {
      arr.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [calendarAppointments]);

  const getAppointments = useCallback(
    (day: number, month?: number, year?: number): CalendarAppointment[] => {
      const key = `${day}-${month ?? currentMonth}-${year ?? currentYear}`;
      return apptsByDate.get(key) || [];
    },
    [apptsByDate, currentMonth, currentYear]
  );

  const calendarCells = useMemo(
    () => buildCalendarGrid(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const sidebarAppointments = useMemo(
    () => (selectedDay !== null ? getAppointments(selectedDay) : []),
    [selectedDay, getAppointments]
  );

  // ─── Navigation ──
  const resetSidebar = () => { setSelectedDay(null); setSidebarOpen(false); };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
    resetSidebar();
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
    resetSidebar();
  };

  const prevWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const prevDay = () => setDailyDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const nextDay = () => setDailyDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });

  const goToToday = () => {
    setCurrentMonth(TODAY.getMonth());
    setCurrentYear(TODAY.getFullYear());
    setSelectedDay(TODAY.getDate());
    setSidebarOpen(true);
    setWeekStart(() => { const d = new Date(TODAY); d.setDate(d.getDate() - d.getDay()); return d; });
    setDailyDate(new Date(TODAY));
  };

  const handleDayClick = (day: number) => { setSelectedDay(day); setSidebarOpen(true); };

  const goNav = (dir: "prev" | "next") => {
    const map = {
      monthly: dir === "prev" ? prevMonth : nextMonth,
      weekly: dir === "prev" ? prevWeek : nextWeek,
      daily: dir === "prev" ? prevDay : nextDay,
    };
    map[viewMode]();
  };

  const isToday = (day: number) =>
    day === TODAY.getDate() && currentMonth === TODAY.getMonth() && currentYear === TODAY.getFullYear();

  return {
    viewMode, setViewMode,
    currentMonth, currentYear,
    selectedDay, sidebarOpen, setSidebarOpen,
    weekStart, dailyDate,
    calendarCells, weekDays, sidebarAppointments,
    getAppointments,
    goNav, goToToday, handleDayClick, isToday,
  };
}
