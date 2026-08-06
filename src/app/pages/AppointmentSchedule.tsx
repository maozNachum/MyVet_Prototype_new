import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useCalendarNav } from "../hooks/useCalendarNav";
import { useAppointmentActions } from "../hooks/useAppointmentActions";
import { useAppointmentStore, type CalendarAppointment } from "../data/AppointmentStore";
import { CalendarHeader } from "../components/schedule/CalendarHeader";
import { MonthlyView } from "../components/schedule/MonthlyView";
import { WeeklyView } from "../components/schedule/WeeklyView";
import { DailyView } from "../components/schedule/DailyView";
import { DayAppointmentsPopover, type DayPopoverAnchor } from "../components/schedule/CalendarSidebar";
import { DeptFilterPanel } from "../components/schedule/DeptFilterPanel";
import { AppointmentActionModal } from "../components/schedule/AppointmentActionModal";
import { ClinicAvailabilitySettings } from "../components/schedule/ClinicAvailabilitySettings";
import { Clock3, Search, SlidersHorizontal, Stethoscope, X } from "lucide-react";
import { useStaffMembers, uniqueNames } from "../data/staffDirectory";
import { ScheduleAssistant } from "../components/ai/PageAssistants";
import { AppointmentStatusFilter } from "../components/schedule/AppointmentStatusFilter";
import { ScheduleOverviewRail } from "../components/schedule/ScheduleOverviewRail";
import {
  APPOINTMENT_STATUS_OPTIONS,
  HEBREW_MONTHS,
  type AppointmentStatus,
} from "../data/calendar-constants";

