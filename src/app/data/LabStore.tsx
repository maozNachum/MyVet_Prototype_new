import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner"; // ייבוא מערכת ההתראות

// ─── Types ───────────────────────────────────────────────────────────
export interface LabOrder {
  id: number;
  patientId: number;
  petName: string;
  testName: string;
  category: "blood" | "urine" | "imaging" | "biopsy" | "other";
  status: "ordered" | "in-progress" | "completed";
  orderedDate: string;
  orderedBy: string;
  results?: string;
  normalRange?: string;
  resultValue?: string;
  resultStatus?: "normal" | "abnormal" | "critical";
  completedDate?: string;
  notes?: string;
  urgent?: boolean;
}

const categoryLabels: Record<LabOrder["category"], string> = {
  blood: "בדיקת דם",
  urine: "בדיקת שתן",
  imaging: "הדמיה",
  biopsy: "ביופסיה",
  other: "אחר",
};

export { categoryLabels };

// ─── Initial Data ────────────────────────────────────────────────────
const initialLabOrders: LabOrder[] = [
  {
    id: 1,
    patientId: 1,
    petName: "רקס",
    testName: "ספירת דם מלאה (CBC)",
    category: "blood",
    status: "completed",
    orderedDate: "10/03/2026",
    orderedBy: "וטרינר",
    results: "כל הערכים בטווח הנורמלי. WBC תקין, RBC תקין, טסיות תקינות.",
    resultValue: "WBC: 8.5, RBC: 6.2, PLT: 280",
    normalRange: "WBC: 5.5-16.9, RBC: 5.5-8.5, PLT: 175-500",
    resultStatus: "normal",
    completedDate: "12/03/2026",
  },
  {
    id: 2,
    patientId: 1,
    petName: "רקס",
    testName: "פאנל ביוכימי",
    category: "blood",
    status: "completed",
    orderedDate: "10/03/2026",
    orderedBy: "וטרינר",
    results: "ALT מעט גבוה. יתר הערכים תקינים. מומלץ מעקב.",
    resultValue: "ALT: 125, BUN: 18, Creatinine: 1.1",
    normalRange: "ALT: 10-120, BUN: 7-27, Creatinine: 0.5-1.8",
    resultStatus: "abnormal",
    completedDate: "12/03/2026",
    notes: "ALT מעט מעל הנורמה — לחזור על הבדיקה בעוד חודש",
  },
  {
    id: 3,
    patientId: 1,
    petName: "רקס",
    testName: "צילום חזה",
    category: "imaging",
    status: "in-progress",
    orderedDate: "15/03/2026",
    orderedBy: "וטרינר",
    urgent: true,
  },
  {
    id: 4,
    patientId: 2,
    petName: "לונה",
    testName: "בדיקת שתן כללית",
    category: "urine",
    status: "completed",
    orderedDate: "08/03/2026",
    orderedBy: "וטרינר",
    results: "ממצאים תקינים. pH 6.5, ללא חלבון, ללא גלוקוז.",
    resultValue: "pH: 6.5, Protein: Neg, Glucose: Neg, SG: 1.035",
    normalRange: "pH: 5.5-7.0, SG: 1.015-1.045",
    resultStatus: "normal",
    completedDate: "09/03/2026",
  },
  {
    id: 5,
    patientId: 2,
    petName: "לונה",
    testName: "ספירת דם מלאה (CBC)",
    category: "blood",
    status: "ordered",
    orderedDate: "17/03/2026",
    orderedBy: "אחות",
  },
  {
    id: 6,
    patientId: 3,
    petName: "ניקו",
    testName: "בדיקת שריטת עור",
    category: "biopsy",
    status: "completed",
    orderedDate: "01/03/2026",
    orderedBy: "וטרינר",
    results: "נמצאו קרציות Demodex. מומלץ טיפול אנטי-פרזיטרי.",
    resultStatus: "abnormal",
    completedDate: "05/03/2026",
  },
  {
    id: 7,
    patientId: 4,
    petName: "מקס",
    testName: "פאנל קרישה",
    category: "blood",
    status: "completed",
    orderedDate: "05/03/2026",
    orderedBy: "וטרינר",
    results: "ערכי קרישה תקינים. PT ו-PTT בטווח.",
    resultValue: "PT: 12.5s, PTT: 65s",
    normalRange: "PT: 11-17s, PTT: 60-93s",
    resultStatus: "normal",
    completedDate: "06/03/2026",
  },
  {
    id: 8,
    patientId: 5,
    petName: "מיאו",
    testName: "אולטרסאונד בטני",
    category: "imaging",
    status: "ordered",
    orderedDate: "16/03/2026",
    orderedBy: "וטרינר",
    urgent: false,
    notes: "חשד לאבנים בשלפוחית",
  },
];

// ─── Context ─────────────────────────────────────────────────────────
interface LabStoreContextType {
  labOrders: LabOrder[];
  isLoading: boolean; // חדש
  error: string | null; // חדש
  addLabOrder: (order: Omit<LabOrder, "id">) => Promise<void>; // שונה ל-Promise
  updateLabOrder: (id: number, updates: Partial<LabOrder>) => Promise<void>; // שונה ל-Promise
  getLabOrdersForPatient: (patientId: number) => LabOrder[];
}

const LabStoreContext = createContext<LabStoreContextType | null>(null);

// פונקציית עזר לסימולציית רשת (תשתיות פרונטאנד אמינות)
const simulateNetwork = async (shouldFail = false) => {
  await new Promise((resolve) => setTimeout(resolve, 1200)); 
  if (shouldFail && Math.random() > 0.8) { 
    throw new Error("שגיאת תקשורת");
  }
};

export function LabStoreProvider({ children }: { children: ReactNode }) {
  const [labOrders, setLabOrders] = useState<LabOrder[]>([...initialLabOrders]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const addLabOrder = useCallback(async (order: Omit<LabOrder, "id">) => {
    setIsLoading(true);
    setError(null);
    try {
      await simulateNetwork();
      setLabOrders((prev) => {
        const newId = Math.max(...prev.map((o) => o.id), 0) + 1;
        return [{ ...order, id: newId }, ...prev];
      });
      toast.success("בדיקת המעבדה נשלחה בהצלחה");
    } catch (err) {
      console.error("Failed to add lab order:", err);
      const errorMessage = "אירעה שגיאה בשליחת בדיקת המעבדה.";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateLabOrder = useCallback(async (id: number, updates: Partial<LabOrder>) => {
    setIsLoading(true);
    setError(null);
    try {
      await simulateNetwork();
      setLabOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
      );
      toast.success("תוצאות הבדיקה עודכנו בהצלחה");
    } catch (err) {
      console.error("Failed to update lab order:", err);
      const errorMessage = "אירעה שגיאה בעדכון בדיקת המעבדה.";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLabOrdersForPatient = useCallback((patientId: number) => 
    labOrders.filter((o) => o.patientId === patientId), 
  [labOrders]);

  return (
    <LabStoreContext.Provider value={{ labOrders, isLoading, error, addLabOrder, updateLabOrder, getLabOrdersForPatient }}>
      {children}
    </LabStoreContext.Provider>
  );
}

export function useLabStore() {
  const ctx = useContext(LabStoreContext);
  if (!ctx) throw new Error("useLabStore must be used within LabStoreProvider");
  return ctx;
}