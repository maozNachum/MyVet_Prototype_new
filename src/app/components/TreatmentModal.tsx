import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  X,
  Stethoscope,
  Plus,
  Trash2,
  Pill,
  TestTube,
  ClipboardList,
  MessageSquare,
  Save,
  Dog,
  Cat,
  Loader2,
  FileText,
  Syringe,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMedicalStore,
  type UrgencyLevel,
  type MedicalProblemStatus,
  type DifferentialLikelihood,
} from "../data/MedicalStore";
import { useLabStore } from "../data/LabStore";
import { getStaffName } from "../data/staffAuth";
import { saveMedicalEntryAtomic } from "../../services/medicalVisitMutations";
import { VisitPostSaveActionsModal } from "./VisitPostSaveActionsModal";

const VACCINATIONS_CHANGED_EVENT = "myvet:vaccinations-changed";

interface TreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  petName: string;
  petSpecies: "dog" | "cat" | string;
  ownerName: string;
  ownerId?: string;
  patientId?: number;
  appointmentId?: number;
  onSave?: (data: any) => void;
}

type EntryType =
  | "full_exam"
  | "vaccination"
  | "weight_check"
  | "prescription_only"
  | "lab"
  | "follow_up"
  | "note";

type MedicalProblemDraft = {
  problemText: string;
  severity: UrgencyLevel;
  status: MedicalProblemStatus;
  notes: string;
};

type PrescriptionDraft = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
};

type LabDraft = {
  testName: string;
  category: "blood" | "urine" | "imaging" | "biopsy" | "other";
  testDate: string;
  urgent: boolean;
  notes: string;
};

type DifferentialDraft = {
  diagnosisText: string;
  likelihood: DifferentialLikelihood;
  notes: string;
};

type ValidationErrors = Record<string, string>;

type EntryData = {
  entryType: EntryType;
  label: string;
  visitDate: string;
  vaccineName?: string;
  nextDueDate?: string;
  weight?: number;
  chiefComplaint?: string;
  freeText?: string;
  treatmentText?: string;
  notes?: string;
  followUpRequired?: boolean;
  followUpNotes?: string;
  prescriptions?: PrescriptionDraft[];
  labs?: LabDraft[];
  problems?: MedicalProblemDraft[];
  differentials?: DifferentialDraft[];
  physicalExamFindings?: string;
};

