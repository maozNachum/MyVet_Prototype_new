import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";

export type PetSpecies = "dog" | "cat" | "other";
export type AppointmentMode = "physical" | "video";

// ─── Types ───────────────────────────────────────────────────────────
export interface CalendarAppointment {
  id: number;
  appointmentId?: number;
  petId?: number;
  ownerId?: string;
  day: number;
  month: number; // JS month index: 0-11
  year: number;
  time: string;
  endTime: string;
  petName: string;
  petSpecies: PetSpecies;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  department: string;
  vet: string;
  room: string;
  type: string;
  appointmentMode: AppointmentMode;
  color: string;
  notes: string;
}

export interface AppNotification {
  id: number;
  target: "owner" | "staff";
  type: "rescheduled" | "cancelled" | "edited" | "created";
  message: string;
  detail: string;
  petName: string;
  changedBy: "owner" | "staff";
  timestamp: Date;
  read: boolean;
}

interface AppointmentStoreValue {
  calendarAppointments: CalendarAppointment[];
  notifications: AppNotification[];
  isLoading: boolean;
  error: string | null;
  refreshAppointments: () => Promise<void>;
  unreadCount: (target: "owner" | "staff") => number;
  markAllRead: (target: "owner" | "staff") => void;
  dismissNotification: (id: number) => void;
  addAppointment: (appt: Omit<CalendarAppointment, "id">) => Promise<void>;
  deleteAppointment: (id: number, by: "owner" | "staff") => Promise<void>;
  rescheduleAppointment: (id: number, newDay: number, newMonth: number, newYear: number, newTime: string, newEndTime: string, by: "owner" | "staff") => Promise<void>;
  editAppointment: (id: number, updates: Partial<CalendarAppointment>, by: "owner" | "staff") => Promise<void>;
}

const AppointmentStoreContext = createContext<AppointmentStoreValue | null>(null);

export function useAppointmentStore() {
  const ctx = useContext(AppointmentStoreContext);
  if (!ctx) throw new Error("useAppointmentStore must be used within AppointmentStoreProvider");
  return ctx;
}

let notifIdCounter = 100;

function normalizeSpecies(species?: string | null): PetSpecies {
  const value = (species || "").toLowerCase().trim();
  if (value === "cat" || value === "חתול") return "cat";
  if (value === "dog" || value === "כלב") return "dog";
  return "other";
}

function normalizeAppointmentMode(value?: string | null): AppointmentMode {
  return value === "video" ? "video" : "physical";
}

export function appointmentModeLabel(mode?: AppointmentMode | string | null) {
  return mode === "video" ? "תור וידאו" : "תור פיזי";
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function buildDateTime(year: number, month: number, day: number, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month, day, hours || 0, minutes || 0, 0, 0);
}

export function validateAppointmentWindow(startDate: Date, endDate: Date, requireFuture = true) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("תאריך או שעת התור אינם תקינים");
  }
  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error("שעת הסיום חייבת להיות מאוחרת משעת ההתחלה");
  }
  if (requireFuture && startDate.getTime() <= Date.now()) {
    throw new Error("אפשר לקבוע או להזיז תור רק למועד עתידי");
  }
}

export async function ensureNoAppointmentConflict({
  startDate,
  endDate,
  vet,
  room,
  mode,
  excludeId,
}: {
  startDate: Date;
  endDate: Date;
  vet?: string;
  room?: string;
  mode: AppointmentMode;
  excludeId?: number;
}) {
  let query = supabase
    .from("appointments")
    .select("appointment_id, vet_name, room, start_time, end_time")
    .lt("start_time", endDate.toISOString())
    .gt("end_time", startDate.toISOString());

  if (excludeId) query = query.neq("appointment_id", excludeId);
  const { data, error } = await query;
  if (error) throw error;

  const normalizedVet = (vet || "").trim();
  const normalizedRoom = (room || "").trim();
  const checkVet = Boolean(normalizedVet && !normalizedVet.includes("טרם"));
  const checkRoom = Boolean(mode === "physical" && normalizedRoom && !["-", "—"].includes(normalizedRoom));
  const conflict = (data || []).find((row: any) =>
    (checkVet && String(row.vet_name || "").trim() === normalizedVet) ||
    (checkRoom && String(row.room || "").trim() === normalizedRoom),
  );

  if (conflict) {
    const reason = checkVet && String(conflict.vet_name || "").trim() === normalizedVet
      ? `הרופא/ה ${normalizedVet} כבר משובצ/ת בזמן הזה`
      : `החדר ${normalizedRoom} כבר תפוס בזמן הזה`;
    throw new Error(reason);
  }
}

