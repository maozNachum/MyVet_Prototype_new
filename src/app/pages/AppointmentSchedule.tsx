import { useState, useCallback } from "react";
import { useCalendarNav } from "../hooks/useCalendarNav";
import { useAppointmentActions } from "../hooks/useAppointmentActions";
import { useAppointmentStore } from "../data/AppointmentStore";
import { CalendarHeader } from "../components/schedule/CalendarHeader";
import { MonthlyView } from "../components/schedule/MonthlyView";
import { WeeklyView } from "../components/schedule/WeeklyView";
import { DailyView } from "../components/schedule/DailyView";
import { CalendarSidebar } from "../components/schedule/CalendarSidebar";
import { DeptFilterPanel } from "../components/schedule/DeptFilterPanel";
import { AppointmentActionModal } from "../components/schedule/AppointmentActionModal";

export function AppointmentSchedule() {
  const nav = useCalendarNav();
  const actions = useAppointmentActions();
  const { calendarAppointments } = useAppointmentStore();

  // ── Search & Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDepts, setActiveDepts] = useState<Set<string>>(new Set());

  const toggleDept = (dept: string) => {
    setActiveDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const clearDepts = () => setActiveDepts(new Set());

  // ── Filtered getAppointments wrapper ──
  const filteredGetAppointments = useCallback(
    (day: number, month?: number, year?: number) => {
      let appts = nav.getAppointments(day, month, year);

      if (activeDepts.size > 0) {
        appts = appts.filter((a) => activeDepts.has(a.department));
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        appts = appts.filter(
          (a) =>
            a.petName.toLowerCase().includes(q) ||
            a.ownerName.toLowerCase().includes(q) ||
            a.type.toLowerCase().includes(q) ||
            a.vet.toLowerCase().includes(q) ||
            a.department.toLowerCase().includes(q)
        );
      }

      return appts;
    },
    [nav.getAppointments, activeDepts, searchQuery]
  );

  // Total vs filtered count for the filter panel badge
  const totalCount = calendarAppointments.length;
  const filteredCount =
    activeDepts.size === 0 && !searchQuery.trim()
      ? totalCount
      : calendarAppointments.filter((a) => {
          const deptOk = activeDepts.size === 0 || activeDepts.has(a.department);
          const searchOk =
            !searchQuery.trim() ||
            (() => {
              const q = searchQuery.trim().toLowerCase();
              return (
                a.petName.toLowerCase().includes(q) ||
                a.ownerName.toLowerCase().includes(q) ||
                a.type.toLowerCase().includes(q) ||
                a.vet.toLowerCase().includes(q)
              );
            })();
          return deptOk && searchOk;
        }).length;

  return (
    <main
      className="max-w-[1600px] mx-auto px-6 py-6"
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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main layout: [calendar] [right sidebar column] */}
      <div className="flex gap-5 items-start">
        {/* ── Calendar area ── */}
        <div className="flex-1 min-w-0 relative">
          {/* Status legend - top left corner */}
          <div className="absolute -top-14 left-0 flex items-center gap-4 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-100 shadow-sm">
            <span className="text-gray-500 font-medium text-[12px]" style={{ fontWeight: 600 }}>
              סטטוס:
            </span>
            {[
              { color: "bg-green-500", label: "שולם" },
              { color: "bg-blue-500",  label: "ביקור פתוח" },
              { color: "bg-red-500",   label: "מאחר / לא הגיע" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
                <span className="text-gray-500 text-[11.5px]" style={{ fontWeight: 500 }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          {nav.viewMode === "monthly" && (
            <MonthlyView
              calendarCells={nav.calendarCells}
              selectedDay={nav.selectedDay}
              isToday={nav.isToday}
              getAppointments={filteredGetAppointments}
              onDayClick={nav.handleDayClick}
            />
          )}
          {nav.viewMode === "weekly" && (
            <WeeklyView
              weekDays={nav.weekDays}
              getAppointments={filteredGetAppointments}
              onApptClick={(appt) => actions.openAction(appt, "view")}
            />
          )}
          {nav.viewMode === "daily" && (
            <DailyView
              dailyDate={nav.dailyDate}
              getAppointments={filteredGetAppointments}
              onApptClick={(appt) => actions.openAction(appt, "view")}
            />
          )}
        </div>

        {/* ── Right sidebar column ── */}
        <div className="w-[220px] shrink-0 flex flex-col gap-4 sticky top-[80px]">
          {/* Day detail sidebar — monthly only, when a day is selected */}
          {nav.sidebarOpen &&
            nav.selectedDay !== null &&
            nav.viewMode === "monthly" && (
              <CalendarSidebar
                selectedDay={nav.selectedDay}
                currentMonth={nav.currentMonth}
                currentYear={nav.currentYear}
                appointments={nav.sidebarAppointments}
                onClose={() => nav.setSidebarOpen(false)}
                onApptAction={actions.openAction}
              />
            )}

          {/* Department filter — always visible */}
          <DeptFilterPanel
            activeDepts={activeDepts}
            onToggle={toggleDept}
            onClearAll={clearDepts}
            totalCount={totalCount}
            filteredCount={filteredCount}
          />
        </div>
      </div>

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
          openAction={actions.openAction}
        />
      )}
    </main>
  );
}
