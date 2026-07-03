import { useEffect, useMemo, useState } from "react";
import {
  X,
  Stethoscope,
  Plus,
  Trash2,
  Check,
  Pill,
  TestTube,
  ClipboardList,
  MessageSquare,
  Save,
  AlertTriangle,
  Dog,
  Cat,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { useMedicalStore, type UrgencyLevel, type MedicalProblemStatus, type DifferentialLikelihood } from "../data/MedicalStore";
import { useLabStore } from "../data/LabStore";
import { getStaffLabel } from "../data/staffAuth";
import { VISIT_TYPES, CLINIC_VISIT_TYPE_KEYS } from "../data/categoryConfig";

interface TreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  petName: string;
  petSpecies: "dog" | "cat" | string;
  ownerName: string;
  patientId?: number;
  onSave?: (data: any) => void;
}

type StepKey = "visit" | "clinical" | "plan" | "diagnosis" | "summary";

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

const visitTypes = CLINIC_VISIT_TYPE_KEYS.map((id) => ({ id, ...VISIT_TYPES[id] }));

const STEPS: { key: StepKey; label: string; subtitle: string; icon: any }[] = [
  { key: "visit", label: "פרטי ביקור", subtitle: "סוג, סיבה ודחיפות", icon: ClipboardList },
  { key: "clinical", label: "בעיות ובדיקה", subtitle: "קודם בעיות, אחר כך הסבר", icon: Stethoscope },
  { key: "plan", label: "טיפול ומרשמים", subtitle: "מה בוצע ומה נדרש", icon: Pill },
  { key: "diagnosis", label: "אבחנות וסיכום", subtitle: "אבחנות בסוף הביקור", icon: FileText },
  { key: "summary", label: "אישור", subtitle: "בדיקה לפני שמירה", icon: Check },
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

function formatDateForVisit() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

function nonEmpty(value: string) {
  return value.trim().length > 0;
}

function urgencyLabel(value: UrgencyLevel) {
  return severityOptions.find((option) => option.value === value)?.label || "רגיל";
}

function statusLabel(value: MedicalProblemStatus) {
  return problemStatusOptions.find((option) => option.value === value)?.label || "פעיל";
}

function likelihoodLabel(value: DifferentialLikelihood) {
  return likelihoodOptions.find((option) => option.value === value)?.label || "אפשרית";
}

export function TreatmentModal({
  isOpen,
  onClose,
  petName,
  petSpecies,
  ownerName,
  patientId,
  onSave,
}: TreatmentModalProps) {
  const {
    addVisit,
    addPrescription,
    addPhysicalExam,
    addMedicalProblem,
    addDifferentialDiagnosis,
    loadMedicalData,
  } = useMedicalStore();
  const { addLabOrder } = useLabStore();
  const currentVet = getStaffLabel();

  const [currentStep, setCurrentStep] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [visitType, setVisitType] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>("normal");
  const [freeVisitText, setFreeVisitText] = useState("");
  const [physicalExamFindings, setPhysicalExamFindings] = useState("");
  const [treatmentText, setTreatmentText] = useState("");
  const [notes, setNotes] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");

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

  useEffect(() => {
    if (!isOpen) return;
    setCurrentStep(0);
    setIsSaved(false);
    setIsSubmitting(false);
    setVisitType("");
    setChiefComplaint("");
    setUrgencyLevel("normal");
    setFreeVisitText("");
    setPhysicalExamFindings("");
    setTreatmentText("");
    setNotes("");
    setFinalDiagnosis("");
    setFollowUpRequired(false);
    setFollowUpNotes("");
    setProblems([{ problemText: "", severity: "normal", status: "active", notes: "" }]);
    setPrescriptions([{ medication: "", dosage: "", frequency: "", duration: "" }]);
    setLabs([{ testName: "", category: "blood", testDate: todayInputValue(), urgent: false, notes: "" }]);
    setDifferentials([{ diagnosisText: "", likelihood: "possible", notes: "" }]);
  }, [isOpen]);

  const cleanProblems = useMemo(() => problems.filter((p) => nonEmpty(p.problemText)), [problems]);
  const cleanPrescriptions = useMemo(() => prescriptions.filter((p) => nonEmpty(p.medication)), [prescriptions]);
  const cleanLabs = useMemo(() => labs.filter((l) => nonEmpty(l.testName)), [labs]);
  const cleanDifferentials = useMemo(() => differentials.filter((d) => nonEmpty(d.diagnosisText)), [differentials]);

  if (!isOpen) return null;

  const validateStep = (step = currentStep) => {
    const key = STEPS[step].key;

    if (key === "visit") {
      if (!visitType) {
        toast.error("יש לבחור סוג ביקור");
        return false;
      }
      if (!nonEmpty(chiefComplaint) && !nonEmpty(freeVisitText)) {
        toast.error("יש להזין סיבת ביקור או תיאור חופשי");
        return false;
      }
    }

    if (key === "clinical") {
      if (cleanProblems.length === 0 && !nonEmpty(physicalExamFindings)) {
        toast.error("יש להזין לפחות בעיה רפואית או בדיקה גופנית");
        return false;
      }
    }

    if (key === "plan") {
      if (!nonEmpty(treatmentText) && cleanPrescriptions.length === 0 && cleanLabs.length === 0) {
        toast.error("יש להזין טיפול, מרשם או בדיקת מעבדה");
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

  const addProblemRow = () => setProblems((prev) => [...prev, { problemText: "", severity: "normal", status: "active", notes: "" }]);
  const addPrescriptionRow = () => setPrescriptions((prev) => [...prev, { medication: "", dosage: "", frequency: "", duration: "" }]);
  const addLabRow = () => setLabs((prev) => [...prev, { testName: "", category: "blood", testDate: todayInputValue(), urgent: false, notes: "" }]);
  const addDifferentialRow = () => setDifferentials((prev) => [...prev, { diagnosisText: "", likelihood: "possible", notes: "" }]);

  const saveTreatment = async () => {
    if (!patientId) {
      toast.error("חסר מזהה מטופל. לא ניתן לשמור טיפול");
      return;
    }

    for (let i = 0; i < STEPS.length - 1; i += 1) {
      if (!validateStep(i)) {
        setCurrentStep(i);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const visitTypeLabel = visitTypes.find((v) => v.id === visitType)?.label || visitType || "בדיקה כללית";
      const problemsText = cleanProblems.map((p) => p.problemText).join(", ");
      const differentialsText = cleanDifferentials.map((d) => d.diagnosisText).join(", ");
      const prescriptionText = cleanPrescriptions.map((p) => `${p.medication} ${p.dosage}`.trim()).join(", ");
      const labText = cleanLabs.map((l) => l.testName).join(", ");

      const combinedReason = [chiefComplaint, freeVisitText].filter(nonEmpty).join(" — ") || visitTypeLabel;
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

      const savedVisit = await addVisit({
        patientId,
        date: formatDateForVisit(),
        vetName: currentVet,
        reason: combinedReason,
        diagnosis: finalDiagnosis || (cleanDifferentials[0]?.diagnosisText ?? ""),
        treatment: treatmentSummary || "לא צוין",
        notes: combinedNotes,
        attachments: 0,
        visitType,
        urgencyLevel,
        chiefComplaint: combinedReason,
        finalDiagnosis: finalDiagnosis || "",
        followUpRequired,
        followUpNotes,
      });

      if (!savedVisit) return;

      if (nonEmpty(physicalExamFindings)) {
        await addPhysicalExam({
          visitId: savedVisit.id,
          patientId,
          examDate: new Date().toISOString(),
          findings: physicalExamFindings.trim(),
        });
      }

      for (const problem of cleanProblems) {
        await addMedicalProblem({
          visitId: savedVisit.id,
          patientId,
          problemText: problem.problemText.trim(),
          severity: problem.severity,
          status: problem.status,
          notes: problem.notes.trim(),
        });
      }

      for (const diagnosis of cleanDifferentials) {
        await addDifferentialDiagnosis({
          visitId: savedVisit.id,
          patientId,
          diagnosisText: diagnosis.diagnosisText.trim(),
          likelihood: diagnosis.likelihood,
          notes: diagnosis.notes.trim(),
        });
      }

      for (const prescription of cleanPrescriptions) {
        await addPrescription({
          patientId,
          visitId: savedVisit.id,
          medication: prescription.medication.trim(),
          dosage: prescription.dosage.trim(),
          frequency: prescription.frequency.trim(),
          duration: prescription.duration.trim(),
          startDate: new Date().toISOString().slice(0, 10),
          prescribedBy: currentVet,
        });
      }

      for (const lab of cleanLabs) {
        await addLabOrder({
          patientId,
          petName,
          testName: lab.testName.trim(),
          category: lab.category,
          status: "ordered",
          orderedDate: formatDateForVisit(),
          testDate: lab.testDate,
          orderedBy: currentVet,
          notes: lab.notes.trim(),
          urgent: lab.urgent,
        });
      }

      await loadMedicalData();
      setIsSaved(true);
      onSave?.({
        visit: savedVisit,
        problems: cleanProblems,
        physicalExamFindings,
        differentials: cleanDifferentials,
        prescriptions: cleanPrescriptions,
        labs: cleanLabs,
      });
      toast.success("הטיפול נשמר בתיק הרפואי של החיה");
    } catch (error) {
      console.error("Failed saving treatment", error);
      toast.error("אירעה שגיאה בשמירת הטיפול");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    const stepKey = STEPS[currentStep].key;

    if (stepKey === "visit") {
      return (
        <section className="space-y-6">
          <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4">
            <h3 className="text-gray-900 font-bold text-[16px] mb-1">פרטי ביקור</h3>
            <p className="text-gray-600 text-[13px]">כאן מתחילים את הביקור: סוג, סיבה, ורמת דחיפות. האבחנה תגיע רק בסוף.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-[14px] mb-2 font-semibold">סוג ביקור</label>
              <select
                value={visitType}
                onChange={(e) => setVisitType(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
              >
                <option value="">בחר סוג ביקור</option>
                {visitTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
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
            <label className="block text-gray-700 text-[14px] mb-2 font-semibold">סיבת ביקור / תלונה ראשית</label>
            <input
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
              placeholder="לדוגמה: הקאות מאתמול, צליעה ברגל ימין, חיסון שנתי"
            />
          </div>

          <div>
            <label className="block text-gray-700 text-[14px] mb-2 font-semibold">מלל חופשי לפתיחת הביקור</label>
            <textarea
              value={freeVisitText}
              onChange={(e) => setFreeVisitText(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
              placeholder="כתוב כאן כל מידע שהבעלים מסר, משך הסימפטומים, שינוי בהתנהגות, תרופות שניתנו בבית וכו׳"
            />
          </div>
        </section>
      );
    }

    if (stepKey === "clinical") {
      return (
        <section className="space-y-6">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-gray-900 font-bold text-[16px] mb-1">בעיה רפואית ≠ אבחנה</h3>
              <p className="text-gray-600 text-[13px]">כאן רושמים תלונות וממצאים. אבחנות מבדלות ואבחנה סופית יופיעו בשלב האחרון.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-gray-800 text-[15px] font-bold">בעיות / תלונות פעילות</label>
              <button type="button" onClick={addProblemRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold">
                <Plus className="w-4 h-4" /> הוסף בעיה
              </button>
            </div>

            {problems.map((problem, index) => (
              <div key={index} className="border border-gray-200 rounded-2xl p-4 bg-white space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                  <div className="md:col-span-5">
                    <input
                      value={problem.problemText}
                      onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, problemText: e.target.value } : item))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[14px]"
                      placeholder="לדוגמה: הקאות / צליעה / גירוד"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <select
                      value={problem.severity}
                      onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, severity: e.target.value as UrgencyLevel } : item))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-[14px]"
                    >
                      {severityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <select
                      value={problem.status}
                      onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, status: e.target.value as MedicalProblemStatus } : item))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl bg-white text-[14px]"
                    >
                      {problemStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProblems((prev) => prev.length === 1 ? [{ problemText: "", severity: "normal", status: "active", notes: "" }] : prev.filter((_, i) => i !== index))}
                    className="md:col-span-1 p-2.5 text-red-500 hover:bg-red-50 rounded-xl"
                    title="מחק"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={problem.notes}
                  onChange={(e) => setProblems((prev) => prev.map((item, i) => i === index ? { ...item, notes: e.target.value } : item))}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[14px] resize-none"
                  placeholder="הערות לבעיה זו, אם יש"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-gray-800 text-[15px] mb-2 font-bold">בדיקה גופנית</label>
            <textarea
              value={physicalExamFindings}
              onChange={(e) => setPhysicalExamFindings(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
              placeholder="מלל חופשי בלבד — לדוגמה: מצב כללי טוב, ריריות ורודות, רגישות קלה בבטן, אין חום, הליכה תקינה..."
            />
          </div>
        </section>
      );
    }

    if (stepKey === "plan") {
      return (
        <section className="space-y-6">
          <div>
            <label className="block text-gray-800 text-[15px] mb-2 font-bold">טיפול שבוצע / תוכנית טיפול</label>
            <textarea
              value={treatmentText}
              onChange={(e) => setTreatmentText(e.target.value)}
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
              placeholder="לדוגמה: מתן נוזלים, ניקוי אוזניים, טיפול תרופתי, המלצה למעקב..."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-800 text-[15px] font-bold flex items-center gap-2"><Pill className="w-4 h-4 text-blue-600" /> מרשמים</h3>
              <button type="button" onClick={addPrescriptionRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold"><Plus className="w-4 h-4" /> הוסף מרשם</button>
            </div>
            {prescriptions.map((prescription, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 border border-gray-200 rounded-2xl p-4 bg-white">
                <input className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="תרופה" value={prescription.medication} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, medication: e.target.value } : item))} />
                <input className="md:col-span-2 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="מינון" value={prescription.dosage} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, dosage: e.target.value } : item))} />
                <input className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="תדירות" value={prescription.frequency} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, frequency: e.target.value } : item))} />
                <input className="md:col-span-3 px-3 py-2.5 border border-gray-300 rounded-xl text-[14px]" placeholder="משך טיפול" value={prescription.duration} onChange={(e) => setPrescriptions((prev) => prev.map((item, i) => i === index ? { ...item, duration: e.target.value } : item))} />
                <button type="button" onClick={() => setPrescriptions((prev) => prev.length === 1 ? [{ medication: "", dosage: "", frequency: "", duration: "" }] : prev.filter((_, i) => i !== index))} className="md:col-span-1 p-2.5 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-800 text-[15px] font-bold flex items-center gap-2"><TestTube className="w-4 h-4 text-blue-600" /> בדיקות מעבדה</h3>
              <button type="button" onClick={addLabRow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[13px] font-semibold"><Plus className="w-4 h-4" /> הוסף בדיקה</button>
            </div>
            {labs.map((lab, index) => (
              <div key={index} className="border border-gray-200 rounded-2xl p-4 bg-white space-y-3">
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
        </section>
      );
    }

    if (stepKey === "diagnosis") {
      return (
        <section className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <h3 className="text-gray-900 font-bold text-[16px] mb-1">אבחנות מופיעות בסוף</h3>
            <p className="text-gray-600 text-[13px]">לאחר תלונה, בדיקה וטיפול — רושמים אבחנות מבדלות ואבחנה סופית.</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
              onChange={(e) => setFinalDiagnosis(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none"
              placeholder="אם קיימת אבחנה סופית — כתוב אותה כאן. אם עדיין אין, אפשר להשאיר ריק ולהסתפק באבחנות מבדלות."
            />
          </div>

          <div>
            <label className="block text-gray-800 text-[15px] mb-2 font-bold">סיכום והערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] resize-none" placeholder="סיכום ביקור, הנחיות לבעלים, מידע חשוב להמשך" />
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
        </section>
      );
    }

    return (
      <section className="space-y-5">
        {isSaved ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-9 h-9 text-emerald-600" />
            </div>
            <h3 className="text-gray-900 text-[22px] font-bold mb-2">הטיפול נשמר בהצלחה</h3>
            <p className="text-gray-500 text-[14px]">הביקור, הבדיקה הגופנית, הבעיות והאבחנות נשמרו בתיק הרפואי.</p>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-gray-900 font-bold text-[16px] mb-4">סיכום לפני שמירה</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[14px]">
                <SummaryItem label="סוג ביקור" value={visitTypes.find((v) => v.id === visitType)?.label || "לא נבחר"} />
                <SummaryItem label="דחיפות" value={urgencyLabel(urgencyLevel)} />
                <SummaryItem label="סיבת ביקור" value={chiefComplaint || freeVisitText || "לא צוין"} />
                <SummaryItem label="בעיות" value={cleanProblems.length ? cleanProblems.map((p) => `${p.problemText} (${urgencyLabel(p.severity)}, ${statusLabel(p.status)})`).join("; ") : "לא צוין"} />
                <SummaryItem label="בדיקה גופנית" value={physicalExamFindings || "לא צוין"} />
                <SummaryItem label="טיפול" value={treatmentText || "לא צוין"} />
                <SummaryItem label="מרשמים" value={cleanPrescriptions.length ? cleanPrescriptions.map((p) => p.medication).join(", ") : "אין"} />
                <SummaryItem label="בדיקות מעבדה" value={cleanLabs.length ? cleanLabs.map((l) => `${l.testName} (${l.testDate})`).join(", ") : "אין"} />
                <SummaryItem label="אבחנות מבדלות" value={cleanDifferentials.length ? cleanDifferentials.map((d) => `${d.diagnosisText} (${likelihoodLabel(d.likelihood)})`).join("; ") : "לא צוין"} />
                <SummaryItem label="אבחנה סופית" value={finalDiagnosis || "לא צוין"} />
              </div>
            </div>
          </>
        )}
      </section>
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
                <h2 className="text-[22px] font-bold">התחל טיפול רפואי</h2>
                <p className="text-white/80 text-[13px] mt-1">{petName} · בעלים: {ownerName} · רופא: {currentVet}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors" aria-label="סגור">
              <X className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-4 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const active = index === currentStep;
              const done = index < currentStep || isSaved;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setCurrentStep(index)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-right ${active ? "bg-white border-blue-200 shadow-sm" : done ? "bg-emerald-50 border-emerald-100" : "bg-white/70 border-gray-100 hover:bg-white"}`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? "bg-blue-100 text-blue-700" : done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {done && !active ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </span>
                  <span>
                    <span className="block text-gray-900 text-[13px] font-bold">{step.label}</span>
                    <span className="block text-gray-500 text-[11px] mt-0.5">{step.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50/40">
          <div className="max-w-5xl mx-auto">{renderStep()}</div>
        </main>

        <footer className="border-t border-gray-100 px-6 py-4 bg-white flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 0 || isSubmitting || isSaved}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-[14px] font-semibold"
          >
            <ChevronRight className="w-4 h-4" /> חזרה
          </button>

          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-[14px] font-semibold">
              {isSaved ? "סגור" : "ביטול"}
            </button>

            {currentStep < STEPS.length - 1 ? (
              <button type="button" onClick={handleNext} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] text-[14px] font-bold">
                המשך <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={saveTreatment}
                disabled={isSubmitting || isSaved}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-[14px] font-bold"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSubmitting ? "שומר..." : isSaved ? "נשמר" : "שמור לתיק רפואי"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
      <p className="text-gray-500 text-[12px] font-semibold mb-1">{label}</p>
      <p className="text-gray-900 text-[14px] whitespace-pre-wrap leading-6">{value}</p>
    </div>
  );
}
