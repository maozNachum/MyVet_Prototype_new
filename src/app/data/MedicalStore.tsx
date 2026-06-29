import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";

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
  visitId?: number | null;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  startDate: string;
  prescribedBy: string;
}

// ─── Context ─────────────────────────────────────────────────────────
interface MedicalStoreValue {
  visits: MedicalVisit[];
  prescriptions: Prescription[];
  isLoading: boolean;
  error: string | null;
  loadMedicalData: () => Promise<void>;
  addVisit: (visit: Omit<MedicalVisit, "id">) => Promise<MedicalVisit | null>;
  updateVisit: (id: number, updates: Partial<MedicalVisit>) => Promise<void>;
  deleteVisit: (id: number) => Promise<void>;
  addPrescription: (prescription: Omit<Prescription, "id">) => Promise<Prescription | null>;
  getVisitsForPatient: (patientId: number) => MedicalVisit[];
  getPrescriptionsForPatient: (patientId: number) => Prescription[];
}

const MedicalStoreContext = createContext<MedicalStoreValue | null>(null);

export function useMedicalStore() {
  const ctx = useContext(MedicalStoreContext);
  if (!ctx) throw new Error("useMedicalStore must be used within MedicalStoreProvider");
  return ctx;
}

function formatDateForUi(value?: string | null) {
  if (!value) return "לא ידוע";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parseDateToIso(value?: string | null) {
  if (!value) return new Date().toISOString();

  // Supports DD/MM/YYYY from the existing UI.
  const parts = value.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts.map((p) => Number(p));
    if (day && month && year) {
      const d = new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes());
      return d.toISOString();
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapVisitRow(row: any): MedicalVisit {
  return {
    id: Number(row.visit_id),
    patientId: Number(row.pet_id),
    date: formatDateForUi(row.visit_date),
    vetName: row.vet_name || "לא צוין",
    reason: row.reason || "ביקור רפואי",
    diagnosis: row.diagnosis || "לא צוין",
    treatment: row.treatment || "לא צוין",
    notes: row.notes || "",
    attachments: Number(row.attachments || 0) || 0,
  };
}

function mapPrescriptionRow(row: any): Prescription {
  return {
    id: Number(row.prescription_id),
    patientId: Number(row.pet_id),
    visitId: row.visit_id ? Number(row.visit_id) : null,
    medication: row.medication || "",
    dosage: row.dosage || "",
    frequency: row.frequency || "",
    duration: row.duration || "",
    startDate: row.start_date || "",
    prescribedBy: row.prescribed_by || "",
  };
}

export function MedicalStoreProvider({ children }: { children: ReactNode }) {
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadMedicalData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [{ data: visitRows, error: visitsError }, { data: prescriptionRows, error: prescriptionsError }] = await Promise.all([
        supabase
          .from("medical_visits")
          .select("*")
          .order("visit_date", { ascending: false }),
        supabase
          .from("prescriptions")
          .select("*")
          .order("start_date", { ascending: false }),
      ]);

      if (visitsError) throw visitsError;
      if (prescriptionsError) throw prescriptionsError;

      setVisits((visitRows || []).map(mapVisitRow));
      setPrescriptions((prescriptionRows || []).map(mapPrescriptionRow));
    } catch (err: any) {
      console.error("Failed loading medical data from Supabase", err);
      setError(err?.message || "שגיאה בטעינת נתוני תיק רפואי");
      toast.error("לא הצלחנו לטעון את ההיסטוריה הרפואית");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedicalData();
  }, [loadMedicalData]);

  const addVisit = useCallback(async (visit: Omit<MedicalVisit, "id">) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("medical_visits")
        .insert({
          appointment_id: null,
          pet_id: visit.patientId,
          visit_date: parseDateToIso(visit.date),
          vet_name: visit.vetName,
          reason: visit.reason,
          diagnosis: visit.diagnosis,
          treatment: visit.treatment,
          notes: visit.notes,
          attachments: String(visit.attachments ?? 0),
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = mapVisitRow(data);
      setVisits((prev) => [mapped, ...prev.filter((v) => v.id !== mapped.id)]);
      toast.success("הטיפול נשמר בהצלחה במסד הנתונים");
      return mapped;
    } catch (err: any) {
      console.error("Failed adding medical visit", err);
      setError(err?.message || "שגיאה בשמירת טיפול");
      toast.error("לא הצלחנו לשמור את הטיפול במסד הנתונים");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateVisit = useCallback(async (id: number, updates: Partial<MedicalVisit>) => {
    setIsLoading(true);
    setError(null);

    try {
      const patch: Record<string, any> = {};
      if (updates.patientId !== undefined) patch.pet_id = updates.patientId;
      if (updates.date !== undefined) patch.visit_date = parseDateToIso(updates.date);
      if (updates.vetName !== undefined) patch.vet_name = updates.vetName;
      if (updates.reason !== undefined) patch.reason = updates.reason;
      if (updates.diagnosis !== undefined) patch.diagnosis = updates.diagnosis;
      if (updates.treatment !== undefined) patch.treatment = updates.treatment;
      if (updates.notes !== undefined) patch.notes = updates.notes;
      if (updates.attachments !== undefined) patch.attachments = String(updates.attachments ?? 0);

      const { data, error: updateError } = await supabase
        .from("medical_visits")
        .update(patch)
        .eq("visit_id", id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      const mapped = mapVisitRow(data);
      setVisits((prev) => prev.map((v) => (v.id === id ? mapped : v)));
      toast.success("הטיפול עודכן בהצלחה");
    } catch (err: any) {
      console.error("Failed updating medical visit", err);
      setError(err?.message || "שגיאה בעדכון טיפול");
      toast.error("לא הצלחנו לעדכן את הטיפול");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteVisit = useCallback(async (id: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("medical_visits")
        .delete()
        .eq("visit_id", id);

      if (deleteError) throw deleteError;

      setVisits((prev) => prev.filter((v) => v.id !== id));
      setPrescriptions((prev) => prev.filter((p) => p.visitId !== id));
      toast.success("הביקור נמחק מהתיק הרפואי");
    } catch (err: any) {
      console.error("Failed deleting medical visit", err);
      setError(err?.message || "שגיאה במחיקת ביקור");
      toast.error("לא הצלחנו למחוק את הביקור");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addPrescription = useCallback(async (prescription: Omit<Prescription, "id">) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("prescriptions")
        .insert({
          visit_id: prescription.visitId || null,
          pet_id: prescription.patientId,
          medication: prescription.medication,
          dosage: prescription.dosage,
          frequency: prescription.frequency,
          duration: prescription.duration,
          start_date: prescription.startDate || new Date().toISOString().slice(0, 10),
          // The database column is uuid. Until staff auth is connected to staff.staff_id,
          // keep this null instead of sending a doctor name string.
          prescribed_by: null,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = mapPrescriptionRow(data);
      setPrescriptions((prev) => [mapped, ...prev.filter((p) => p.id !== mapped.id)]);
      return mapped;
    } catch (err: any) {
      console.error("Failed adding prescription", err);
      setError(err?.message || "שגיאה בשמירת מרשם");
      toast.error("לא הצלחנו לשמור מרשם במסד הנתונים");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getVisitsForPatient = useCallback((patientId: number) => {
    return visits.filter((visit) => visit.patientId === patientId);
  }, [visits]);

  const getPrescriptionsForPatient = useCallback((patientId: number) => {
    return prescriptions.filter((prescription) => prescription.patientId === patientId);
  }, [prescriptions]);

  return (
    <MedicalStoreContext.Provider
      value={{
        visits,
        prescriptions,
        isLoading,
        error,
        loadMedicalData,
        addVisit,
        updateVisit,
        deleteVisit,
        addPrescription,
        getVisitsForPatient,
        getPrescriptionsForPatient,
      }}
    >
      {children}
    </MedicalStoreContext.Provider>
  );
}
