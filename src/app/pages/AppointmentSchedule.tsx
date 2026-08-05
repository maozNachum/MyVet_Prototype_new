import { useState, useCallback, useEffect, useMemo } from "react";
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
import { Clock3, Search, SlidersHorizontal, X } from "lucide-react";
import { useStaffMembers, uniqueNames } from "../data/staffDirectory";
import { ScheduleAssistant } from "../components/ai/PageAssistants";
import { AppointmentStatusFilter } from "../components/schedule/AppointmentStatusFilter";
import { ScheduleOverviewRail } from "../components/schedule/ScheduleOverviewRail";
import type { AppointmentStatus } from "../data/calendar-constants";

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

  const vetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const appt of calendarAppointments) {
      const vetName = appt.vet || "טרם שובץ";
      counts.set(vetName, (counts.get(vetName) || 0) + 1);
    }
    return counts;
  }, [calendarAppointments]);

  const doctorOptions = useMemo(() => {
    const staffNames = vetStaff.map((member) => member.name);
    const fromAppointments = Array.from(vetCounts.keys()).filter((name) => name && name !== "טרם שובץ");
    return ["all", ...uniqueNames([...staffNames, ...fromAppointments])];
  }, [vetCounts, vetStaff]);

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const query = searchQuery.trim().toLowerCase();
    for (const appointment of calendarAppointments) {
      if (activeVet !== "all" && appointment.vet !== activeVet) continue;
      if (query && ![
        appointment.petName,
        appointment.ownerName,
        appointment.type,
        appointment.vet,
        appointment.department,
        appointment.appointmentMode === "video" ? "וידאו תור מרחוק דיגיטל" : "פיזי מרפאה",
      ].join(" ").toLowerCase().includes(query)) continue;
      counts.set(appointment.department, (counts.get(appointment.department) || 0) + 1);
    }
    return counts;
  }, [activeVet, calendarAppointments, searchQuery]);

  const matchesFilters = useCallback((appointment: CalendarAppointment) => {
    if (activeDepts.size > 0 && !activeDepts.has(appointment.department)) return false;
    if (activeStatuses.size > 0 && !activeStatuses.has(appointment.status)) return false;
    if (activeVet !== "all" && appointment.vet !== activeVet) return false;

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
  }, [activeDepts, activeStatuses, activeVet, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<AppointmentStatus, number> = {
      scheduled: 0,
      arrived: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    calendarAppointments.forEach((appointment) => { counts[appointment.status] += 1; });
    return counts;
  }, [calendarAppointments]);

  const todaySummary = useMemo(() => {
    const today = new Date();
    const appointments = calendarAppointments.filter((appointment) =>
      appointment.day === today.getDate()
      && appointment.month === today.getMonth()
      && appointment.year === today.getFullYear()
    );
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
    };
  }, [calendarAppointments]);

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
  const totalCount = calendarAppointments.length;
  const filteredAppointments = useMemo(
    () => calendarAppointments.filter(matchesFilters),
    [calendarAppointments, matchesFilters]
  );
  const filteredCount = filteredAppointments.length;

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
            <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(260px,0.8fr)_auto]">
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
              <button
                type="button"
                onClick={() => setShowOverviewDrawer(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[13px] font-bold text-[#1e40af] transition-colors hover:bg-blue-100 xl:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" /> תמונת מצב ורופאים
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
        <aside className="sticky top-[80px] hidden w-[260px] shrink-0 xl:block" aria-label="תמונת מצב וסינון רופאים">
          <ScheduleOverviewRail
            todayCounts={todaySummary.counts}
            emergencyCount={todaySummary.emergencyCount}
            activeVet={activeVet}
            doctorOptions={doctorOptions}
            vetCounts={vetCounts}
            totalAppointments={calendarAppointments.length}
            onSelectVet={setActiveVet}
          />
        </aside>
      </div>

      {showOverviewDrawer && (
        <div className="fixed inset-0 z-[230] xl:hidden" role="dialog" aria-modal="true" aria-label="תמונת מצב וסינון רופאים">
          <button type="button" aria-label="סגירת החלון" onClick={() => setShowOverviewDrawer(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />
          <div className="absolute inset-y-0 right-0 w-[min(88vw,340px)] overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-extrabold text-slate-900">ניהול היומן</h2>
                <p className="text-[12px] text-slate-500">תמונת מצב וסינון לפי רופא</p>
              </div>
              <button type="button" onClick={() => setShowOverviewDrawer(false)} aria-label="סגירה" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <ScheduleOverviewRail
              todayCounts={todaySummary.counts}
              emergencyCount={todaySummary.emergencyCount}
              activeVet={activeVet}
              doctorOptions={doctorOptions}
              vetCounts={vetCounts}
              totalAppointments={calendarAppointments.length}
              onSelectVet={(vet) => { setActiveVet(vet); setShowOverviewDrawer(false); }}
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
          onClose={actions.closeModal}
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
