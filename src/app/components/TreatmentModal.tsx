import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  X,
  Stethoscope,
  Plus,
  Trash2,
  Check,
  FileText,
  Pill,
  TestTube,
  ClipboardList,
  Thermometer,
  Weight,
  Heart,
  Activity,
  Save,
  AlertTriangle,
  Dog,
  Cat,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Pencil,
  MessageSquare,
  Calendar,
  Loader2,
} from "lucide-react";
import { useMedicalStore } from "../data/MedicalStore";
import { PaymentModal } from "./PaymentModal";
import { AnesthesiaConsentModal } from "./AnesthesiaConsentModal";
import { getStaffLabel, canPerformTreatment } from "../data/staffAuth";
import { useLabStore } from "../data/LabStore";
import { VISIT_TYPES, CLINIC_VISIT_TYPE_KEYS } from "../data/categoryConfig";

// ── Zod Schema (Validation Rules) ──
const treatmentSchema = z.object({
  visitType: z.string().min(1, "יש לבחור סוג ביקור"),
  vitals: z.object({
    temperature: z.string().min(1, "חובה להזין טמפרטורה"),
    weight: z.string().min(1, "חובה להזין משקל"),
    heartRate: z.string().min(1, "חובה להזין קצב לב"),
    respiratoryRate: z.string().min(1, "חובה להזין קצב נשימה"),
  }),
  diagnoses: z
    .array(z.object({ text: z.string() }))
    .refine((data) => data.some((d) => d.text.trim() !== ""), {
      message: "יש להזין לפחות אבחנה אחת",
    }),
  treatments: z
    .array(z.object({ name: z.string(), details: z.string().optional() }))
    .refine((data) => data.some((t) => t.name.trim() !== ""), {
      message: "יש להזין לפחות טיפול אחד",
    }),
  prescriptions: z.array(
    z.object({
      medication: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      duration: z.string(),
    })
  ),
  labResults: z.array(
    z.object({
      testName: z.string(),
      result: z.string(),
      normal: z.string(),
      status: z.enum(["normal", "abnormal", "pending"]),
    })
  ),
  notes: z.string().optional(),
  followUp: z.string().optional(),
});

type TreatmentFormValues = z.infer<typeof treatmentSchema>;

// ── Config ──
const visitTypes = CLINIC_VISIT_TYPE_KEYS.map((id) => ({ id, ...VISIT_TYPES[id] }));

const STEPS = [
  { id: "visitType", label: "סוג ביקור", icon: ClipboardList },
  { id: "vitals", label: "מדדים חיוניים", icon: Thermometer },
  { id: "diagnosis", label: "אבחנות", icon: ClipboardList },
  { id: "treatment", label: "טיפולים", icon: Stethoscope },
  { id: "prescriptions", label: "מרשמים", icon: Pill },
  { id: "labs", label: "בדיקות מעבדה", icon: TestTube },
  { id: "notes", label: "הערות ומעקב", icon: MessageSquare },
  { id: "summary", label: "סיכום ואישור", icon: FileText },
] as const;

