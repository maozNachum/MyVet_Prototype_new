import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
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
import { Stethoscope, Users } from "lucide-react";
import { useStaffMembers, uniqueNames } from "../data/staffDirectory";
import { ScheduleAssistant } from "../components/ai/PageAssistants";

export function AppointmentSchedule() {
  const navigate = useNavigate();
  const nav = useCalendarNav();
  const actions = useAppointmentActions();
  const { calendarAppointments, refreshAppointments, isLoading } = useAppointmentStore();
  const { members: vetStaff, isLoading: isStaffLoading } = useStaffMembers(["vet"]);

  useEffect(() => {
    refreshAppointments();
  }, [refreshAppointments]);

  // ── Search & Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDepts, setActiveDepts] = useState<Set<string>>(new Set());
  const [activeVet, setActiveVet] = useState<string>("all");

  const toggleDept = (dept: string) => {
    setActiveDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const clearDepts = () => setActiveDepts(new Set());

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
      let appts = nav.getAppointments(day, month, year);

      if (activeDepts.size > 0) {
        appts = appts.filter((a) => activeDepts.has(a.department));
      }

      if (activeVet !== "all") {
        appts = appts.filter((a) => a.vet === activeVet);
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
    [nav.getAppointments, activeDepts, activeVet, searchQuery]
  );

  // Total vs filtered count for the filter panel badge
  const totalCount = calendarAppointments.length;
  const filteredCount =
    activeDepts.size === 0 && activeVet === "all" && !searchQuery.trim()
      ? totalCount
      : calendarAppointments.filter((a) => {
          const deptOk = activeDepts.size === 0 || activeDepts.has(a.department);
          const vetOk = activeVet === "all" || a.vet === activeVet;
          const searchOk =
            !searchQuery.trim() ||
            (() => {
              const q = searchQuery.trim().toLowerCase();
              return (
                a.petName.toLowerCase().includes(q) ||
                a.ownerName.toLowerCase().includes(q) ||
                a.type.toLowerCase().includes(q) ||
                a.vet.toLowerCase().includes(q) ||
                a.department.toLowerCase().includes(q)
              );
            })();
          return deptOk && vetOk && searchOk;
        }).length;

  const filteredAppointments = useMemo(() => {
    return calendarAppointments.filter((a) => {
      const deptOk = activeDepts.size === 0 || activeDepts.has(a.department);
      const vetOk = activeVet === "all" || a.vet === activeVet;
      const searchOk =
        !searchQuery.trim() ||
        (() => {
          const q = searchQuery.trim().toLowerCase();
          return (
            a.petName.toLowerCase().includes(q) ||
            a.ownerName.toLowerCase().includes(q) ||
            a.type.toLowerCase().includes(q) ||
            a.vet.toLowerCase().includes(q) ||
            a.department.toLowerCase().includes(q)
          );
        })();
      return deptOk && vetOk && searchOk;
    });
  }, [calendarAppointments, activeDepts, activeVet, searchQuery]);

  const filteredSidebarAppointments = useMemo(() => {
    return nav.sidebarAppointments.filter((a) => {
      const deptOk = activeDepts.size === 0 || activeDepts.has(a.department);
      const vetOk = activeVet === "all" || a.vet === activeVet;
      const searchOk =
        !searchQuery.trim() ||
        (() => {
          const q = searchQuery.trim().toLowerCase();
          return (
            a.petName.toLowerCase().includes(q) ||
            a.ownerName.toLowerCase().includes(q) ||
            a.type.toLowerCase().includes(q) ||
            a.vet.toLowerCase().includes(q) ||
            a.department.toLowerCase().includes(q)
          );
        })();
      return deptOk && vetOk && searchOk;
    });
  }, [nav.sidebarAppointments, activeDepts, activeVet, searchQuery]);

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

      <ScheduleAssistant appointments={filteredAppointments} viewMode={nav.viewMode} activeVet={activeVet} />

      {(isLoading || isStaffLoading) && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-700 text-[13px] font-medium">
          מסנכרן תורים ואנשי צוות מול Supabase...
        </div>
      )}

      {/* Main layout: [calendar] [right sidebar column] */}
      <div className="flex gap-5 items-start">
        {/* ── Calendar area ── */}
        <div className="flex-1 min-w-0 relative">
          {/* Status legend - top left corner */}
          <div className="absolute -top-14 left-0 flex items-center gap-4 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-100 shadow-sm">
            <span className="text-gray-500 font-medium text-[12px]" style={{ fontWeight: 600 }}>
              מקור נתונים:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0 bg-gray-400" />
              <span className="text-gray-500 text-[11.5px]" style={{ fontWeight: 500 }}>
                תורים מטבלת appointments
              </span>
            </div>
          </div>
          {nav.viewMode === "monthly" && (
            <MonthlyView
              calendarCells={nav.calendarCells}
              selectedDay={nav.selectedDay}
              currentMonth={nav.currentMonth}
              currentYear={nav.currentYear}
              isToday={nav.isToday}
              getAppointments={filteredGetAppointments}
              onDayClick={nav.handleDayClick}
              onCreateAppointment={(date) => openNewAppointmentAt(date)}
            />
          )}
          {nav.viewMode === "weekly" && (
            <WeeklyView
              weekDays={nav.weekDays}
              getAppointments={filteredGetAppointments}
              onApptClick={(appt) => actions.openAction(appt, "view")}
              onSlotClick={(date, hour) =>
                openNewAppointmentAt(date, `${String(hour).padStart(2, "0")}:00`)
              }
            />
          )}
          {nav.viewMode === "daily" && (
            <DailyView
              dailyDate={nav.dailyDate}
              getAppointments={filteredGetAppointments}
              onApptClick={(appt) => actions.openAction(appt, "view")}
              onSlotClick={(date, hour) =>
                openNewAppointmentAt(date, `${String(hour).padStart(2, "0")}:00`)
              }
            />
          )}
        </div>

        {/* ── Right sidebar column ── */}
        <div className="w-[220px] shrink-0 flex flex-col gap-4 sticky top-[80px]">
          <div
            dir="rtl"
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            style={{ fontFamily: "'Heebo', sans-serif" }}
          >
            <div className="px-4 py-3.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-[#1e40af]/10 rounded-lg flex items-center justify-center">
                  <Stethoscope className="w-3.5 h-3.5 text-[#1e40af]" />
                </div>
                <span className="text-gray-800 text-[14px]" style={{ fontWeight: 700 }}>
                  יומן לפי רופא
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600" style={{ fontWeight: 700 }}>
                {activeVet === "all" ? "כולם" : "רופא"}
              </span>
            </div>

            <div className="p-3 space-y-1.5">
              {doctorOptions.map((vetName) => {
                const isAll = vetName === "all";
                const isActive = activeVet === vetName;
                const count = isAll ? calendarAppointments.length : vetCounts.get(vetName) || 0;
                const label = isAll ? "כל היומנים" : vetName;

                return (
                  <button
                    key={vetName}
                    type="button"
                    onClick={() => setActiveVet(vetName)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-right ${
                      isActive
                        ? "bg-blue-50 border-blue-100 shadow-sm"
                        : "border-transparent hover:bg-gray-50 hover:border-gray-100"
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive ? "bg-[#1e40af] text-white" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {isAll ? <Users className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                    </span>
                    <span
                      className={`flex-1 text-[13px] text-right ${isActive ? "text-[#1e40af]" : "text-gray-700"}`}
                      style={{ fontWeight: isActive ? 700 : 500 }}
                    >
                      {label}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        isActive ? "bg-white text-[#1e40af] border border-blue-100" : "bg-gray-100 text-gray-500"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day detail sidebar — monthly only, when a day is selected */}
          {nav.sidebarOpen &&
            nav.selectedDay !== null &&
            nav.viewMode === "monthly" && (
              <CalendarSidebar
                selectedDay={nav.selectedDay}
                currentMonth={nav.currentMonth}
                currentYear={nav.currentYear}
                appointments={filteredSidebarAppointments}
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