function fullName(first?: string | null, last?: string | null) {
  return `${first || ""} ${last || ""}`.trim();
}

export function AppointmentStoreProvider({ children }: { children: ReactNode }) {
  const [calendarAppointments, setCalendarAppointments] = useState<CalendarAppointment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const pushNotification = useCallback(
    (target: "owner" | "staff", type: AppNotification["type"], message: string, detail: string, petName: string, changedBy: "owner" | "staff") => {
      setNotifications((prev) => [
        {
          id: ++notifIdCounter,
          target,
          type,
          message,
          detail,
          petName,
          changedBy,
          timestamp: new Date(),
          read: false,
        },
        ...prev,
      ]);
    },
    []
  );

  const refreshAppointments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: appointmentRows, error: appointmentsError } = await supabase
        .from("appointments")
        .select("appointment_id, pet_id, start_time, end_time, department, vet_name, room, appointment_type, appointment_mode, color, notes")
        .order("start_time", { ascending: true });

      if (appointmentsError) throw appointmentsError;

      const rows = appointmentRows || [];
      const petIds = Array.from(new Set(rows.map((row: any) => Number(row.pet_id)).filter(Boolean)));

      const petById = new Map<number, any>();
      const ownerIds = new Set<string>();

      if (petIds.length > 0) {
        const { data: patientRows, error: patientError } = await supabase
          .from("patients")
          .select("pet_id, pet_name, species, owner_id")
          .in("pet_id", petIds);

        if (patientError) throw patientError;

        for (const patient of patientRows || []) {
          petById.set(Number(patient.pet_id), patient);
          if (patient.owner_id) ownerIds.add(String(patient.owner_id));
        }
      }

      const ownerById = new Map<string, any>();

      if (ownerIds.size > 0) {
        const { data: ownerRows, error: ownerError } = await supabase
          .from("owners")
          .select("owner_id, owner_first_name, owner_last_name, phone, email")
          .in("owner_id", Array.from(ownerIds));

        if (ownerError) throw ownerError;

        for (const owner of ownerRows || []) {
          ownerById.set(String(owner.owner_id), owner);
        }
      }

      const mapped: CalendarAppointment[] = rows.map((row: any) => {
        const start = new Date(row.start_time);
        const pet = petById.get(Number(row.pet_id));
        const owner = pet?.owner_id ? ownerById.get(String(pet.owner_id)) : undefined;
        const appointmentMode = normalizeAppointmentMode(row.appointment_mode);

        return {
          id: Number(row.appointment_id),
          appointmentId: Number(row.appointment_id),
          petId: row.pet_id !== null && row.pet_id !== undefined ? Number(row.pet_id) : undefined,
          ownerId: pet?.owner_id ? String(pet.owner_id) : undefined,
          day: start.getDate(),
          month: start.getMonth(),
          year: start.getFullYear(),
          time: formatTime(row.start_time),
          endTime: formatTime(row.end_time),
          petName: pet?.pet_name || "חיה לא מזוהה",
          petSpecies: normalizeSpecies(pet?.species),
          ownerName: owner ? fullName(owner.owner_first_name, owner.owner_last_name) || "ללא שם" : "בעלים לא ידוע",
          ownerPhone: owner?.phone || "",
          ownerEmail: owner?.email || "",
          department: row.department || "כללי",
          vet: row.vet_name || "טרם שובץ",
          room: row.room || (appointmentMode === "video" ? "דיגיטל" : "—"),
          type: row.appointment_type || "ביקור",
          appointmentMode,
          color: row.color || "blue",
          notes: row.notes || "",
        };
      });

      setCalendarAppointments(mapped);
    } catch (err: any) {
      console.error("Error loading appointments from Supabase:", err);
      setError(err?.message || "שגיאה בטעינת תורים");
      toast.error("שגיאה בטעינת תורים מהענן");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAppointments();
  }, [refreshAppointments]);

  useEffect(() => {
    const syncAppointments = () => {
      void refreshAppointments();
    };

    const syncWhenVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        syncAppointments();
      }
    };

    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    const intervalId = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        syncAppointments();
      }
    }, 30000);

    const channel = supabase
      .channel("myvet-appointments-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, syncAppointments)
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, syncAppointments)
      .on("postgres_changes", { event: "*", schema: "public", table: "owners" }, syncAppointments)
      .subscribe();

    return () => {
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [refreshAppointments]);

  const unreadCount = useCallback(
    (target: "owner" | "staff") => notifications.filter((n) => n.target === target && !n.read).length,
    [notifications]
  );

  const markAllRead = useCallback((target: "owner" | "staff") => {
    setNotifications((prev) => prev.map((n) => (n.target === target ? { ...n, read: true } : n)));
  }, []);

  const dismissNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addAppointment = useCallback(
    async (appt: Omit<CalendarAppointment, "id">) => {
      setIsLoading(true);
      setError(null);

      try {
        if (!appt.petId) {
          throw new Error("לא נבחרה חיה תקינה לתור");
        }

        const startDate = buildDateTime(appt.year, appt.month, appt.day, appt.time);
        const endDate = buildDateTime(appt.year, appt.month, appt.day, appt.endTime || appt.time);
        const appointmentMode = normalizeAppointmentMode(appt.appointmentMode);
        validateAppointmentWindow(startDate, endDate);
        await ensureNoAppointmentConflict({
          startDate,
          endDate,
          vet: appt.vet,
          room: appt.room,
          mode: appointmentMode,
        });

        const { error: insertError } = await supabase.from("appointments").insert([
          {
            pet_id: appt.petId,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            department: appt.department || "כללי",
            vet_name: appt.vet || "טרם שובץ",
            room: appt.room || (appointmentMode === "video" ? "דיגיטל" : "—"),
            appointment_type: appt.type || "ביקור",
            appointment_mode: appointmentMode,
            color: appt.color || "blue",
            notes: appt.notes || null,
          },
        ]);

        if (insertError) throw insertError;

        await refreshAppointments();
        pushNotification("staff", "created", "תור חדש נוסף ליומן", `התור של ${appt.petName} נוסף`, appt.petName, "staff");
        toast.success("התור נוסף ליומן בהצלחה");
      } catch (err: any) {
        console.error("Error adding appointment:", err);
        setError(err?.message || "שגיאה בהוספת התור");
        toast.error(err?.message || "לא הצלחנו לקבוע את התור");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [refreshAppointments, pushNotification]
  );

  const deleteAppointment = useCallback(
    async (id: number, by: "owner" | "staff") => {
      setIsLoading(true);
      setError(null);

      try {
        const appt = calendarAppointments.find((a) => a.id === id);

        const { error: deleteError } = await supabase
          .from("appointments")
          .delete()
          .eq("appointment_id", id);

        if (deleteError) throw deleteError;

        setCalendarAppointments((prev) => prev.filter((a) => a.id !== id));

        if (appt) {
          const target = by === "owner" ? "staff" : "owner";
          pushNotification(target, "cancelled", `${by === "owner" ? appt.ownerName : "המרפאה"} — ביטול תור`, `התור של ${appt.petName} בוטל`, appt.petName, by);
        }

        toast.success("התור בוטל בהצלחה");
      } catch (err: any) {
        console.error("Error deleting appointment:", err);
        setError(err?.message || "שגיאה במחיקת התור");
        toast.error("לא הצלחנו למחוק את התור");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [calendarAppointments, pushNotification]
  );

  const rescheduleAppointment = useCallback(
    async (id: number, newDay: number, newMonth: number, newYear: number, newTime: string, newEndTime: string, by: "owner" | "staff") => {
      setIsLoading(true);
      setError(null);

      try {
        const current = calendarAppointments.find((appointment) => appointment.id === id);
        if (!current) throw new Error("התור לא נמצא");
        const startDate = buildDateTime(newYear, newMonth, newDay, newTime);
        const endDate = buildDateTime(newYear, newMonth, newDay, newEndTime || newTime);
        validateAppointmentWindow(startDate, endDate);
        await ensureNoAppointmentConflict({
          startDate,
          endDate,
          vet: current.vet,
          room: current.room,
          mode: normalizeAppointmentMode(current.appointmentMode),
          excludeId: id,
        });

        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
          })
          .eq("appointment_id", id);

        if (updateError) throw updateError;

        setCalendarAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, day: newDay, month: newMonth, year: newYear, time: newTime, endTime: newEndTime }
              : a
          )
        );

        const appt = calendarAppointments.find((a) => a.id === id);
        if (appt) {
          const target = by === "owner" ? "staff" : "owner";
          pushNotification(target, "rescheduled", "התור הוזז", `התור של ${appt.petName} הוזז ל-${newDay}/${newMonth + 1}/${newYear} בשעה ${newTime}`, appt.petName, by);
        }

        toast.success("התור עודכן בהצלחה");
      } catch (err: any) {
        console.error("Error rescheduling appointment:", err);
        setError(err?.message || "שגיאה בעדכון התור");
        toast.error("שגיאה בעדכון התור");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [calendarAppointments, pushNotification]
  );

  const editAppointment = useCallback(
    async (id: number, updates: Partial<CalendarAppointment>, by: "owner" | "staff") => {
      setIsLoading(true);
      setError(null);

      try {
        const current = calendarAppointments.find((a) => a.id === id);
        if (!current) throw new Error("התור לא נמצא");

        const patch: Record<string, any> = {};

        if (updates.type !== undefined) patch.appointment_type = updates.type;
        if (updates.department !== undefined) patch.department = updates.department;
        if (updates.vet !== undefined) patch.vet_name = updates.vet;
        if (updates.room !== undefined) patch.room = updates.room;
        if (updates.notes !== undefined) patch.notes = updates.notes || null;
        if (updates.color !== undefined) patch.color = updates.color;
        if (updates.appointmentMode !== undefined) patch.appointment_mode = normalizeAppointmentMode(updates.appointmentMode);

        if (updates.time !== undefined) {
          const startDate = buildDateTime(current.year, current.month, current.day, updates.time);
          patch.start_time = startDate.toISOString();
        }

        if (updates.endTime !== undefined) {
          const endDate = buildDateTime(current.year, current.month, current.day, updates.endTime);
          patch.end_time = endDate.toISOString();
        }

        const schedulingChanged = updates.time !== undefined || updates.endTime !== undefined || updates.vet !== undefined || updates.room !== undefined || updates.appointmentMode !== undefined;
        if (schedulingChanged) {
          const nextStart = buildDateTime(current.year, current.month, current.day, updates.time ?? current.time);
          const nextEnd = buildDateTime(current.year, current.month, current.day, updates.endTime ?? current.endTime);
          validateAppointmentWindow(nextStart, nextEnd, updates.time !== undefined || updates.endTime !== undefined);
          await ensureNoAppointmentConflict({
            startDate: nextStart,
            endDate: nextEnd,
            vet: updates.vet ?? current.vet,
            room: updates.room ?? current.room,
            mode: normalizeAppointmentMode(updates.appointmentMode ?? current.appointmentMode),
            excludeId: id,
          });
        }

        const { error: updateError } = await supabase
          .from("appointments")
          .update(patch)
          .eq("appointment_id", id);

        if (updateError) throw updateError;

        setCalendarAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));

        const target = by === "owner" ? "staff" : "owner";
        pushNotification(target, "edited", "פרטי תור עודכנו", `התור של ${current.petName} עודכן`, current.petName, by);
        toast.success("הפרטים נשמרו בהצלחה");
      } catch (err: any) {
        console.error("Error editing appointment:", err);
        setError(err?.message || "שגיאה בעריכת התור");
        toast.error("לא הצלחנו לשמור את העריכה");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [calendarAppointments, pushNotification]
  );

  return (
    <AppointmentStoreContext.Provider
      value={{
        calendarAppointments,
        notifications,
        isLoading,
        error,
        refreshAppointments,
        unreadCount,
        markAllRead,
        dismissNotification,
        addAppointment,
        deleteAppointment,
        rescheduleAppointment,
        editAppointment,
      }}
    >
      {children}
    </AppointmentStoreContext.Provider>
  );
}