const entryTypes: {
  id: EntryType;
  label: string;
  shortLabel: string;
  description: string;
  icon: any;
  className: string;
}[] = [
  {
    id: "full_exam",
    label: "בדיקה רפואית מלאה",
    shortLabel: "בדיקה מלאה",
    description: "תלונה, בדיקה גופנית, טיפול, אבחנות ומרשמים",
    icon: Stethoscope,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "vaccination",
    label: "חיסון",
    shortLabel: "חיסון",
    description: "תיעוד חיסון קצר בלי תהליך מלא",
    icon: Syringe,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "weight_check",
    label: "שקילה",
    shortLabel: "שקילה",
    description: "עדכון משקל והערה קצרה",
    icon: Scale,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    id: "prescription_only",
    label: "מרשם בלבד",
    shortLabel: "מרשם",
    description: "הפקת מרשם בלי ביקור מלא",
    icon: Pill,
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    id: "lab",
    label: "בדיקת מעבדה",
    shortLabel: "מעבדה",
    description: "הזמנת בדיקה ותיעוד בתיק הרפואי",
    icon: TestTube,
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  {
    id: "follow_up",
    label: "מעקב קצר",
    shortLabel: "מעקב",
    description: "סטטוס קצר, הנחיות או ביקורת",
    icon: ClipboardList,
    className: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    id: "note",
    label: "הערה רפואית",
    shortLabel: "הערה",
    description: "תיעוד חופשי קצר בתיק החיה",
    icon: MessageSquare,
    className: "bg-gray-50 text-gray-700 border-gray-200",
  },
];

const severityOptions: { value: UrgencyLevel; label: string; className: string }[] = [
  { value: "normal", label: "רגיל", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "serious", label: "חמור", className: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "critical", label: "קריטי", className: "bg-red-50 text-red-700 border-red-200" },
];

const problemStatusOptions: { value: MedicalProblemStatus; label: string }[] = [
  { value: "active", label: "פעיל" },
  { value: "improved", label: "השתפר" },
  { value: "resolved", label: "נפתר" },
];

const likelihoodOptions: { value: DifferentialLikelihood; label: string }[] = [
  { value: "low", label: "סבירות נמוכה" },
  { value: "possible", label: "אפשרית" },
  { value: "likely", label: "סבירה" },
];

const labCategories: { value: LabDraft["category"]; label: string }[] = [
  { value: "blood", label: "בדיקת דם" },
  { value: "urine", label: "בדיקת שתן" },
  { value: "imaging", label: "הדמיה" },
  { value: "biopsy", label: "ביופסיה" },
  { value: "other", label: "אחר" },
];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputToUiDate(value: string) {
  if (!value) return new Date().toLocaleDateString("he-IL");
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return new Date().toLocaleDateString("he-IL");
  return `${day}/${month}/${year}`;
}

function nonEmpty(value?: string | null) {
  return (value || "").trim().length > 0;
}

function numericValue(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getEntryTypeConfig(entryType: EntryType) {
  return entryTypes.find((item) => item.id === entryType) || entryTypes[0];
}

function scrollToFirstError(errors: ValidationErrors) {
  const firstField = Object.keys(errors)[0];
  if (!firstField) return;

  window.setTimeout(() => {
    const element = document.querySelector(`[data-field="${firstField}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = element?.querySelector("input, textarea, select, button") as HTMLElement | null;
    input?.focus?.();
  }, 50);
}

export function TreatmentModal({
  isOpen,
  onClose,
  petName,
  petSpecies,
  ownerName,
  ownerId,
  patientId,
  appointmentId,
  onSave,
}: TreatmentModalProps) {
  const {
    loadMedicalData,
  } = useMedicalStore();
  const { loadLabOrders } = useLabStore();
  const currentVet = getStaffName();
  const submissionIdRef = useRef(crypto.randomUUID());

  const [entryType, setEntryType] = useState<EntryType>("full_exam");
  const [visitDate, setVisitDate] = useState(todayInputValue());
  const [isSaved, setIsSaved] = useState(false);
  const [savedVisitContext, setSavedVisitContext] = useState<null | {
    visitId: number;
    entryType: EntryType;
    entryLabel: string;
    visitDate: string;
    ownerSummaryDraft: string;
    prescriptions: PrescriptionDraft[];
    labs: LabDraft[];
  }>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>("normal");
  const [freeVisitText, setFreeVisitText] = useState("");
  const [physicalExamFindings, setPhysicalExamFindings] = useState("");
  const [treatmentText, setTreatmentText] = useState("");
  const [notes, setNotes] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");

  const [vaccineName, setVaccineName] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [weight, setWeight] = useState("");

  const [problems, setProblems] = useState<MedicalProblemDraft[]>([
    { problemText: "", severity: "normal", status: "active", notes: "" },
  ]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([
    { medication: "", dosage: "", frequency: "", duration: "" },
  ]);
  const [labs, setLabs] = useState<LabDraft[]>([
    { testName: "", category: "blood", testDate: todayInputValue(), urgent: false, notes: "" },
  ]);
  const [differentials, setDifferentials] = useState<DifferentialDraft[]>([
    { diagnosisText: "", likelihood: "possible", notes: "" },
  ]);


  const PetIcon = petSpecies === "cat" ? Cat : Dog;
  const entryConfig = getEntryTypeConfig(entryType);

  useEffect(() => {
    if (!isOpen) return;
    setEntryType("full_exam");
    setVisitDate(todayInputValue());
    setIsSaved(false);
    setSavedVisitContext(null);
    setIsSubmitting(false);
    setErrors({});
    setChiefComplaint("");
    setUrgencyLevel("normal");
    setFreeVisitText("");
    setPhysicalExamFindings("");
    setTreatmentText("");
    setNotes("");
    setFinalDiagnosis("");
    setFollowUpRequired(false);
    setFollowUpNotes("");
    setVaccineName("");
    setNextDueDate("");
    setWeight("");
    setProblems([{ problemText: "", severity: "normal", status: "active", notes: "" }]);
    setPrescriptions([{ medication: "", dosage: "", frequency: "", duration: "" }]);
    setLabs([{ testName: "", category: "blood", testDate: todayInputValue(), urgent: false, notes: "" }]);
    setDifferentials([{ diagnosisText: "", likelihood: "possible", notes: "" }]);
    submissionIdRef.current = crypto.randomUUID();
  }, [isOpen]);

  useEffect(() => {
    setErrors({});
  }, [entryType]);

  const cleanProblems = useMemo(() => problems.filter((p) => nonEmpty(p.problemText)), [problems]);
  const cleanPrescriptions = useMemo(() => prescriptions.filter((p) => nonEmpty(p.medication)), [prescriptions]);
  const cleanLabs = useMemo(() => labs.filter((l) => nonEmpty(l.testName)), [labs]);
  const cleanDifferentials = useMemo(() => differentials.filter((d) => nonEmpty(d.diagnosisText)), [differentials]);

  const buildOwnerSummaryDraft = () => {
    const lines: string[] = [];

    if (entryType === "vaccination") {
      if (nonEmpty(vaccineName)) lines.push(`בוצע חיסון: ${vaccineName.trim()}.`);
      if (nonEmpty(nextDueDate)) lines.push(`מועד מומלץ לחיסון הבא: ${dateInputToUiDate(nextDueDate)}.`);
    } else if (entryType === "weight_check") {
      if (nonEmpty(weight)) lines.push(`נמדד משקל: ${weight.trim()} ק״ג.`);
    } else if (entryType === "prescription_only") {
      lines.push("הופק מרשם לפי הנחיית הצוות הרפואי.");
    } else if (entryType === "lab") {
      lines.push("נפתחה בקשה לבדיקת מעבדה.");
    } else if (entryType === "follow_up") {
      lines.push("בוצע מעקב רפואי קצר.");
    } else if (entryType === "note") {
      lines.push("נוספה הערה רפואית לתיק.");
    } else {
      if (nonEmpty(chiefComplaint)) lines.push(`סיבת הביקור: ${chiefComplaint.trim()}.`);
      if (nonEmpty(treatmentText)) lines.push(`טיפול והנחיות: ${treatmentText.trim()}`);
      if (nonEmpty(finalDiagnosis)) lines.push(`סיכום רפואי: ${finalDiagnosis.trim()}`);
    }

    if (cleanPrescriptions.length > 0) {
      lines.push(`מרשמים: ${cleanPrescriptions.map((p) => [p.medication, p.dosage, p.frequency, p.duration].filter(nonEmpty).join(" · ")).join("; ")}.`);
    }

    if (cleanLabs.length > 0) {
      lines.push(`בדיקות מעבדה: ${cleanLabs.map((lab) => lab.testName.trim()).join(", ")}.`);
    }

    if (followUpRequired) {
      lines.push(`מעקב: ${followUpNotes.trim() || "נדרש מעקב בהתאם להנחיית הצוות."}`);
    }

    if (nonEmpty(notes)) lines.push(notes.trim());

    return lines.filter(nonEmpty).join("\n\n") || `בוצעה ${entryConfig.label} ל${petName}.`;
  };

  if (!isOpen) return null;

  const setFieldValue = (setter: (value: string) => void, field: string, value: string) => {
    setter(value);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const getFieldClass = (field: string, base = "") =>
    `${base} ${errors[field] ? "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20" : "border-gray-300 focus:border-blue-500 focus:ring-blue-500/20"}`;

  const validate = (): ValidationErrors => {
    const nextErrors: ValidationErrors = {};

    if (!patientId) nextErrors.patient = "חסר מזהה מטופל. אי אפשר לשמור רשומה רפואית.";
    if (!visitDate) nextErrors.visitDate = "חובה לבחור תאריך.";

    if (entryType === "full_exam") {
      if (!nonEmpty(chiefComplaint) && !nonEmpty(freeVisitText)) {
        nextErrors.chiefComplaint = "חובה להזין סיבת ביקור או תיאור חופשי.";
      }
      if (cleanProblems.length === 0 && !nonEmpty(physicalExamFindings) && !nonEmpty(treatmentText)) {
        nextErrors.fullExamContent = "בבדיקה מלאה יש להזין לפחות בעיה, בדיקה גופנית או טיפול.";
      }
    }

    if (entryType === "vaccination") {
      if (!nonEmpty(vaccineName)) nextErrors.vaccineName = "חובה להזין את שם החיסון.";
    }

    if (entryType === "weight_check") {
      const parsedWeight = numericValue(weight);
      if (!nonEmpty(weight)) nextErrors.weight = "חובה להזין משקל.";
      else if (Number.isNaN(parsedWeight) || parsedWeight <= 0) nextErrors.weight = "משקל חייב להיות מספר חיובי.";
      else if (parsedWeight > 500) nextErrors.weight = "המשקל חייב להיות עד 500 ק״ג.";
    }

    const startedPrescriptions = prescriptions.filter((prescription) => (
      [prescription.medication, prescription.dosage, prescription.frequency, prescription.duration].some(nonEmpty)
    ));
    const incompletePrescription = startedPrescriptions.find((prescription) => (
      ![prescription.medication, prescription.dosage, prescription.frequency, prescription.duration].every(nonEmpty)
    ));
    const oversizedPrescription = startedPrescriptions.find((prescription) => (
      [prescription.medication, prescription.dosage, prescription.frequency, prescription.duration]
        .some((value) => value.trim().length > 500)
    ));

    if (entryType === "prescription_only" && startedPrescriptions.length === 0) {
      nextErrors.prescriptions = "חובה להזין לפחות תרופה אחת.";
    } else if (incompletePrescription) {
      nextErrors.prescriptions = "יש להשלים שם תרופה, מינון, תדירות ומשך טיפול בכל מרשם שהתחלתם למלא.";
    } else if (oversizedPrescription) {
      nextErrors.prescriptions = "אחד משדות המרשם ארוך מדי. יש לקצר אותו עד 500 תווים.";
    }

    if (entryType === "lab") {
      if (cleanLabs.length === 0) nextErrors.labs = "חובה להזין לפחות בדיקת מעבדה אחת.";
    }

    if (entryType === "follow_up") {
      if (!nonEmpty(chiefComplaint) && !nonEmpty(notes) && !nonEmpty(followUpNotes)) {
        nextErrors.chiefComplaint = "חובה להזין סיבת מעקב, הערה או הנחיית המשך.";
      }
    }

    if (entryType === "note") {
      if (!nonEmpty(notes) && !nonEmpty(freeVisitText)) {
        nextErrors.notes = "חובה להזין את ההערה הרפואית.";
      }
    }

    const payload = buildVisitPayload();
    if (payload.reason.length > 2000) {
      nextErrors.chiefComplaint = "סיבת הביקור ארוכה מדי. יש לקצר אותה עד 2,000 תווים.";
    }
    if (payload.treatment.length > 10000) {
      nextErrors.form = "פרטי הטיפול ארוכים מדי. יש לקצר אותם לפני השמירה.";
    }
    if (payload.notes.length > 10000) {
      nextErrors.notes = "הסיכום וההערות ארוכים מדי. יש לקצר אותם עד 10,000 תווים.";
    }
    if (payload.diagnosis.length > 4000) {
      nextErrors.form = "פרטי האבחנה ארוכים מדי. יש לקצר אותם עד 4,000 תווים.";
    }
    if (payload.followUpNotes.length > 4000) {
      nextErrors.notes = "הנחיות המעקב ארוכות מדי. יש לקצר אותן עד 4,000 תווים.";
    }
    if (vaccineName.trim().length > 250) {
      nextErrors.vaccineName = "שם החיסון ארוך מדי. יש לקצר אותו עד 250 תווים.";
    }
    if (physicalExamFindings.trim().length > 10000
        || cleanProblems.some((problem) => problem.problemText.trim().length > 2000 || problem.notes.trim().length > 4000)
        || cleanDifferentials.some((diagnosis) => diagnosis.diagnosisText.trim().length > 2000 || diagnosis.notes.trim().length > 4000)) {
      nextErrors.fullExamContent = "אחד מפרטי הבדיקה ארוך מדי. יש לקצר את הטקסט לפני השמירה.";
    }
    if (cleanLabs.some((lab) => lab.testName.trim().length > 500 || lab.notes.trim().length > 4000)) {
      nextErrors.labs = "אחד מפרטי בדיקות המעבדה ארוך מדי. יש לקצר את הטקסט לפני השמירה.";
    }


    return nextErrors;
  };

  const addProblemRow = () => setProblems((prev) => [...prev, { problemText: "", severity: "normal", status: "active", notes: "" }]);
  const addPrescriptionRow = () => setPrescriptions((prev) => [...prev, { medication: "", dosage: "", frequency: "", duration: "" }]);
  const addLabRow = () => setLabs((prev) => [...prev, { testName: "", category: "blood", testDate: todayInputValue(), urgent: false, notes: "" }]);
  const addDifferentialRow = () => setDifferentials((prev) => [...prev, { diagnosisText: "", likelihood: "possible", notes: "" }]);

  const buildEntryData = (): EntryData => {
    const base: EntryData = {
      entryType,
      label: entryConfig.label,
      visitDate,
      chiefComplaint: chiefComplaint.trim() || undefined,
      freeText: freeVisitText.trim() || undefined,
      treatmentText: treatmentText.trim() || undefined,
      notes: notes.trim() || undefined,
      followUpRequired,
      followUpNotes: followUpNotes.trim() || undefined,
    };

    if (entryType === "vaccination") {
      return {
        ...base,
        vaccineName: vaccineName.trim(),
        nextDueDate: nextDueDate || undefined,
      };
    }

    if (entryType === "weight_check") {
      return {
        ...base,
        weight: numericValue(weight),
      };
    }

    if (entryType === "prescription_only") {
      return {
        ...base,
        prescriptions: cleanPrescriptions,
      };
    }

    if (entryType === "lab") {
      return {
        ...base,
        labs: cleanLabs,
      };
    }

    if (entryType === "full_exam") {
      return {
        ...base,
        problems: cleanProblems,
        physicalExamFindings: physicalExamFindings.trim() || undefined,
        differentials: cleanDifferentials,
        prescriptions: cleanPrescriptions,
        labs: cleanLabs,
      };
    }

    return base;
  };

  const buildVisitPayload = () => {
    const label = entryConfig.label;
    const prescriptionText = cleanPrescriptions.map((p) => `${p.medication} ${p.dosage}`.trim()).join(", ");
    const labText = cleanLabs.map((l) => l.testName).join(", ");
    const problemsText = cleanProblems.map((p) => p.problemText).join(", ");
    const differentialsText = cleanDifferentials.map((d) => d.diagnosisText).join(", ");

    if (entryType === "vaccination") {
      return {
        reason: `חיסון${vaccineName ? `: ${vaccineName}` : ""}`,
        treatment: [`בוצע חיסון: ${vaccineName}`, nextDueDate ? `תאריך חיסון הבא: ${nextDueDate}` : ""].filter(Boolean).join("\n"),
        notes: notes.trim(),
        diagnosis: "",
        finalDiagnosis: "",
        followUpRequired: Boolean(nextDueDate || followUpRequired),
        followUpNotes: nextDueDate ? `חיסון הבא בתאריך ${nextDueDate}` : followUpNotes,
      };
    }

    if (entryType === "weight_check") {
      return {
        reason: `שקילה${weight ? `: ${weight} ק״ג` : ""}`,
        treatment: `נמדד משקל: ${weight} ק״ג`,
        notes: notes.trim(),
        diagnosis: "",
        finalDiagnosis: "",
        followUpRequired,
        followUpNotes,
      };
    }

    if (entryType === "prescription_only") {
      return {
        reason: chiefComplaint.trim() || "מרשם בלבד",
        treatment: prescriptionText ? `מרשמים: ${prescriptionText}` : "מרשם בלבד",
        notes: notes.trim(),
        diagnosis: "",
        finalDiagnosis: "",
        followUpRequired,
        followUpNotes,
      };
    }

    if (entryType === "lab") {
      return {
        reason: chiefComplaint.trim() || "בדיקת מעבדה",
        treatment: labText ? `נשלחו בדיקות מעבדה: ${labText}` : "נשלחה בדיקת מעבדה",
        notes: notes.trim(),
        diagnosis: "",
        finalDiagnosis: "",
        followUpRequired,
        followUpNotes,
      };
    }

    if (entryType === "follow_up") {
      return {
        reason: chiefComplaint.trim() || "מעקב קצר",
        treatment: treatmentText.trim() || followUpNotes.trim() || "תועד מעקב קצר",
        notes: [notes, freeVisitText].filter(nonEmpty).join("\n\n"),
        diagnosis: finalDiagnosis.trim(),
        finalDiagnosis: finalDiagnosis.trim(),
        followUpRequired,
        followUpNotes,
      };
    }

    if (entryType === "note") {
      return {
        reason: chiefComplaint.trim() || "הערה רפואית",
        treatment: "הערה רפואית בתיק",
        notes: [freeVisitText, notes].filter(nonEmpty).join("\n\n"),
        diagnosis: "",
        finalDiagnosis: "",
        followUpRequired,
        followUpNotes,
      };
    }

    const combinedReason = [chiefComplaint, freeVisitText].filter(nonEmpty).join(" — ") || label;
    const combinedNotes = [
      notes,
      cleanProblems.length ? `בעיות רפואיות: ${problemsText}` : "",
      nonEmpty(physicalExamFindings) ? `בדיקה גופנית: ${physicalExamFindings}` : "",
      cleanDifferentials.length ? `אבחנות מבדלות: ${differentialsText}` : "",
      followUpRequired ? `מעקב נדרש: ${followUpNotes || "כן"}` : "",
    ].filter(nonEmpty).join("\n\n");

    const treatmentSummary = [
      treatmentText,
      prescriptionText ? `מרשמים: ${prescriptionText}` : "",
      labText ? `בדיקות מעבדה: ${labText}` : "",
    ].filter(nonEmpty).join("\n");

    return {
      reason: combinedReason,
      treatment: treatmentSummary || "לא צוין",
      notes: combinedNotes,
      diagnosis: finalDiagnosis || (cleanDifferentials[0]?.diagnosisText ?? ""),
      finalDiagnosis: finalDiagnosis || "",
      followUpRequired,
      followUpNotes,
    };
  };

  const saveEntry = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      toast.error("יש שדות שדורשים תיקון לפני שמירה");
      scrollToFirstError(validationErrors);
      return;
    }

    if (!patientId) return;

    setIsSubmitting(true);

    try {
      const payload = buildVisitPayload();
      const result = await saveMedicalEntryAtomic({
        submissionId: submissionIdRef.current,
        petId: patientId,
        appointmentId: appointmentId ?? null,
        visitDate: new Date(`${visitDate}T12:00:00`).toISOString(),
        visitType: entryType,
        urgencyLevel,
        reason: payload.reason,
        diagnosis: payload.diagnosis,
        treatment: payload.treatment,
        notes: payload.notes,
        followUpRequired: payload.followUpRequired,
        followUpNotes: payload.followUpNotes,
        entryData: buildEntryData(),
        vaccination: entryType === "vaccination" ? {
          vaccineName: vaccineName.trim(),
          givenDate: visitDate,
          nextDueDate: nextDueDate || undefined,
          notes: notes.trim() || undefined,
        } : null,
        physicalExam: entryType === "full_exam" && nonEmpty(physicalExamFindings)
          ? { findings: physicalExamFindings.trim() }
          : null,
        problems: entryType === "full_exam" ? cleanProblems.map((problem) => ({
          ...problem,
          problemText: problem.problemText.trim(),
          notes: problem.notes.trim(),
        })) : [],
        differentials: entryType === "full_exam" ? cleanDifferentials.map((diagnosis) => ({
          ...diagnosis,
          diagnosisText: diagnosis.diagnosisText.trim(),
          notes: diagnosis.notes.trim(),
        })) : [],
        prescriptions: entryType === "full_exam" || entryType === "prescription_only"
          ? cleanPrescriptions.map((prescription) => ({
              ...prescription,
              medication: prescription.medication.trim(),
              dosage: prescription.dosage.trim(),
              frequency: prescription.frequency.trim(),
              duration: prescription.duration.trim(),
              startDate: visitDate,
            }))
          : [],
        labs: entryType === "full_exam" || entryType === "lab"
          ? cleanLabs.map((lab) => ({ ...lab, testName: lab.testName.trim(), notes: lab.notes.trim() }))
          : [],
        weight: entryType === "weight_check" ? numericValue(weight) : null,
      });

      await Promise.all([loadMedicalData(), loadLabOrders()]);
      const savedVisit = {
        id: result.visitId,
        patientId: result.patientId,
        date: dateInputToUiDate(visitDate),
        vetName: result.vetName,
        reason: result.reason,
        diagnosis: result.finalDiagnosis || result.diagnosis,
        treatment: result.treatment,
        notes: result.notes,
        attachments: 0,
        visitType: result.visitType,
        urgencyLevel: result.urgencyLevel,
        chiefComplaint: result.reason,
        finalDiagnosis: result.finalDiagnosis,
        followUpRequired: result.followUpRequired,
        followUpNotes: result.followUpNotes,
        entryData: result.entryData,
      };

      if (entryType === "vaccination") {
        window.dispatchEvent(new CustomEvent(VACCINATIONS_CHANGED_EVENT, { detail: { patientId } }));
      }
      setSavedVisitContext({
        visitId: result.visitId,
        entryType,
        entryLabel: entryConfig.label,
        visitDate,
        ownerSummaryDraft: buildOwnerSummaryDraft(),
        prescriptions: cleanPrescriptions,
        labs: cleanLabs,
      });
      setIsSaved(true);
      onSave?.({
        visit: savedVisit,
        entryType,
        problems: cleanProblems,
        physicalExamFindings,
        differentials: cleanDifferentials,
        prescriptions: cleanPrescriptions,
        labs: cleanLabs,
      });
      toast.success(entryType === "vaccination" ? "הרשומה נשמרה והחיסון נוסף לפנקס" : "הרשומה הרפואית נשמרה");
    } catch (error) {
      console.error("Failed saving medical entry", error);
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה בשמירת הרשומה הרפואית");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCommonHeader = () => (
    <section className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-gray-900 text-[18px] font-bold">איזו רשומה רפואית רוצים להוסיף?</h3>
          <p className="text-gray-500 text-[13px] mt-1">בחר פעולה אחת. הטופס יציג רק את השדות הרלוונטיים, בלי מעבר בין שלבים.</p>
        </div>
        <div data-field="visitDate" className="min-w-[180px]">
          <label className="block text-gray-700 text-[13px] mb-1.5 font-semibold">תאריך</label>
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setFieldValue(setVisitDate, "visitDate", e.target.value)}
            className={getFieldClass("visitDate", "w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-[14px]")}
          />
          <FieldError message={errors.visitDate} />
        </div>
      </div>

      <div data-field="entryType" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {entryTypes.map((item) => {
          const Icon = item.icon;
          const active = item.id === entryType;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setEntryType(item.id)}
              className={`text-right border rounded-2xl p-4 transition-all ${active ? `${item.className} shadow-sm ring-2 ring-blue-100` : "bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/30"}`}
            >
              <div className="flex items-start gap-3">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-white/70" : "bg-gray-50 text-gray-500"}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-[14px] font-bold text-gray-900">{item.label}</span>
                  <span className="block text-[12px] text-gray-500 mt-1 leading-5">{item.description}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderVisitDetails = ({ requireReason = false, title = "פרטי רשומה" }: { requireReason?: boolean; title?: string }) => (
    <Section icon={ClipboardList} title={title}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div data-field="chiefComplaint">
          <label className="block text-gray-700 text-[14px] mb-2 font-semibold">
            סיבה / כותרת {requireReason && <span className="text-red-500">*</span>}
          </label>
          <input
            value={chiefComplaint}
            onChange={(e) => setFieldValue(setChiefComplaint, "chiefComplaint", e.target.value)}
            className={getFieldClass("chiefComplaint", "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 text-[15px]")}
            placeholder="לדוגמה: הקאות מאתמול, ביקורת לאחר טיפול, מעקב פצע"
          />
          <FieldError message={errors.chiefComplaint} />
        </div>

        <div>
          <label className="block text-gray-700 text-[14px] mb-2 font-semibold">רמת דחיפות</label>
          <div className="grid grid-cols-3 gap-2">
            {severityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setUrgencyLevel(option.value)}
                className={`px-3 py-3 rounded-xl border text-[13px] font-bold transition-all ${urgencyLevel === option.value ? option.className : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-gray-700 text-[14px] mb-2 font-semibold">תיאור חופשי</label>
        <textarea
          value={freeVisitText}
          onChange={(e) => setFieldValue(setFreeVisitText, "freeVisitText", e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
          placeholder="מידע שהבעלים מסר, משך הסימפטומים, שינוי בהתנהגות, תרופות שניתנו בבית וכו׳"
        />
      </div>
    </Section>
  );

  const renderProblemsAndExam = () => (
    <Section icon={Stethoscope} title="בעיות ובדיקה גופנית">
      {errors.fullExamContent && (
        <div data-field="fullExamContent" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-[14px] font-semibold">
          {errors.fullExamContent}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="text-gray-800 text-[15px] font-bold">בעיות / תלונות פעילות</label>
          <button type="button" onClick={addProblemRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold">
            <Plus className="w-4 h-4" /> הוסף בעיה
          </button>
        </div>

        {problems.map((problem, index) => (
          <div key={index} className="border border-gray-200 rounded-2xl p-4 bg-white space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              <input
                value={problem.problemText}
                onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, problemText: e.target.value } : item))}
                className="md:col-span-5 w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[14px]"
                placeholder="לדוגמה: הקאות / צליעה / גירוד"
              />
              <select
                value={problem.severity}
                onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, severity: e.target.value as UrgencyLevel } : item))}
                className="md:col-span-3 w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-[14px]"
              >
                {severityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                value={problem.status}
                onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, status: e.target.value as MedicalProblemStatus } : item))}
                className="md:col-span-3 w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-[14px]"
              >
                {problemStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setProblems((prev) => prev.length === 1 ? [{ problemText: "", severity: "normal", status: "active", notes: "" }] : prev.filter((_, i) => i !== index))}
                className="md:col-span-1 p-2.5 text-red-500 hover:bg-red-50 rounded-xl"
                aria-label="מחק בעיה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={problem.notes}
              onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, notes: e.target.value } : item))}
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[14px] resize-none"
              placeholder="הערות לבעיה זו, אם יש"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-gray-800 text-[15px] mb-2 font-bold">בדיקה גופנית</label>
        <textarea
          value={physicalExamFindings}
          onChange={(e) => setFieldValue(setPhysicalExamFindings, "physicalExamFindings", e.target.value)}
          rows={7}
          className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
          placeholder="מלל חופשי — לדוגמה: מצב כללי טוב, ריריות ורודות, רגישות קלה בבטן, אין חום, הליכה תקינה..."
        />
      </div>
    </Section>
  );

  const renderTreatment = () => (
    <Section icon={Pill} title="טיפול, מרשמים ובדיקות">
      <div>
        <label className="block text-gray-800 text-[15px] mb-2 font-bold">טיפול שבוצע / תוכנית טיפול</label>
        <textarea
          value={treatmentText}
          onChange={(e) => setFieldValue(setTreatmentText, "treatmentText", e.target.value)}
          rows={5}
          className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
          placeholder="לדוגמה: מתן נוזלים, ניקוי אוזניים, טיפול תרופתי, המלצה למעקב..."
        />
      </div>

      {renderPrescriptions()}
      {renderLabs()}
    </Section>
  );

  const renderPrescriptions = () => (
    <div data-field="prescriptions" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-gray-800 text-[15px] font-bold flex items-center gap-2"><Pill className="w-4 h-4 text-blue-600" /> מרשמים</h3>
        <button type="button" onClick={addPrescriptionRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold"><Plus className="w-4 h-4" /> הוסף מרשם</button>
      </div>
      <FieldError message={errors.prescriptions} />
      {prescriptions.map((prescription, index) => (
        <div key={index} className={`grid grid-cols-1 md:grid-cols-12 gap-3 border rounded-2xl p-4 bg-white ${errors.prescriptions ? "border-red-200" : "border-gray-200"}`}>
          <input className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="תרופה" value={prescription.medication} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, medication: e.target.value } : item))} />
          <input className="md:col-span-2 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="מינון" value={prescription.dosage} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, dosage: e.target.value } : item))} />
          <input className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="תדירות" value={prescription.frequency} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, frequency: e.target.value } : item))} />
          <input className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="משך טיפול" value={prescription.duration} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, duration: e.target.value } : item))} />
          <button type="button" onClick={() => setPrescriptions((prev) => prev.length === 1 ? [{ medication: "", dosage: "", frequency: "", duration: "" }] : prev.filter((_, i) => i !== index))} className="md:col-span-1 p-2.5 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );

  const renderLabs = () => (
    <div data-field="labs" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-gray-800 text-[15px] font-bold flex items-center gap-2"><TestTube className="w-4 h-4 text-blue-600" /> בדיקות מעבדה</h3>
        <button type="button" onClick={addLabRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold"><Plus className="w-4 h-4" /> הוסף בדיקה</button>
      </div>
      <FieldError message={errors.labs} />
      {labs.map((lab, index) => (
        <div key={index} className={`border rounded-2xl p-4 bg-white space-y-3 ${errors.labs ? "border-red-200" : "border-gray-200"}`}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <input className="md:col-span-4 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="שם בדיקה" value={lab.testName} onChange={(e) => setLabs((prev) => prev.map((item, i) => i === index ? { ...item, testName: e.target.value } : item))} />
            <select className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-[14px]" value={lab.category} onChange={(e) => setLabs((prev) => prev.map((item, i) => i === index ? { ...item, category: e.target.value as LabDraft["category"] } : item))}>
              {labCategories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input type="date" className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" value={lab.testDate} onChange={(e) => setLabs((prev) => prev.map((item, i) => i === index ? { ...item, testDate: e.target.value } : item))} />
            <label className="md:col-span-1 flex items-center gap-2 text-[13px] text-gray-600">
              <input type="checkbox" checked={lab.urgent} onChange={(e) => setLabs((prev) => prev.map((item, i) => i === index ? { ...item, urgent: e.target.checked } : item))} /> דחוף
            </label>
            <button type="button" onClick={() => setLabs((prev) => prev.length === 1 ? [{ testName: "", category: "blood", testDate: todayInputValue(), urgent: false, notes: "" }] : prev.filter((_, i) => i !== index))} className="md:col-span-1 p-2.5 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
          </div>
          <textarea className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[14px] resize-none" rows={2} placeholder="הערות לבדיקה" value={lab.notes} onChange={(e) => setLabs((prev) => prev.map((item, i) => i === index ? { ...item, notes: e.target.value } : item))} />
        </div>
      ))}
    </div>
  );

  const renderDiagnosesAndSummary = () => (
    <Section icon={FileText} title="אבחנות וסיכום">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-gray-800 text-[15px] font-bold">אבחנות מבדלות</h3>
          <button type="button" onClick={addDifferentialRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold"><Plus className="w-4 h-4" /> הוסף אבחנה</button>
        </div>
        {differentials.map((diagnosis, index) => (
          <div key={index} className="border border-gray-200 rounded-2xl p-4 bg-white space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <input className="md:col-span-7 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="לדוגמה: אלרגיה / זיהום / גוף זר" value={diagnosis.diagnosisText} onChange={(e) => setDifferentials((prev) => prev.map((item, i) => i === index ? { ...item, diagnosisText: e.target.value } : item))} />
              <select className="md:col-span-4 px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-[14px]" value={diagnosis.likelihood} onChange={(e) => setDifferentials((prev) => prev.map((item, i) => i === index ? { ...item, likelihood: e.target.value as DifferentialLikelihood } : item))}>
                {likelihoodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button type="button" onClick={() => setDifferentials((prev) => prev.length === 1 ? [{ diagnosisText: "", likelihood: "possible", notes: "" }] : prev.filter((_, i) => i !== index))} className="md:col-span-1 p-2.5 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
            </div>
            <textarea className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-[14px] resize-none" rows={2} placeholder="הערות לאבחנה מבדלת זו" value={diagnosis.notes} onChange={(e) => setDifferentials((prev) => prev.map((item, i) => i === index ? { ...item, notes: e.target.value } : item))} />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-gray-800 text-[15px] mb-2 font-bold">אבחנה סופית</label>
        <textarea
          value={finalDiagnosis}
          onChange={(e) => setFieldValue(setFinalDiagnosis, "finalDiagnosis", e.target.value)}
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
          placeholder="אם קיימת אבחנה סופית — כתוב אותה כאן. אם עדיין אין, אפשר להשאיר ריק."
        />
      </div>

      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderNotesAndFollowUp = () => (
    <>
      <div data-field="notes">
        <label className="block text-gray-800 text-[15px] mb-2 font-bold">סיכום / הערות</label>
        <textarea
          value={notes}
          onChange={(e) => setFieldValue(setNotes, "notes", e.target.value)}
          rows={4}
          className={getFieldClass("notes", "w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 text-[15px] resize-none")}
          placeholder="סיכום, הנחיות לבעלים, מידע חשוב להמשך"
        />
        <FieldError message={errors.notes} />
      </div>

      <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
        <label className="flex items-center gap-2 text-gray-800 font-bold text-[14px] mb-3">
          <input type="checkbox" checked={followUpRequired} onChange={(e) => setFollowUpRequired(e.target.checked)} />
          נדרש מעקב
        </label>
        {followUpRequired && (
          <textarea value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-[14px] resize-none" placeholder="לדוגמה: ביקורת בעוד 7 ימים / לחזור אם יש החמרה / לשלוח תוצאות מעבדה" />
        )}
      </div>
    </>
  );

  const renderVaccination = () => (
    <Section icon={Syringe} title="חיסון">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div data-field="vaccineName">
          <label className="block text-gray-700 text-[14px] mb-2 font-semibold">שם החיסון <span className="text-red-500">*</span></label>
          <input
            value={vaccineName}
            onChange={(e) => setFieldValue(setVaccineName, "vaccineName", e.target.value)}
            className={getFieldClass("vaccineName", "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 text-[15px]")}
            placeholder="לדוגמה: כלבת / משושה / מרובע"
          />
          <FieldError message={errors.vaccineName} />
        </div>
        <div>
          <label className="block text-gray-700 text-[14px] mb-2 font-semibold">תאריך חיסון הבא</label>
          <input
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
          />
        </div>
      </div>
      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderWeightCheck = () => (
    <Section icon={Scale} title="שקילה">
      <div data-field="weight" className="max-w-md">
        <label className="block text-gray-700 text-[14px] mb-2 font-semibold">משקל בק״ג <span className="text-red-500">*</span></label>
        <input
          value={weight}
          onChange={(e) => setFieldValue(setWeight, "weight", e.target.value)}
          className={getFieldClass("weight", "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 text-[15px]")}
          placeholder="לדוגמה: 12.4"
          inputMode="decimal"
        />
        <FieldError message={errors.weight} />
      </div>
      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderPrescriptionOnly = () => (
    <Section icon={Pill} title="מרשם בלבד">
      <div>
        <label className="block text-gray-700 text-[14px] mb-2 font-semibold">סיבה / כותרת</label>
        <input
          value={chiefComplaint}
          onChange={(e) => setFieldValue(setChiefComplaint, "chiefComplaint", e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
          placeholder="לדוגמה: חידוש מרשם / המשך טיפול תרופתי"
        />
      </div>
      {renderPrescriptions()}
      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderLabOnly = () => (
    <Section icon={TestTube} title="בדיקת מעבדה">
      <div>
        <label className="block text-gray-700 text-[14px] mb-2 font-semibold">סיבה / כותרת</label>
        <input
          value={chiefComplaint}
          onChange={(e) => setFieldValue(setChiefComplaint, "chiefComplaint", e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
          placeholder="לדוגמה: מעקב תפקודי כבד / בדיקת דם לפני ניתוח"
        />
      </div>
      {renderLabs()}
      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderFollowUp = () => (
    <Section icon={ClipboardList} title="מעקב קצר">
      {renderVisitDetails({ requireReason: true, title: "פרטי מעקב" })}
      <div>
        <label className="block text-gray-800 text-[15px] mb-2 font-bold">סטטוס / טיפול המשך</label>
        <textarea
          value={treatmentText}
          onChange={(e) => setFieldValue(setTreatmentText, "treatmentText", e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
          placeholder="לדוגמה: נראה שיפור, להמשיך טיפול עוד 3 ימים, ביקורת בעוד שבוע"
        />
      </div>
      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderNote = () => (
    <Section icon={MessageSquare} title="הערה רפואית">
      <div>
        <label className="block text-gray-700 text-[14px] mb-2 font-semibold">כותרת</label>
        <input
          value={chiefComplaint}
          onChange={(e) => setFieldValue(setChiefComplaint, "chiefComplaint", e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
          placeholder="לדוגמה: שיחה טלפונית / הערת צוות / מידע מהבעלים"
        />
      </div>
      <div>
        <label className="block text-gray-700 text-[14px] mb-2 font-semibold">תיאור חופשי</label>
        <textarea
          value={freeVisitText}
          onChange={(e) => setFieldValue(setFreeVisitText, "freeVisitText", e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
          placeholder="כתוב כאן את ההערה"
        />
      </div>
      {renderNotesAndFollowUp()}
    </Section>
  );

  const renderDynamicForm = () => {
    if (entryType === "vaccination") return renderVaccination();
    if (entryType === "weight_check") return renderWeightCheck();
    if (entryType === "prescription_only") return renderPrescriptionOnly();
    if (entryType === "lab") return renderLabOnly();
    if (entryType === "follow_up") return renderFollowUp();
    if (entryType === "note") return renderNote();

    return (
      <>
        {renderVisitDetails({ requireReason: true, title: "פרטי ביקור" })}
        {renderProblemsAndExam()}
        {renderTreatment()}
        {renderDiagnosesAndSummary()}
      </>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden flex flex-col">
        <header className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                <PetIcon className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-[22px] font-bold">רשומה רפואית חדשה</h2>
                <p className="text-white/80 text-[13px] mt-1">{petName} · בעלים: {ownerName} · רופא: {currentVet}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="סגור"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50/40">
          <div className="max-w-5xl mx-auto space-y-5">
            {isSaved && savedVisitContext ? (
              <VisitPostSaveActionsModal
                petName={petName}
                ownerName={ownerName}
                ownerId={ownerId}
                patientId={patientId}
                visitId={savedVisitContext.visitId}
                entryType={savedVisitContext.entryType}
                entryLabel={savedVisitContext.entryLabel}
                visitDate={savedVisitContext.visitDate}
                ownerSummaryDraft={savedVisitContext.ownerSummaryDraft}
                prescriptions={savedVisitContext.prescriptions}
                labs={savedVisitContext.labs}
                onClose={onClose}
              />
            ) : (
              <>
                {errors.patient && (
                  <div data-field="patient" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-[14px] font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {errors.patient}
                  </div>
                )}
                {errors.form && (
                  <div data-field="form" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-[14px] font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {errors.form}
                  </div>
                )}
                {renderCommonHeader()}
                {renderDynamicForm()}
              </>
            )}
          </div>
        </main>

        {!isSaved && (
          <footer className="border-t border-gray-100 px-6 py-4 bg-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[13px] text-gray-500">
              <span className={`px-3 py-1.5 rounded-full border font-bold ${entryConfig.className}`}>{entryConfig.shortLabel}</span>
              <span>הרשומה תישמר בתיק החיה</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveEntry}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-[14px] font-bold"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSubmitting ? "שומר..." : "שמור רשומה רפואית"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
        <span className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </span>
        <h3 className="text-gray-900 text-[17px] font-bold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-red-600 text-[12px] mt-1.5 font-semibold">{message}</p>;
}
