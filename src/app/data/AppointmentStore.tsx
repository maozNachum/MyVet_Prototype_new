import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────
export interface CalendarAppointment {
  id: number;
  day: number;
  month: number; // 0-indexed
  year: number;
  time: string;
  endTime: string;
  petName: string;
  petSpecies: "dog" | "cat";
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  department: string;
  vet: string;
  room: string;
  type: string;
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

// ─── Initial Calendar Appointments ───────────────────────────────────
const initialCalendarAppointments: CalendarAppointment[] = [
  { id: 1,  day: 1,  month: 2, year: 2026, time: "09:00", endTime: "09:30", petName: "רקס",  petSpecies: "dog", ownerName: "יוסי כהן",     ownerPhone: "052-3456789", ownerEmail: "yosi.cohen@example.com", department: "פנימית",     vet: 'ד"ר יוסי כהן',  room: "חדר 1",       type: "חיסון שנתי",    color: "blue",   notes: "חיסון כלבת + משושה" },
  { id: 2,  day: 1,  month: 2, year: 2026, time: "10:00", endTime: "10:45", petName: "ניקו",  petSpecies: "cat", ownerName: "שרה לוי",      ownerPhone: "054-7891234", ownerEmail: "shira.levi@example.com", department: "פנימית",     vet: 'ד"ר שרה לוי',   room: "חדר 2",       type: "בדיקה כללית",   color: "green",  notes: "בדיקה שגרתית חצי שנתית" },
];

// ─── Context ─────────────────────────────────────────────────────────
interface AppointmentStoreValue {
  calendarAppointments: CalendarAppointment[];
  notifications: AppNotification[];
  isLoading: boolean;
  error: string | null;
  unreadCount: (target: "owner" | "staff") => number;
  markAllRead: (target: "owner" | "staff") => void;
  dismissNotification: (id: number) => void;
  // הוספנו את addAppointment לממשק החנות
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

const simulateNetwork = async (shouldFail = false) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (shouldFail && Math.random() > 0.8) {
    throw new Error("שגיאת רשת מדומה");
  }
};

export function AppointmentStoreProvider({ children }: { children: ReactNode }) {
  const [calendarAppointments, setCalendarAppointments] = useState<CalendarAppointment[]>(initialCalendarAppointments);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 1,
      target: "staff",
      type: "rescheduled",
      message: "משפחת ישראלי הזיזו תור",
      detail: "התור של רקס הוזז מ-15/03 בשעה 10:00 ל-17/03 בשעה 11:00",
      petName: "רקס",
      changedBy: "owner",
      timestamp: new Date(2026, 2, 2, 8, 15),
      read: false,
    },
  ]);

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

  // ─── מימוש הוספת תור חדש ───
  const addAppointment = useCallback(
    async (appt: Omit<CalendarAppointment, "id">) => {
      setIsLoading(true);
      setError(null);
      try {
        await simulateNetwork(); // המתנה מדומה של שנייה
        
        setCalendarAppointments((prev) => {
          const newId = Math.max(...prev.map((a) => a.id), 0) + 1;
          // מוסיפים את התור החדש למערך
          return [...prev, { ...appt, id: newId }];
        });

        toast.success("התור נוסף ליומן בהצלחה");
      } catch (err) {
        setError("שגיאה בהוספת התור");
        toast.error("לא הצלחנו לקבוע את התור, נסה שוב");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

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

  const deleteAppointment = useCallback(
    async (id: number, by: "owner" | "staff") => {
      setIsLoading(true);
      setError(null);
      try {
        await simulateNetwork(true);
        const appt = calendarAppointments.find((a) => a.id === id);
        if (!appt) return;
        setCalendarAppointments((prev) => prev.filter((a) => a.id !== id));
        const target = by === "owner" ? "staff" : "owner";
        pushNotification(target, "cancelled", `${by === "owner" ? appt.ownerName : "המרפאה"} — ביטול תור`, `התור של ${appt.petName} בוטל`, appt.petName, by);
        toast.success("התור בוטל בהצלחה");
      } catch (err) {
        setError("שגיאה במחיקת התור");
        toast.error("שגיאת רשת: לא הצלחנו למחוק את התור");
      } finally {
        setIsLoading(false);
      }
    },
    [calendarAppointments, pushNotification]
  );

  const rescheduleAppointment = useCallback(
    async (id: number, newDay: number, newMonth: number, newYear: number, newTime: string, newEndTime: string, by: "owner" | "staff") => {
      setIsLoading(true);
      try {
        await simulateNetwork();
        setCalendarAppointments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, day: newDay, month: newMonth, year: newYear, time: newTime, endTime: newEndTime } : a))
        );
        toast.success("התור עודכן בהצלחה!");
      } catch (err) {
        toast.error("שגיאה בעדכון התור");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const editAppointment = useCallback(
    async (id: number, updates: Partial<CalendarAppointment>, by: "owner" | "staff") => {
      setIsLoading(true);
      try {
        await simulateNetwork();
        setCalendarAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
        toast.success("הפרטים נשמרו בהצלחה");
      } catch (err) {
        toast.error("לא הצלחנו לשמור את העריכה");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return (
    <AppointmentStoreContext.Provider
      value={{
        calendarAppointments,
        notifications,
        isLoading,
        error,
        unreadCount,
        markAllRead,
        dismissNotification,
        addAppointment, // הוספנו ל-Value
        deleteAppointment,
        rescheduleAppointment,
        editAppointment,
      }}
    >
      {children}
    </AppointmentStoreContext.Provider>
  );
}