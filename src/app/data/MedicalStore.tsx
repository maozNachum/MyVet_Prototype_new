import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────
export interface MedicalVisit {
  id: number;
  patientId: number;
  date: string;
  vetName: string;
  reason: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  attachments: number;
}

export interface Prescription {
  id: number;
  patientId: number;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  startDate: string;
  prescribedBy: string;
}

// ─── Initial Data (Fallback) ─────────────────────────────────────────
const initialVisits: MedicalVisit[] = [
  {
    id: 1,
    patientId: 1, // ניקו (חתול)
    date: "2025-10-15",
    vetName: 'ד"ר שרה לוי',
    reason: "חיסון מרובע",
    diagnosis: "בריא",
    treatment: "ניתן חיסון מרובע, הכל תקין.",
    notes: "לשקול מעבר למזון בוגרים בעוד חצי שנה.",
    attachments: 0,
  },
  {
    id: 2,
    patientId: 2, // רקס (כלב)
    date: "2025-11-20",
    vetName: 'ד"ר יוסי כהן',
    reason: "צליעה רגל אחורית",
    diagnosis: "מתיחת שריר קלה",
    treatment: "מנוחה לשבוע, משככי כאבים במקרה הצורך.",
    notes: "אם הצליעה לא עוברת תוך שבוע, לחזור לצילום רנטגן.",
    attachments: 1,
  }
];

const initialPrescriptions: Prescription[] = [];

// ─── Context ─────────────────────────────────────────────────────────
interface MedicalStoreValue {
  visits: MedicalVisit[];
  prescriptions: Prescription[];
  isLoading: boolean;
  error: string | null;
  addVisit: (visit: Omit<MedicalVisit, "id">) => Promise<void>;
  updateVisit: (id: number, updates: Partial<MedicalVisit>) => Promise<void>;
  addPrescription: (prescription: Omit<Prescription, "id">) => Promise<void>;
}

const MedicalStoreContext = createContext<MedicalStoreValue | null>(null);

export function useMedicalStore() {
  const ctx = useContext(MedicalStoreContext);
  if (!ctx) throw new Error("useMedicalStore must be used within MedicalStoreProvider");
  return ctx;
}

// פונקציית עזר לסימולציית שרת
const simulateNetwork = async (shouldFail = false) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (shouldFail && Math.random() > 0.8) {
    throw new Error("שגיאת רשת מדומה");
  }
};

export function MedicalStoreProvider({ children }: { children: ReactNode }) {
  // 1. טעינה מ-localStorage (בדיקה אם יש נתונים שמורים בדפדפן)
  const [visits, setVisits] = useState<MedicalVisit[]>(() => {
    try {
      const saved = localStorage.getItem("myvet_medical_visits");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("שגיאה בטעינת ביקורים מהדפדפן", e);
    }
    return initialVisits;
  });

  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => {
    try {
      const saved = localStorage.getItem("myvet_prescriptions");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("שגיאה בטעינת מרשמים מהדפדפן", e);
    }
    return initialPrescriptions;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 2. שמירה אוטומטית: גיבוי כל שינוי לדפדפן
  useEffect(() => {
    localStorage.setItem("myvet_medical_visits", JSON.stringify(visits));
  }, [visits]);

  useEffect(() => {
    localStorage.setItem("myvet_prescriptions", JSON.stringify(prescriptions));
  }, [prescriptions]);

  // 3. הוספת טיפול עם תעודת זהות חסינה מהתנגשויות (UUID מבוסס זמן)
  const addVisit = useCallback(async (visit: Omit<MedicalVisit, "id">) => {
    setIsLoading(true);
    setError(null); // איפוס שגיאות ישנות
    try {
      await simulateNetwork();
      setVisits((prev) => {
        const newId = Date.now() + Math.floor(Math.random() * 1000);
        return [{ ...visit, id: newId }, ...prev]; // הטיפול החדש נכנס לתחילת המערך
      });
      toast.success("הטיפול נשמר בהצלחה בתיק הרפואי");
    } catch (err) {
      setError("שגיאה בשמירת הטיפול");
      toast.error("לא הצלחנו לשמור את הטיפול, נסה שוב");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateVisit = useCallback(async (id: number, updates: Partial<MedicalVisit>) => {
    setIsLoading(true);
    setError(null);
    try {
      await simulateNetwork();
      setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, ...updates } : v)));
      toast.success("הטיפול עודכן בהצלחה");
    } catch (err) {
      setError("שגיאה בעדכון הטיפול");
      toast.error("לא הצלחנו לעדכן את הטיפול");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addPrescription = useCallback(async (prescription: Omit<Prescription, "id">) => {
    setIsLoading(true);
    setError(null);
    try {
      await simulateNetwork();
      setPrescriptions((prev) => {
        const newId = Date.now() + Math.floor(Math.random() * 1000);
        return [{ ...prescription, id: newId }, ...prev];
      });
      toast.success("המרשם הופק בהצלחה");
    } catch (err) {
      setError("שגיאה בהנפקת המרשם");
      toast.error("לא הצלחנו להנפיק את המרשם");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <MedicalStoreContext.Provider
      value={{
        visits,
        prescriptions,
        isLoading,
        error,
        addVisit,
        updateVisit,
        addPrescription,
      }}
    >
      {children}
    </MedicalStoreContext.Provider>
  );
}