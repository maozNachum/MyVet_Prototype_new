import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner"; // ייבוא מערכת ההתראות
import { medicalHistory as initialHistory } from "./patients";
import type { MedicalVisit } from "./patients";

// ─── Types ───────────────────────────────────────────────────────────
interface MedicalStoreContextType {
  visits: MedicalVisit[];
  isLoading: boolean; // חדש: חיווי מצב טעינה
  error: string | null; // חדש: שגיאות רשת או ולידציה
  // שינינו ל-Promise כדי שה-UI (כמו כפתור השמירה) יוכל להמתין לפעולה
  addVisit: (visit: Omit<MedicalVisit, "id">) => Promise<void>; 
  getVisitsForPatient: (patientId: number) => MedicalVisit[];
}

const MedicalStoreContext = createContext<MedicalStoreContextType | null>(null);

// פונקציית עזר לסימולציית רשת
const simulateNetwork = async (shouldFail = false) => {
  await new Promise((resolve) => setTimeout(resolve, 1500)); // השהיה של שנייה וחצי
  if (shouldFail && Math.random() > 0.8) { // 20% סיכוי לנפילת רשת מדומה
    throw new Error("שגיאת רשת מדומה - השרת לא מגיב");
  }
};

// ─── Context Provider ────────────────────────────────────────────────
export function MedicalStoreProvider({ children }: { children: ReactNode }) {
  const [visits, setVisits] = useState<MedicalVisit[]>([...initialHistory]);
  
  // States חדשים לניהול המצב מול הלקוח
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // הפכנו את הפונקציה לאסינכרונית עם טיפול מלא בשגיאות
  const addVisit = useCallback(async (visit: Omit<MedicalVisit, "id">) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. סימולציית המתנה לשרת (כולל בדיקת שגיאות אקראית)
      await simulateNetwork();
      
      // 2. שמירת הנתונים בפועל
      setVisits((prev) => {
        const newId = Math.max(...prev.map((v) => v.id), 0) + 1;
        return [{ ...visit, id: newId }, ...prev];
      });

      // 3. חיווי חיובי לרופא
      toast.success("הביקור הרפואי נשמר בהצלחה בתיק המטופל");
    } catch (err) {
      console.error("Failed to add visit:", err);
      const errorMessage = "אירעה שגיאה בשמירת התיעוד הרפואי. אנא נסה שוב.";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err; // זורקים את השגיאה הלאה כדי שהטופס יידע לא להיסגר
    } finally {
      setIsLoading(false);
    }
  }, []);

  // פונקציית השליפה נשארת סינכרונית (מפלטרת את המערך המקומי)
  const getVisitsForPatient = useCallback(
    (patientId: number) => visits.filter((v) => v.patientId === patientId),
    [visits]
  );

  return (
    <MedicalStoreContext.Provider 
      value={{ 
        visits, 
        isLoading, 
        error, 
        addVisit, 
        getVisitsForPatient 
      }}
    >
      {children}
    </MedicalStoreContext.Provider>
  );
}

// ─── Custom Hook ─────────────────────────────────────────────────────
export function useMedicalStore() {
  const ctx = useContext(MedicalStoreContext);
  if (!ctx) throw new Error("useMedicalStore must be used within MedicalStoreProvider");
  return ctx;
}