export function AppointmentSchedule() {
  const navigate = useNavigate();
  const nav = useCalendarNav();
  const actions = useAppointmentActions();
  const { calendarAppointments, refreshAppointments, isLoading, error, supportsAppointmentStatus } = useAppointmentStore();
  const { members: vetStaff, isLoading: isStaffLoading } = useStaffMembers(["vet"]);

  useEffect(() => {
    refreshAppointments();
  }, [refreshAppointments]);

  // ── Search & Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDepts, setActiveDepts] = useState<Set<string>>(new Set());
  const [activeStatuses, setActiveStatuses] = useState<Set<AppointmentStatus>>(new Set());
  const [activeVet, setActiveVet] = useState<string>("all");
  const [showAvailabilitySettings, setShowAvailabilitySettings] = useState(false);
  const [showOverviewDrawer, setShowOverviewDrawer] = useState(false);
  const [dayPopoverAnchor, setDayPopoverAnchor] = useState<DayPopoverAnchor | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const overviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const overviewDrawerRef = useRef<HTMLDivElement | null>(null);
  const overviewCloseRef = useRef<HTMLButtonElement | null>(null);
  const previousCompactViewportRef = useRef<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const applyViewportMode = () => {
      setIsCompactViewport(mediaQuery.matches);
      if (mediaQuery.matches && previousCompactViewportRef.current !== true) {
        let contextualDate = new Date(nav.dailyDate);
        if (nav.viewMode === "monthly") {
          const today = new Date();
          const day = nav.currentYear === today.getFullYear() && nav.currentMonth === today.getMonth()
            ? today.getDate()
            : nav.selectedDay || 1;
          contextualDate = new Date(nav.currentYear, nav.currentMonth, day);
        } else if (nav.viewMode === "weekly") {
          const today = new Date();
          contextualDate = nav.weekDays.some((date) => date.toDateString() === today.toDateString())
            ? today
            : new Date(nav.weekDays[0]);
        }
        nav.setDailyDate(contextualDate);
        nav.setViewMode("daily");
        nav.setSidebarOpen(false);
      }
      previousCompactViewportRef.current = mediaQuery.matches;
    };

    applyViewportMode();
    mediaQuery.addEventListener("change", applyViewportMode);
    return () => mediaQuery.removeEventListener("change", applyViewportMode);
  }, [
    nav.currentMonth,
    nav.currentYear,
    nav.dailyDate,
    nav.selectedDay,
    nav.setDailyDate,
    nav.setSidebarOpen,
    nav.setViewMode,
    nav.viewMode,
    nav.weekDays,
  ]);

  useEffect(() => {
    if (!showOverviewDrawer) return;
    window.requestAnimationFrame(() => overviewCloseRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowOverviewDrawer(false);
        window.requestAnimationFrame(() => overviewTriggerRef.current?.focus());
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          overviewDrawerRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) || [],
        );
        if (focusable.length === 0) {
          event.preventDefault();
          overviewDrawerRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showOverviewDrawer]);

  const toggleDept = (dept: string) => {
    setActiveDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const clearDepts = () => setActiveDepts(new Set());

  const toggleStatus = (status: AppointmentStatus) => {
    setActiveStatuses((previous) => {
      const next = new Set(previous);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const doctorOptions = useMemo(() => {
    const staffNames = vetStaff.map((member) => member.name);
    const fromAppointments = calendarAppointments
      .map((appointment) => appointment.vet)
      .filter((name) => name && name !== "טרם שובץ");
    return ["all", ...uniqueNames([...staffNames, ...fromAppointments])];
  }, [calendarAppointments, vetStaff]);

  const visibleRange = useMemo(() => {
    if (nav.viewMode === "monthly") {
      const start = new Date(nav.currentYear, nav.currentMonth, 1);
      const end = new Date(nav.currentYear, nav.currentMonth + 1, 0, 23, 59, 59, 999);
      return {
        start,
        end,
        label: `${HEBREW_MONTHS[nav.currentMonth]} ${nav.currentYear}`,
      };
    }

    if (nav.viewMode === "weekly") {
      const start = new Date(nav.weekDays[0]);
      const end = new Date(nav.weekDays[6]);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const formatter = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });
      return { start, end, label: `${formatter.format(start)}–${formatter.format(end)}` };
    }

    const start = new Date(nav.dailyDate);
    const end = new Date(nav.dailyDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: new Intl.DateTimeFormat("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(start),
    };
  }, [nav.currentMonth, nav.currentYear, nav.dailyDate, nav.viewMode, nav.weekDays]);

  const appointmentsInRange = useMemo(
    () => calendarAppointments.filter((appointment) => {
      const date = new Date(appointment.year, appointment.month, appointment.day);
      return date >= visibleRange.start && date <= visibleRange.end;
    }),
    [calendarAppointments, visibleRange],
  );

  const matchesSearch = useCallback((appointment: CalendarAppointment) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      appointment.petName,
      appointment.ownerName,
      appointment.type,
      appointment.vet,
      appointment.department,
      appointment.appointmentMode === "video" ? "וידאו תור מרחוק דיגיטל" : "פיזי מרפאה",
    ].join(" ").toLowerCase().includes(query);
  }, [searchQuery]);

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const appointment of appointmentsInRange) {
      if (activeVet !== "all" && appointment.vet !== activeVet) continue;
      if (activeStatuses.size > 0 && !activeStatuses.has(appointment.status)) continue;
      if (!matchesSearch(appointment)) continue;
      counts.set(appointment.department, (counts.get(appointment.department) || 0) + 1);
    }
    return counts;
  }, [activeStatuses, activeVet, appointmentsInRange, matchesSearch]);

  const matchesFilters = useCallback((appointment: CalendarAppointment) => {
    if (activeDepts.size > 0 && !activeDepts.has(appointment.department)) return false;
    if (activeStatuses.size > 0 && !activeStatuses.has(appointment.status)) return false;
    if (activeVet !== "all" && appointment.vet !== activeVet) return false;

    return matchesSearch(appointment);
  }, [activeDepts, activeStatuses, activeVet, matchesSearch]);

  const statusCounts = useMemo(() => {
    const counts: Record<AppointmentStatus, number> = {
      scheduled: 0,
      arrived: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    appointmentsInRange.forEach((appointment) => {
      if (activeDepts.size > 0 && !activeDepts.has(appointment.department)) return;
      if (activeVet !== "all" && appointment.vet !== activeVet) return;
      if (!matchesSearch(appointment)) return;
      counts[appointment.status] += 1;
    });
    return counts;
  }, [activeDepts, activeVet, appointmentsInRange, matchesSearch]);

  const rangeSummary = useMemo(() => {
    const appointments = appointmentsInRange.filter(matchesFilters);
    const counts: Record<AppointmentStatus, number> = {
      scheduled: 0,
      arrived: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    appointments.forEach((appointment) => { counts[appointment.status] += 1; });
    return {
      counts,
      emergencyCount: appointments.filter((appointment) => appointment.color === "red" && appointment.status !== "cancelled").length,
      totalAppointments: appointments.length,
    };
  }, [appointmentsInRange, matchesFilters]);

  const handleAppointmentClick = useCallback(
    (appt: CalendarAppointment) => {
      actions.openAction(appt, "view");
    },
    [actions]
  );

  const handleAppointmentAction = useCallback(
    (appt: CalendarAppointment, mode: any) => {
      actions.openAction(appt, mode);
    },
    [actions]
  );

  const handleDayAppointmentAction = useCallback(
    (appt: CalendarAppointment, mode: any) => {
      nav.setSidebarOpen(false);
      handleAppointmentAction(appt, mode);
    },
    [handleAppointmentAction, nav]
  );

  const closeDayPopover = useCallback(() => {
    nav.setSidebarOpen(false);
    setDayPopoverAnchor(null);
  }, [nav]);

  const openDayPopover = useCallback((day: number, anchor: DayPopoverAnchor) => {
    setDayPopoverAnchor(anchor);
    nav.handleDayClick(day);
  }, [nav]);

  const openNewAppointmentAt = useCallback(
    (date: Date, time = "09:00") => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const params = new URLSearchParams({
        date: `${year}-${month}-${day}`,
        time,
      });

      if (activeVet !== "all") {
        params.set("vet", activeVet);
      }

      navigate(`/appointments/new?${params.toString()}`);
    },
    [navigate, activeVet]
  );

  // ── Filtered getAppointments wrapper ──
  const filteredGetAppointments = useCallback(
    (day: number, month?: number, year?: number) => {
      return nav.getAppointments(day, month, year).filter(matchesFilters);
    },
    [nav.getAppointments, matchesFilters]
  );

  // Total vs filtered count for the filter panel badge
  const totalCount = appointmentsInRange.length;
  const filteredAppointments = useMemo(
    () => appointmentsInRange.filter(matchesFilters),
    [appointmentsInRange, matchesFilters]
  );
  const filteredCount = useMemo(
    () => appointmentsInRange.filter(matchesFilters).length,
    [appointmentsInRange, matchesFilters],
  );
  const activeFilterCount = (searchQuery.trim() ? 1 : 0)
    + activeDepts.size
    + activeStatuses.size
    + (activeVet === "all" ? 0 : 1);

  const clearAllFilters = () => {
    setSearchQuery("");
    setActiveDepts(new Set());
    setActiveStatuses(new Set());
    setActiveVet("all");
  };

  const closeOverviewDrawer = () => {
    setShowOverviewDrawer(false);
    window.requestAnimationFrame(() => overviewTriggerRef.current?.focus());
  };

  const filteredSidebarAppointments = useMemo(
    () => nav.sidebarAppointments.filter(matchesFilters),
    [nav.sidebarAppointments, matchesFilters]
  );

  return (
    <main
      className="w-full px-4 py-6 sm:px-6"
      dir="rtl"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      {/* Header with search */}
      <CalendarHeader
        viewMode={nav.viewMode}
        setViewMode={nav.setViewMode}
        currentMonth={nav.currentMonth}
        currentYear={nav.currentYear}
        weekDays={nav.weekDays}
        dailyDate={nav.dailyDate}
        onNav={nav.goNav}
        onToday={nav.goToToday}
        onCloseSidebar={() => nav.setSidebarOpen(false)}
        compactMode={isCompactViewport}
        assistantAction={
          <>
            <button type="button" onClick={() => setShowAvailabilitySettings(true)} className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3.5 py-2 text-[13px] font-bold text-[#1e40af] shadow-sm transition-colors hover:bg-blue-50">
              <Clock3 className="h-4 w-4" /> זמינות ללקוחות
            </button>
            <ScheduleAssistant
              appointments={filteredAppointments}
              viewMode={nav.viewMode}
              activeVet={activeVet}
            />
          </>
        }
      />

      {(isLoading || isStaffLoading) && (
        <div role="status" className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-700 text-[13px] font-medium">
          טוען את היומן ואת רשימת אנשי הצוות...
        </div>
      )}
      {error && !isLoading && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
          <span>לא הצלחנו לסנכרן את היומן: {error}</span>
          <button type="button" onClick={() => refreshAppointments()} className="min-h-9 rounded-lg border border-red-200 bg-white px-3 font-bold transition-colors hover:bg-red-100">
            ניסיון נוסף
          </button>
        </div>
      )}

      {/* Main layout: [calendar] [right sidebar column] */}
      <div className="flex gap-5 items-start">
        {/* ── Calendar area ── */}
        <div className="flex-1 min-w-0 relative">
          <section className="mb-4 space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm" aria-label="כלי סינון ותצוגה">
            <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.2fr)_minmax(230px,0.8fr)_minmax(200px,0.7fr)_auto]">
              <div className="relative min-w-0">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="חיפוש מהיר ביומן — שם חיה, בעלים, סוג טיפול, וטרינר..."
                dir="rtl"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-[14px] font-medium text-gray-700 shadow-sm transition-all placeholder:text-gray-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} aria-label="ניקוי החיפוש" className="absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              </div>
              <DeptFilterPanel
                activeDepts={activeDepts}
                onToggle={toggleDept}
                onClearAll={clearDepts}
                totalCount={totalCount}
                filteredCount={filteredCount}
                departmentCounts={departmentCounts}
              />
              <label className="relative flex h-11 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/20">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1e40af]">
                  <Stethoscope className="h-3.5 w-3.5" />
                </span>
                <span className="sr-only">סינון לפי רופא</span>
                <select
                  value={activeVet}
                  onChange={(event) => setActiveVet(event.target.value)}
                  className="h-full min-w-0 flex-1 appearance-none bg-transparent text-[13px] font-bold text-slate-700 outline-none"
                  aria-label="סינון לפי רופא"
                >
                  {doctorOptions.map((vetName) => (
                    <option key={vetName} value={vetName}>
                      {vetName === "all" ? "כל הרופאים" : vetName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                ref={overviewTriggerRef}
                type="button"
                onClick={() => setShowOverviewDrawer(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[13px] font-bold text-[#1e40af] transition-colors hover:bg-blue-100 xl:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" /> תמונת מצב
              </button>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <AppointmentStatusFilter
                activeStatuses={activeStatuses}
                counts={statusCounts}
                onToggle={toggleStatus}
                onClear={() => setActiveStatuses(new Set())}
              />
            </div>
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3" aria-label="מסננים פעילים">
                <span className="text-[12px] font-bold text-slate-600">מסננים פעילים:</span>
                {searchQuery.trim() && (
                  <button type="button" onClick={() => setSearchQuery("")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 text-[12px] font-semibold text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    חיפוש: {searchQuery.trim()} <X className="h-3 w-3" />
                  </button>
                )}
                {Array.from(activeDepts).map((department) => (
                  <button key={department} type="button" onClick={() => toggleDept(department)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    {department} <X className="h-3 w-3" />
                  </button>
                ))}
                {Array.from(activeStatuses).map((status) => (
                  <button key={status} type="button" onClick={() => toggleStatus(status)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    {APPOINTMENT_STATUS_OPTIONS.find((option) => option.key === status)?.label || status} <X className="h-3 w-3" />
                  </button>
                ))}
                {activeVet !== "all" && (
                  <button type="button" onClick={() => setActiveVet("all")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    {activeVet} <X className="h-3 w-3" />
                  </button>
                )}
                <button type="button" onClick={clearAllFilters} className="min-h-10 rounded-lg px-2.5 text-[12px] font-bold text-[#1e40af] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  איפוס הכול
                </button>
              </div>
            )}
          </section>
          {nav.viewMode === "monthly" && (
            <MonthlyView
              calendarCells={nav.calendarCells}
              selectedDay={nav.selectedDay}
              currentMonth={nav.currentMonth}
              currentYear={nav.currentYear}
              isToday={nav.isToday}
              getAppointments={filteredGetAppointments}
              onDayClick={openDayPopover}
              onCreateAppointment={(date) => openNewAppointmentAt(date)}
            />
          )}
          {nav.viewMode === "weekly" && (
            <WeeklyView
              weekDays={nav.weekDays}
              getAppointments={filteredGetAppointments}
              onApptClick={handleAppointmentClick}
              onSlotClick={(date, hour) =>
                openNewAppointmentAt(date, `${String(hour).padStart(2, "0")}:00`)
              }
            />
          )}
          {nav.viewMode === "daily" && (
            <DailyView
              dailyDate={nav.dailyDate}
              getAppointments={filteredGetAppointments}
              onApptClick={handleAppointmentClick}
              onSlotClick={(date, hour) =>
                openNewAppointmentAt(date, `${String(hour).padStart(2, "0")}:00`)
              }
            />
          )}
        </div>

        {/* ── Right sidebar column ── */}
        <aside className="sticky top-[80px] hidden w-[260px] shrink-0 xl:block" aria-label="תמונת מצב לטווח המוצג">
          <ScheduleOverviewRail
            counts={rangeSummary.counts}
            emergencyCount={rangeSummary.emergencyCount}
            rangeLabel={visibleRange.label}
            totalAppointments={rangeSummary.totalAppointments}
          />
        </aside>
      </div>

      {showOverviewDrawer && (
        <div className="fixed inset-0 z-[230] xl:hidden" role="dialog" aria-modal="true" aria-label="תמונת מצב לטווח המוצג">
          <button type="button" aria-label="סגירת החלון" onClick={closeOverviewDrawer} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />
          <div ref={overviewDrawerRef} tabIndex={-1} className="absolute inset-y-0 right-0 w-[min(88vw,340px)] overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 shadow-2xl outline-none">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-extrabold text-slate-900">ניהול היומן</h2>
                <p className="text-[12px] text-slate-500">הנתונים מתייחסים לטווח המוצג ביומן</p>
              </div>
              <button ref={overviewCloseRef} type="button" onClick={closeOverviewDrawer} aria-label="סגירה" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <ScheduleOverviewRail
              counts={rangeSummary.counts}
              emergencyCount={rangeSummary.emergencyCount}
              rangeLabel={visibleRange.label}
              totalAppointments={rangeSummary.totalAppointments}
            />
          </div>
        </div>
      )}

      {nav.sidebarOpen && nav.selectedDay !== null && nav.viewMode === "monthly" && dayPopoverAnchor && (
        <DayAppointmentsPopover
          selectedDay={nav.selectedDay}
          currentMonth={nav.currentMonth}
          currentYear={nav.currentYear}
          appointments={filteredSidebarAppointments}
          anchor={dayPopoverAnchor}
          onClose={closeDayPopover}
          onCreateAppointment={() => {
            const date = new Date(nav.currentYear, nav.currentMonth, nav.selectedDay!);
            closeDayPopover();
            openNewAppointmentAt(date);
          }}
          onApptAction={handleDayAppointmentAction}
        />
      )}

      {/* Appointment action modal */}
      {actions.selectedAppt && (
        <AppointmentActionModal
          appt={actions.selectedAppt}
          mode={actions.actionMode}
          setMode={actions.setActionMode}
          onClose={actions.actionPending ? () => undefined : actions.closeModal}
          rescheduleDate={actions.rescheduleDate}
          setRescheduleDate={actions.setRescheduleDate}
          rescheduleTime={actions.rescheduleTime}
          setRescheduleTime={actions.setRescheduleTime}
          rescheduleSuccess={actions.rescheduleSuccess}
          onReschedule={actions.handleReschedule}
          editForm={actions.editForm}
          setEditForm={actions.setEditForm}
          editSuccess={actions.editSuccess}
          onEdit={actions.handleEdit}
          deleteSuccess={actions.deleteSuccess}
          onDelete={actions.handleDelete}
          actionPending={actions.actionPending}
          supportsAppointmentStatus={supportsAppointmentStatus}
          statusUpdatePending={actions.statusUpdatePending}
          onStatusChange={actions.handleStatusChange}
          openAction={actions.openAction}
        />
      )}
      <ClinicAvailabilitySettings isOpen={showAvailabilitySettings} onClose={() => setShowAvailabilitySettings(false)} />
    </main>
  );
}