// ── Props ──
interface TreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  petName: string;
  petSpecies: "dog" | "cat" | string;
  ownerName: string;
  patientId?: number;
  onSave?: (data: any) => void;
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
  const { addVisit } = useMedicalStore();
  const { addLabOrder } = useLabStore();
  const currentVet = getStaffLabel();

  // Component State
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showAnesthesiaConsent, setShowAnesthesiaConsent] = useState(false);

  // React Hook Form Setup
  const {
    register,
    control,
    trigger,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TreatmentFormValues>({
    resolver: zodResolver(treatmentSchema),
    mode: "onChange",
    defaultValues: {
      visitType: "",
      vitals: { temperature: "", weight: "", heartRate: "", respiratoryRate: "" },
      diagnoses: [{ text: "" }],
      treatments: [{ name: "", details: "" }],
      prescriptions: [{ medication: "", dosage: "", frequency: "", duration: "" }],
      labResults: [{ testName: "", result: "", normal: "", status: "pending" }],
      notes: "",
      followUp: "",
    },
  });

  // Dynamic Array Fields
  const { fields: diagFields, append: appendDiag, remove: removeDiag } = useFieldArray({ control, name: "diagnoses" });
  const { fields: treatFields, append: appendTreat, remove: removeTreat } = useFieldArray({ control, name: "treatments" });
  const { fields: prescFields, append: appendPresc, remove: removePresc } = useFieldArray({ control, name: "prescriptions" });
  const { fields: labFields, append: appendLab, remove: removeLab } = useFieldArray({ control, name: "labResults" });

  const formValues = watch();
  const PetIcon = petSpecies === "cat" ? Cat : Dog;

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setIsSaved(false);
      reset();
    }
  }, [isOpen, reset]);

  if (!isOpen) return null;

  // ── Step Navigation Logic ──
  const handleNext = async () => {
    let isValid = false;
    
    // trigger() בודק רק את השדות של השלב הנוכחי
    switch (currentStep) {
      case 0:
        isValid = await trigger("visitType");
        break;
      case 1:
        isValid = await trigger("vitals");
        break;
      case 2:
        isValid = await trigger("diagnoses");
        break;
      case 3:
        isValid = await trigger("treatments");
        break;
      default:
        // שלבים 4,5,6 הם רשות
        isValid = true;
    }

    if (isValid && currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
  };

  const goToStep = async (step: number) => {
    if (step < currentStep || currentStep === STEPS.length - 1) {
      setCurrentStep(step);
    } else {
      // אם מנסים לקפוץ קדימה מהתפריט העליון, נוודא שהשלב הנוכחי תקין
      const isValid = await trigger();
      if (isValid) setCurrentStep(step);
    }
  };

  // ── Save Logic ──
  const onSubmit = async (data: TreatmentFormValues) => {
    if (!patientId) return;

    try {
      // ניקוי נתונים ריקים ממערכים
      const finalDiagnoses = data.diagnoses.filter((d) => d.text.trim());
      const finalTreatments = data.treatments.filter((t) => t.name.trim());
      const finalPrescriptions = data.prescriptions.filter((p) => p.medication.trim());
      const finalLabs = data.labResults.filter((l) => l.testName.trim());

      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
      
      const diagTexts = finalDiagnoses.map((d) => d.text).join(", ");
      const treatTexts = finalTreatments.map((t) => t.name).join(", ");
      const prescTexts = finalPrescriptions.map((p) => `${p.medication} ${p.dosage}`).join(", ");
      
      const descParts = [
        diagTexts && `אבחנה: ${diagTexts}`,
        treatTexts && `טיפולים: ${treatTexts}`,
        prescTexts && `מרשמים: ${prescTexts}`,
        data.notes && data.notes,
      ].filter(Boolean);

      const visitTypeLabel = visitTypes.find((v) => v.id === data.visitType)?.label || "בדיקה כללית";
      
      // שמירה אסינכרונית ל-MedicalStore
      await addVisit({
        patientId,
        date: dateStr,
        vetName: currentVet,
        reason: visitTypeLabel,
        diagnosis: diagTexts || "לא צוין",
        treatment: treatTexts || "לא צוין",
        notes: descParts.join(" | ") || "ביקור רפואי",
        attachments: 0,
      });

      // שמירה אסינכרונית ל-LabStore
      for (const lab of finalLabs) {
        const hasResult = lab.result.trim() !== "";
        await addLabOrder({
          patientId,
          petName,
          testName: lab.testName,
          category: "other",
          status: hasResult ? (lab.status === "pending" ? "in-progress" : "completed") : "ordered",
          orderedDate: dateStr,
          orderedBy: currentVet,
          results: hasResult ? lab.result : undefined,
          normalRange: lab.normal.trim() || undefined,
          resultValue: hasResult ? lab.result : undefined,
          resultStatus: lab.status !== "pending" ? lab.status : undefined,
          completedDate: lab.status !== "pending" ? dateStr : undefined,
        });
      }

      onSave?.(data);
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Save failed", error);
    }
  };

  const statusLabels: Record<string, { label: string; cls: string }> = {
    normal: { label: "תקין", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
    abnormal: { label: "חריג", cls: "bg-red-50 text-red-600 border-red-200" },
    pending: { label: "ממתין", cls: "bg-amber-50 text-amber-600 border-amber-200" },
  };

  const inputCls = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-[14px]";
  const inputErrorCls = "border-red-500 focus:ring-red-500/20 focus:border-red-500";

  const renderSummarySection = (title: string, stepIdx: number, icon: React.ReactNode, content: React.ReactNode, isEmpty?: boolean) => (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-gray-800 text-[14px]" style={{ fontWeight: 600 }}>{title}</span>
        </div>
        <button onClick={() => goToStep(stepIdx)} className="flex items-center gap-1 text-[#1e40af] text-[12px] hover:text-[#1e3a8a] cursor-pointer transition-colors" style={{ fontWeight: 500 }}>
          <Pencil className="w-3.5 h-3.5" />
          ערוך
        </button>
      </div>
      <div className="px-4 py-3">
        {isEmpty ? <p className="text-gray-500 font-medium text-[13px]">לא הוזן</p> : content}
      </div>
    </div>
  );

  const canTreat = canPerformTreatment();
  
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden flex flex-col" style={{ maxHeight: "92vh", fontFamily: "'Heebo', sans-serif" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
        
        {/* ── Header ── */}
        <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 rounded-xl p-2">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white text-[17px]" style={{ fontWeight: 600 }}>{canTreat ? "טיפול בתיק רפואי" : "צפייה בתיק רפואי"}</h3>
              <div className="flex items-center gap-2 text-white/60 text-[12px]">
                <PetIcon className="w-3.5 h-3.5" />
                <span>{petName}</span>
                <span>•</span>
                <span>בעלים: {ownerName}</span>
                <span>•</span>
                <span>מטפל/ת: {currentVet}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white cursor-pointer p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Progress Steps ── */}
        {canTreat && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {STEPS.map((step, idx) => {
              const SIcon = step.icon;
              const isActive = idx === currentStep;
              return (
                <div key={step.id} className="flex items-center">
                  <button
                    onClick={() => goToStep(idx)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all ${
                      isActive ? "bg-[#1e40af] text-white shadow-sm" : idx < currentStep ? "bg-emerald-50 text-emerald-600 cursor-pointer hover:bg-emerald-100" : "bg-white text-gray-500 font-medium hover:bg-gray-100 cursor-pointer"
                    }`}
                    style={{ fontWeight: isActive ? 600 : 400 }}
                  >
                    {idx < currentStep ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <SIcon className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{idx + 1}</span>
                  </button>
                  {idx < STEPS.length - 1 && <ChevronLeft className={`w-3.5 h-3.5 mx-0.5 shrink-0 ${idx < currentStep ? "text-emerald-300" : "text-gray-200"}`} />}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* ── Content ── */}
        {canTreat ? (
        <div className="flex-1 overflow-y-auto p-6">
          {isSaved ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
                <Check className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-gray-900 text-[20px] mb-2" style={{ fontWeight: 700 }}>התיק הרפואי עודכן בהצלחה!</h3>
              <p className="text-gray-500 text-[14px]">כל הנתונים נשמרו בתיק של {petName}</p>
            </div>
          ) : (
            <form id="treatment-form" onSubmit={handleSubmit(onSubmit)}>
              
              {/* ─── Step 0: Visit Type ─── */}
              {currentStep === 0 && (
                <div className="space-y-5">
                  <div className="text-center mb-6">
                    <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>מהו סוג הביקור?</h4>
                    <p className="text-gray-500 font-medium text-[14px]">בחרו את סוג הטיפול עבור {petName}</p>
                    {errors.visitType && <p className="text-red-500 text-sm mt-2">{errors.visitType.message}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                    {visitTypes.map((vt) => {
                      const VTIcon = vt.icon;
                      const isSelected = formValues.visitType === vt.id;
                      return (
                        <button
                          key={vt.id}
                          type="button"
                          onClick={() => { setValue("visitType", vt.id, { shouldValidate: true }); }}
                          className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-all cursor-pointer text-right ${
                            isSelected ? vt.activeColor + " shadow-md" : errors.visitType ? "border-red-300" : "border-gray-150 bg-white hover:border-gray-300 hover:shadow-sm"
                          }`}
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? vt.color.split(" ").slice(0, 1).join(" ") : "bg-gray-50"}`}>
                            <VTIcon className={`w-5 h-5 ${isSelected ? vt.color.split(" ")[1] : "text-gray-500 font-medium"}`} />
                          </div>
                          <span className={`text-[14px] block ${isSelected ? "text-gray-900" : "text-gray-600"}`} style={{ fontWeight: isSelected ? 700 : 500 }}>{vt.label}</span>
                          {isSelected && <Check className="w-5 h-5 text-emerald-500 mr-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ─── Step 1: Vitals ─── */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <div className="mb-2">
                    <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>מדדים חיוניים</h4>
                    <p className="text-gray-500 font-medium text-[14px]">מלאו את כל מדדי החיוניות של {petName}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                        <Thermometer className="w-4 h-4 text-red-400" /> טמפרטורה (°C) <span className="text-red-400">*</span>
                      </label>
                      <input type="number" step="0.1" {...register("vitals.temperature")} className={`${inputCls} ${errors.vitals?.temperature ? inputErrorCls : ""}`} placeholder="38.5" />
                      {errors.vitals?.temperature && <p className="text-red-500 text-[12px] mt-1">{errors.vitals.temperature.message}</p>}
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                        <Weight className="w-4 h-4 text-blue-400" /> משקל (ק״ג) <span className="text-red-400">*</span>
                      </label>
                      <input type="number" step="0.1" {...register("vitals.weight")} className={`${inputCls} ${errors.vitals?.weight ? inputErrorCls : ""}`} placeholder="32.0" />
                      {errors.vitals?.weight && <p className="text-red-500 text-[12px] mt-1">{errors.vitals.weight.message}</p>}
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                        <Heart className="w-4 h-4 text-pink-400" /> קצב לב <span className="text-red-400">*</span>
                      </label>
                      <input type="number" {...register("vitals.heartRate")} className={`${inputCls} ${errors.vitals?.heartRate ? inputErrorCls : ""}`} placeholder="80" />
                      {errors.vitals?.heartRate && <p className="text-red-500 text-[12px] mt-1">{errors.vitals.heartRate.message}</p>}
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                        <Activity className="w-4 h-4 text-emerald-400" /> קצב נשימה <span className="text-red-400">*</span>
                      </label>
                      <input type="number" {...register("vitals.respiratoryRate")} className={`${inputCls} ${errors.vitals?.respiratoryRate ? inputErrorCls : ""}`} placeholder="20" />
                      {errors.vitals?.respiratoryRate && <p className="text-red-500 text-[12px] mt-1">{errors.vitals.respiratoryRate.message}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Step 2: Diagnosis ─── */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>אבחנות</h4>
                      <p className="text-gray-500 font-medium text-[14px]">רשמו את האבחנות שנמצאו בביקור</p>
                    </div>
                    <button type="button" onClick={() => appendDiag({ text: "" })} className="flex items-center gap-1.5 text-[#1e40af] text-[13px] hover:text-[#1e3a8a] cursor-pointer" style={{ fontWeight: 500 }}>
                      <Plus className="w-4 h-4" /> הוסף אבחנה
                    </button>
                  </div>
                  {errors.diagnoses?.root?.message && (
                    <div className="bg-red-50 text-red-600 text-[13px] px-3 py-2 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {errors.diagnoses.root.message}
                    </div>
                  )}
                  {diagFields.map((field, idx) => (
                    <div key={field.id} className="flex items-start gap-3">
                      <span className="shrink-0 w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-[12px] mt-1.5" style={{ fontWeight: 700 }}>{idx + 1}</span>
                      <div className="flex-1">
                        <input {...register(`diagnoses.${idx}.text`)} className={`${inputCls} ${errors.diagnoses?.[idx]?.text ? inputErrorCls : ""}`} placeholder="לדוגמה: דלקת אוזניים חיצונית..." />
                      </div>
                      {diagFields.length > 1 && (
                        <button type="button" onClick={() => removeDiag(idx)} className="text-gray-300 hover:text-red-400 cursor-pointer transition-colors mt-2">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Step 3: Treatments ─── */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>טיפולים</h4>
                      <p className="text-gray-500 font-medium text-[14px]">תעדו את הטיפולים שבוצעו</p>
                    </div>
                    <button type="button" onClick={() => appendTreat({ name: "", details: "" })} className="flex items-center gap-1.5 text-[#1e40af] text-[13px] hover:text-[#1e3a8a] cursor-pointer" style={{ fontWeight: 500 }}>
                      <Plus className="w-4 h-4" /> הוסף טיפול
                    </button>
                  </div>
                  {errors.treatments?.root?.message && (
                    <div className="bg-red-50 text-red-600 text-[13px] px-3 py-2 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> {errors.treatments.root.message}
                    </div>
                  )}
                  {treatFields.map((field, idx) => (
                    <div key={field.id} className="bg-gray-50/70 border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>טיפול #{idx + 1}</span>
                        {treatFields.length > 1 && (
                          <button type="button" onClick={() => removeTreat(idx)} className="text-gray-300 hover:text-red-400 cursor-pointer transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <input {...register(`treatments.${idx}.name`)} className={`${inputCls} ${errors.treatments?.[idx]?.name ? inputErrorCls : ""}`} placeholder="שם הטיפול (לדוגמה: ניקוי אבנית, תפירה...)" />
                      <textarea {...register(`treatments.${idx}.details`)} rows={2} className={`${inputCls} resize-none`} placeholder="פירוט הטיפול, הרדמה, חומרים בשימוש..." />
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Step 4: Prescriptions ─── */}
              {currentStep === 4 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>מרשמים</h4>
                      <p className="text-gray-500 font-medium text-[14px]">הוסיפו מרשמים לתרופות (אופציונלי)</p>
                    </div>
                    <button type="button" onClick={() => appendPresc({ medication: "", dosage: "", frequency: "", duration: "" })} className="flex items-center gap-1.5 text-[#1e40af] text-[13px] hover:text-[#1e3a8a] cursor-pointer" style={{ fontWeight: 500 }}>
                      <Plus className="w-4 h-4" /> הוסף תרופה
                    </button>
                  </div>
                  {prescFields.map((field, idx) => (
                    <div key={field.id} className="bg-gray-50/70 border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>
                          <Pill className="w-4 h-4 text-indigo-400" /> תרופה #{idx + 1}
                        </span>
                        {prescFields.length > 1 && (
                          <button type="button" onClick={() => removePresc(idx)} className="text-gray-300 hover:text-red-400 cursor-pointer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input {...register(`prescriptions.${idx}.medication`)} className={inputCls} placeholder="שם התרופה" />
                        <input {...register(`prescriptions.${idx}.dosage`)} className={inputCls} placeholder="מינון (לדוגמה: 250mg)" />
                        <input {...register(`prescriptions.${idx}.frequency`)} className={inputCls} placeholder="תדירות (לדוגמה: 2 פעמים ביום)" />
                        <input {...register(`prescriptions.${idx}.duration`)} className={inputCls} placeholder="משך (לדוגמה: 10 ימים)" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Step 5: Lab Results ─── */}
              {currentStep === 5 && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>בדיקות מעבדה</h4>
                      <p className="text-gray-500 font-medium text-[14px]">הזינו תוצאות בדיקות מעבדה (אופציונלי)</p>
                    </div>
                    <button type="button" onClick={() => appendLab({ testName: "", result: "", normal: "", status: "pending" })} className="flex items-center gap-1.5 text-[#1e40af] text-[13px] hover:text-[#1e3a8a] cursor-pointer" style={{ fontWeight: 500 }}>
                      <Plus className="w-4 h-4" /> הוסף בדיקה
                    </button>
                  </div>
                  {labFields.map((field, idx) => {
                    const currentStatus = formValues.labResults[idx]?.status || "pending";
                    return (
                      <div key={field.id} className="bg-gray-50/70 border border-gray-100 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-gray-700 text-[13px]" style={{ fontWeight: 600 }}>
                            <TestTube className="w-4 h-4 text-teal-400" /> בדיקה #{idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              {(["normal", "abnormal", "pending"] as const).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setValue(`labResults.${idx}.status`, s)}
                                  className={`px-2.5 py-1 rounded-md text-[13px] border transition-all cursor-pointer ${currentStatus === s ? statusLabels[s].cls : "border-gray-200 text-gray-500 font-medium bg-white"}`}
                                  style={{ fontWeight: currentStatus === s ? 600 : 400 }}
                                >
                                  {statusLabels[s].label}
                                </button>
                              ))}
                            </div>
                            {labFields.length > 1 && (
                              <button type="button" onClick={() => removeLab(idx)} className="text-gray-300 hover:text-red-400 cursor-pointer">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input {...register(`labResults.${idx}.testName`)} className={inputCls} placeholder="שם הבדיקה" />
                          <input {...register(`labResults.${idx}.result`)} className={inputCls} placeholder="תוצאה" />
                          <input {...register(`labResults.${idx}.normal`)} className={inputCls} placeholder="טווח נורמלי" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── Step 6: Notes ─── */}
              {currentStep === 6 && (
                <div className="space-y-5">
                  <div className="mb-2">
                    <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>הערות ומעקב</h4>
                    <p className="text-gray-500 font-medium text-[14px]">הוסיפו הערות כלליות והנחיות למעקב (אופציונלי)</p>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                      <FileText className="w-4 h-4 text-gray-500 font-medium" /> הערות כלליות
                    </label>
                    <textarea {...register("notes")} rows={4} className={`${inputCls} resize-none`} placeholder="הערות, תצפיות, המלצות לבעלים..." />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-gray-700 text-[13px] mb-2" style={{ fontWeight: 500 }}>
                      <Calendar className="w-4 h-4 text-amber-400" /> הנחיות למעקב
                    </label>
                    <textarea {...register("followUp")} rows={3} className={`${inputCls} resize-none`} placeholder="ביקור חוזר בעוד שבועיים, בדיקת דם חוזרת, מעקב אחרי תרופות..." />
                  </div>
                </div>
              )}

              {/* ─── Step 7: Summary ─── */}
              {currentStep === 7 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <h4 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>סיכום הביקור</h4>
                    <p className="text-gray-500 font-medium text-[14px]">בדקו את כל הפרטים לפני שמירה. לחצו "ערוך" כדי לתקן כל סעיף.</p>
                  </div>

                  <div className="bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const vt = visitTypes.find((v) => v.id === formValues.visitType);
                        const VTIcon = vt?.icon || Stethoscope;
                        return (
                          <>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${vt?.color.split(" ").slice(0, 1).join(" ") || "bg-gray-100"}`}>
                              <VTIcon className={`w-5 h-5 ${vt?.color.split(" ")[1] || "text-gray-500"}`} />
                            </div>
                            <div>
                              <p className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>{vt?.label || "לא נבחר"}</p>
                              <p className="text-gray-500 text-[12px]">מטפל/ת: {currentVet}</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <button type="button" onClick={() => goToStep(0)} className="flex items-center gap-1 text-[#1e40af] text-[12px] hover:text-[#1e3a8a] cursor-pointer" style={{ fontWeight: 500 }}>
                      <Pencil className="w-3.5 h-3.5" /> ערוך
                    </button>
                  </div>

                  {renderSummarySection(
                    "מדדים חיוניים", 1, <Thermometer className="w-4 h-4 text-red-400" />,
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="text-center"><p className="text-gray-500 font-medium text-[13px]">טמפרטורה</p><p className="text-gray-900 text-[16px]" style={{ fontWeight: 700 }}>{formValues.vitals.temperature || "—"}°C</p></div>
                      <div className="text-center"><p className="text-gray-500 font-medium text-[13px]">משקל</p><p className="text-gray-900 text-[16px]" style={{ fontWeight: 700 }}>{formValues.vitals.weight || "—"} ק״ג</p></div>
                      <div className="text-center"><p className="text-gray-500 font-medium text-[13px]">קצב לב</p><p className="text-gray-900 text-[16px]" style={{ fontWeight: 700 }}>{formValues.vitals.heartRate || "—"} bpm</p></div>
                      <div className="text-center"><p className="text-gray-500 font-medium text-[13px]">קצב נשימה</p><p className="text-gray-900 text-[16px]" style={{ fontWeight: 700 }}>{formValues.vitals.respiratoryRate || "—"} /דקה</p></div>
                    </div>
                  )}

                  {renderSummarySection(
                    "אבחנות", 2, <ClipboardList className="w-4 h-4 text-amber-500" />,
                    <div className="flex flex-wrap gap-2">
                      {formValues.diagnoses.filter((d) => d.text.trim()).map((d, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 text-[13px]" style={{ fontWeight: 500 }}>
                          <span className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center text-[13px]" style={{ fontWeight: 700 }}>{idx + 1}</span> {d.text}
                        </span>
                      ))}
                    </div>,
                    !formValues.diagnoses.some((d) => d.text.trim())
                  )}

                  {renderSummarySection(
                    "טיפולים", 3, <Stethoscope className="w-4 h-4 text-blue-500" />,
                    <div className="space-y-2">
                      {formValues.treatments.filter((t) => t.name.trim()).map((t, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center text-[13px] mt-0.5 shrink-0" style={{ fontWeight: 700 }}>{idx + 1}</span>
                          <div>
                            <p className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{t.name}</p>
                            {t.details && <p className="text-gray-500 text-[12px]">{t.details}</p>}
                          </div>
                        </div>
                      ))}
                    </div>,
                    !formValues.treatments.some((t) => t.name.trim())
                  )}
                </div>
              )}
            </form>
          )}
        </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-gray-900 text-[18px] font-semibold mb-2">הצגה בלבד</h3>
            <p className="text-gray-500 text-[14px] mb-6">רק וטרינר או אחות יכולים לערוך את התיק הרפואי</p>
            <button
              onClick={() => setShowAnesthesiaConsent(true)}
              className="px-6 py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-colors cursor-pointer text-[14px] font-medium border border-amber-200"
            >
              <FileText className="w-4 h-4 inline mr-2" /> חתימת הסכמת הרדמה
            </button>
          </div>
        </div>
        )}

        {/* ── Footer ── */}
        {!isSaved && canTreat && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50/30">
            {currentStep === STEPS.length - 1 ? (
              <>
                <button
                  type="submit"
                  form="treatment-form"
                  disabled={isSubmitting}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ fontWeight: 600 }}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSubmitting ? "שומר..." : "שמור ועדכן תיק רפואי"}
                </button>
                <button onClick={() => setShowPayment(true)} type="button" className="flex-1 bg-gradient-to-l from-[#1e40af] to-[#2563eb] hover:from-[#1e3a8a] hover:to-[#1e40af] text-white py-3 rounded-xl transition-all cursor-pointer text-[14px] shadow-md shadow-blue-500/15 flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                  <CircleDollarSign className="w-4 h-4" /> עבור לתשלום
                </button>
              </>
            ) : (
              <button onClick={handleNext} type="button" className="flex-1 bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                {currentStep === STEPS.length - 2 ? "עבור לסיכום" : "המשך"} <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {currentStep > 0 && (
              <button onClick={handleBack} type="button" className="px-6 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                <ChevronRight className="w-4 h-4" /> חזרה
              </button>
            )}
            <button onClick={() => setShowAnesthesiaConsent(true)} type="button" className="px-4 py-3 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-amber-700 transition-colors cursor-pointer text-[13px] flex items-center gap-1.5 shrink-0" style={{ fontWeight: 500 }}>
              <FileText className="w-4 h-4" /> הרדמה
            </button>
            <button onClick={onClose} type="button" className="px-6 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>
              ביטול
            </button>
          </div>
        )}
        {!isSaved && !canTreat && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50/30">
            <button onClick={() => setShowAnesthesiaConsent(true)} type="button" className="px-4 py-3 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-amber-700 transition-colors cursor-pointer text-[13px] flex items-center gap-1.5 shrink-0" style={{ fontWeight: 500 }}>
              <FileText className="w-4 h-4" /> הרדמה
            </button>
            <button onClick={onClose} type="button" className="ml-auto px-6 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>
              סגור
            </button>
          </div>
        )}
      </div>

      {showPayment && (
        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          summary={{
            visitType: formValues.visitType,
            visitTypeLabel: visitTypes.find((v) => v.id === formValues.visitType)?.label || "ביקור",
            treatmentCount: formValues.treatments.filter((t) => t.name.trim()).length,
            prescriptionCount: formValues.prescriptions.filter((p) => p.medication.trim()).length,
            labCount: formValues.labResults.filter((l) => l.testName.trim()).length,
            petName,
            ownerName,
            vet: currentVet,
          }}
        />
      )}
      {showAnesthesiaConsent && <AnesthesiaConsentModal petName={petName} onClose={() => setShowAnesthesiaConsent(false)} />}
    </div>
  );
}