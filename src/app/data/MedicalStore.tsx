import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";

// ─── Types ───────────────────────────────────────────────────────────
export type UrgencyLevel = "normal" | "serious" | "critical";
export type MedicalProblemStatus = "active" | "improved" | "resolved";
export type DifferentialLikelihood = "low" | "possible" | "likely";

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

  // New clinical structure from the veterinarian feedback
  visitType?: string;
  urgencyLevel?: UrgencyLevel;
  chiefComplaint?: string;
  finalDiagnosis?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
}

export interface PhysicalExam {
  id: number;
  visitId?: number | null;
  patientId: number;
  examDate: string;
  findings: string;
}

export interface MedicalProblem {
  id: number;
  visitId?: number | null;
  patientId: number;
  problemText: string;
  severity: UrgencyLevel;
  status: MedicalProblemStatus;
  notes?: string;
}

export interface DifferentialDiagnosis {
  id: number;
  visitId?: number | null;
  patientId: number;
  diagnosisText: string;
  likelihood: DifferentialLikelihood;
  notes?: string;
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
  physicalExams: PhysicalExam[];
  medicalProblems: MedicalProblem[];
  differentialDiagnoses: DifferentialDiagnosis[];
  isLoading: boolean;
  error: string | null;
  loadMedicalData: () => Promise<void>;
  addVisit: (visit: Omit<MedicalVisit, "id">) => Promise<MedicalVisit | null>;
  updateVisit: (id: number, updates: Partial<MedicalVisit>) => Promise<void>;
  deleteVisit: (id: number) => Promise<void>;
  addPrescription: (prescription: Omit<Prescription, "id">) => Promise<Prescription | null>;
  addPhysicalExam: (exam: Omit<PhysicalExam, "id">) => Promise<PhysicalExam | null>;
  addMedicalProblem: (problem: Omit<MedicalProblem, "id">) => Promise<MedicalProblem | null>;
  addDifferentialDiagnosis: (diagnosis: Omit<DifferentialDiagnosis, "id">) => Promise<DifferentialDiagnosis | null>;
  getVisitsForPatient: (patientId: number) => MedicalVisit[];
  getPrescriptionsForPatient: (patientId: number) => Prescription[];
  getPhysicalExamsForPatient: (patientId: number) => PhysicalExam[];
  getMedicalProblemsForPatient: (patientId: number) => MedicalProblem[];
  getDifferentialDiagnosesForPatient: (patientId: number) => DifferentialDiagnosis[];
  getPhysicalExamsForVisit: (visitId: number) => PhysicalExam[];
  getMedicalProblemsForVisit: (visitId: number) => MedicalProblem[];
  getDifferentialDiagnosesForVisit: (visitId: number) => DifferentialDiagnosis[];
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

function normalizeUrgency(value?: string | null): UrgencyLevel {
  if (value === "serious" || value === "critical" || value === "normal") return value;
  return "normal";
}

function normalizeProblemStatus(value?: string | null): MedicalProblemStatus {
  if (value === "active" || value === "improved" || value === "resolved") return value;
  return "active";
}

function normalizeLikelihood(value?: string | null): DifferentialLikelihood {
  if (value === "low" || value === "possible" || value === "likely") return value;
  return "possible";
}

function mapVisitRow(row: any): MedicalVisit {
  const finalDiagnosis = row.final_diagnosis || row.diagnosis || "";
  return {
    id: Number(row.visit_id),
    patientId: Number(row.pet_id),
    date: formatDateForUi(row.visit_date),
    vetName: row.vet_name || "לא צוין",
    reason: row.chief_complaint || row.reason || "ביקור רפואי",
    diagnosis: finalDiagnosis || "לא צוין",
    treatment: row.treatment || "לא צוין",
    notes: row.notes || "",
    attachments: Number(row.attachments || 0) || 0,
    visitType: row.visit_type || undefined,
    urgencyLevel: normalizeUrgency(row.urgency_level),
    chiefComplaint: row.chief_complaint || row.reason || "",
    finalDiagnosis,
    followUpRequired: Boolean(row.follow_up_required),
    followUpNotes: row.follow_up_notes || "",
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

function mapPhysicalExamRow(row: any): PhysicalExam {
  return {
    id: Number(row.physical_exam_id),
    visitId: row.visit_id ? Number(row.visit_id) : null,
    patientId: Number(row.pet_id),
    examDate: formatDateForUi(row.exam_date),
    findings: row.findings || "",
  };
}

function mapMedicalProblemRow(row: any): MedicalProblem {
  return {
    id: Number(row.problem_id),
    visitId: row.visit_id ? Number(row.visit_id) : null,
    patientId: Number(row.pet_id),
    problemText: row.problem_text || "",
    severity: normalizeUrgency(row.severity),
    status: normalizeProblemStatus(row.status),
    notes: row.notes || "",
  };
}

function mapDifferentialDiagnosisRow(row: any): DifferentialDiagnosis {
  return {
    id: Number(row.diagnosis_id),
    visitId: row.visit_id ? Number(row.visit_id) : null,
    patientId: Number(row.pet_id),
    diagnosisText: row.diagnosis_text || "",
    likelihood: normalizeLikelihood(row.likelihood),
    notes: row.notes || "",
  };
}

export function MedicalStoreProvider({ children }: { children: ReactNode }) {
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [physicalExams, setPhysicalExams] = useState<PhysicalExam[]>([]);
  const [medicalProblems, setMedicalProblems] = useState<MedicalProblem[]>([]);
  const [differentialDiagnoses, setDifferentialDiagnoses] = useState<DifferentialDiagnosis[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadMedicalData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [
        { data: visitRows, error: visitsError },
        { data: prescriptionRows, error: prescriptionsError },
        { data: examRows, error: examsError },
        { data: problemRows, error: problemsError },
        { data: diagnosisRows, error: diagnosesError },
      ] = await Promise.all([
        supabase.from("medical_visits").select("*").order("visit_date", { ascending: false }),
        supabase.from("prescriptions").select("*").order("start_date", { ascending: false }),
        supabase.from("physical_exams").select("*").order("exam_date", { ascending: false }),
        supabase.from("medical_problems").select("*").order("created_at", { ascending: true }),
        supabase.from("differential_diagnoses").select("*").order("created_at", { ascending: true }),
      ]);

      if (visitsError) throw visitsError;
      if (prescriptionsError) throw prescriptionsError;
      if (examsError) throw examsError;
      if (problemsError) throw problemsError;
      if (diagnosesError) throw diagnosesError;

      setVisits((visitRows || []).map(mapVisitRow));
      setPrescriptions((prescriptionRows || []).map(mapPrescriptionRow));
      setPhysicalExams((examRows || []).map(mapPhysicalExamRow));
      setMedicalProblems((problemRows || []).map(mapMedicalProblemRow));
      setDifferentialDiagnoses((diagnosisRows || []).map(mapDifferentialDiagnosisRow));
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
      const chiefComplaint = visit.chiefComplaint || visit.reason || "ביקור רפואי";
      const finalDiagnosis = visit.finalDiagnosis || visit.diagnosis || "";

      const { data, error: insertError } = await supabase
        .from("medical_visits")
        .insert({
          appointment_id: null,
          pet_id: visit.patientId,
          visit_date: parseDateToIso(visit.date),
          vet_name: visit.vetName,
          reason: chiefComplaint,
          diagnosis: finalDiagnosis,
          treatment: visit.treatment,
          notes: visit.notes,
          attachments: String(visit.attachments ?? 0),
          visit_type: visit.visitType || null,
          urgency_level: visit.urgencyLevel || "normal",
          chief_complaint: chiefComplaint,
          final_diagnosis: finalDiagnosis || null,
          follow_up_required: Boolean(visit.followUpRequired),
          follow_up_notes: visit.followUpNotes || null,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = mapVisitRow(data);
      setVisits((prev) => [mapped, ...prev.filter((v) => v.id !== mapped.id)]);
      toast.success("הביקור הרפואי נשמר בהצלחה");
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
      if (updates.visitType !== undefined) patch.visit_type = updates.visitType || null;
      if (updates.urgencyLevel !== undefined) patch.urgency_level = updates.urgencyLevel || "normal";
      if (updates.chiefComplaint !== undefined) patch.chief_complaint = updates.chiefComplaint || null;
      if (updates.finalDiagnosis !== undefined) patch.final_diagnosis = updates.finalDiagnosis || null;
      if (updates.followUpRequired !== undefined) patch.follow_up_required = Boolean(updates.followUpRequired);
      if (updates.followUpNotes !== undefined) patch.follow_up_notes = updates.followUpNotes || null;

      const { data, error: updateError } = await supabase
        .from("medical_visits")
        .update(patch)
        .eq("visit_id", id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      const mapped = mapVisitRow(data);
      setVisits((prev) => prev.map((v) => (v.id === id ? mapped : v)));
      toast.success("הביקור עודכן בהצלחה");
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
      const { error: deleteError } = await supabase.from("medical_visits").delete().eq("visit_id", id);
      if (deleteError) throw deleteError;

      setVisits((prev) => prev.filter((v) => v.id !== id));
      setPrescriptions((prev) => prev.filter((p) => p.visitId !== id));
      setPhysicalExams((prev) => prev.filter((e) => e.visitId !== id));
      setMedicalProblems((prev) => prev.filter((p) => p.visitId !== id));
      setDifferentialDiagnoses((prev) => prev.filter((d) => d.visitId !== id));
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

  const addPhysicalExam = useCallback(async (exam: Omit<PhysicalExam, "id">) => {
    try {
      const { data, error: insertError } = await supabase
        .from("physical_exams")
        .insert({
          visit_id: exam.visitId || null,
          pet_id: exam.patientId,
          exam_date: parseDateToIso(exam.examDate),
          findings: exam.findings,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = mapPhysicalExamRow(data);
      setPhysicalExams((prev) => [mapped, ...prev.filter((e) => e.id !== mapped.id)]);
      return mapped;
    } catch (err: any) {
      console.error("Failed adding physical exam", err);
      toast.error("לא הצלחנו לשמור בדיקה גופנית");
      return null;
    }
  }, []);

  const addMedicalProblem = useCallback(async (problem: Omit<MedicalProblem, "id">) => {
    try {
      const { data, error: insertError } = await supabase
        .from("medical_problems")
        .insert({
          visit_id: problem.visitId || null,
          pet_id: problem.patientId,
          problem_text: problem.problemText,
          severity: problem.severity || "normal",
          status: problem.status || "active",
          notes: problem.notes || null,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = mapMedicalProblemRow(data);
      setMedicalProblems((prev) => [...prev.filter((p) => p.id !== mapped.id), mapped]);
      return mapped;
    } catch (err: any) {
      console.error("Failed adding medical problem", err);
      toast.error("לא הצלחנו לשמור בעיה רפואית");
      return null;
    }
  }, []);

  const addDifferentialDiagnosis = useCallback(async (diagnosis: Omit<DifferentialDiagnosis, "id">) => {
    try {
      const { data, error: insertError } = await supabase
        .from("differential_diagnoses")
        .insert({
          visit_id: diagnosis.visitId || null,
          pet_id: diagnosis.patientId,
          diagnosis_text: diagnosis.diagnosisText,
          likelihood: diagnosis.likelihood || "possible",
          notes: diagnosis.notes || null,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = mapDifferentialDiagnosisRow(data);
      setDifferentialDiagnoses((prev) => [...prev.filter((d) => d.id !== mapped.id), mapped]);
      return mapped;
    } catch (err: any) {
      console.error("Failed adding differential diagnosis", err);
      toast.error("לא הצלחנו לשמור אבחנה מבדלת");
      return null;
    }
  }, []);

  const getVisitsForPatient = useCallback((patientId: number) => visits.filter((visit) => visit.patientId === patientId), [visits]);
  const getPrescriptionsForPatient = useCallback((patientId: number) => prescriptions.filter((p) => p.patientId === patientId), [prescriptions]);
  const getPhysicalExamsForPatient = useCallback((patientId: number) => physicalExams.filter((e) => e.patientId === patientId), [physicalExams]);
  const getMedicalProblemsForPatient = useCallback((patientId: number) => medicalProblems.filter((p) => p.patientId === patientId), [medicalProblems]);
  const getDifferentialDiagnosesForPatient = useCallback((patientId: number) => differentialDiagnoses.filter((d) => d.patientId === patientId), [differentialDiagnoses]);
  const getPhysicalExamsForVisit = useCallback((visitId: number) => physicalExams.filter((e) => e.visitId === visitId), [physicalExams]);
  const getMedicalProblemsForVisit = useCallback((visitId: number) => medicalProblems.filter((p) => p.visitId === visitId), [medicalProblems]);
  const getDifferentialDiagnosesForVisit = useCallback((visitId: number) => differentialDiagnoses.filter((d) => d.visitId === visitId), [differentialDiagnoses]);

  return (
    <MedicalStoreContext.Provider
      value={{
        visits,
        prescriptions,
        physicalExams,
        medicalProblems,
        differentialDiagnoses,
        isLoading,
        error,
        loadMedicalData,
        addVisit,
        updateVisit,
        deleteVisit,
        addPrescription,
        addPhysicalExam,
        addMedicalProblem,
        addDifferentialDiagnosis,
        getVisitsForPatient,
        getPrescriptionsForPatient,
        getPhysicalExamsForPatient,
        getMedicalProblemsForPatient,
        getDifferentialDiagnosesForPatient,
        getPhysicalExamsForVisit,
        getMedicalProblemsForVisit,
        getDifferentialDiagnosesForVisit,
      }}
    >
      {children}
    </MedicalStoreContext.Provider>
  );
}
