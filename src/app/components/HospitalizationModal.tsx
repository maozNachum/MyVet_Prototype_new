import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { useMedicalStore, type UrgencyLevel } from "../data/MedicalStore";

export type HospitalizationRecord = {
  hospitalization_id: number;
  pet_id: number;
  owner_id: string | null;
  visit_id: number | null;
  department: string | null;
  cage_or_room: string | null;
  reason: string | null;
  status: "active" | "discharged" | "cancelled" | string;
  severity: UrgencyLevel | string | null;
  admitted_at: string | null;
  expected_discharge_at: string | null;
  discharged_at: string | null;
  vet_name: string | null;
  discharge_summary: string | null;
  notes: string | null;
};

type HospitalizationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: number;
  ownerId: string;
  petName: string;
  ownerName: string;
  activeHospitalization: HospitalizationRecord | null;
  onSaved: () => Promise<void> | void;
};

type FormErrors = Partial<Record<"department" | "reason" | "vetName" | "dischargeSummary", string>>;

const severityOptions = [
  { value: "normal", label: "רגיל" },
  { value: "serious", label: "חמור" },
  { value: "critical", label: "קריטי" },
] as const;

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nowForInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatDateTime(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function HospitalizationModal({
  isOpen,
  onClose,
  patientId,
  ownerId,
  petName,
  ownerName,
  activeHospitalization,
  onSaved,
}: HospitalizationModalProps) {
  const { addVisit, updateVisit } = useMedicalStore();
  const [department, setDepartment] = useState("פנימית");
  const [cageOrRoom, setCageOrRoom] = useState("");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState<UrgencyLevel>("normal");
  const [vetName, setVetName] = useState("ד״ר יוסי כהן");
  const [admittedAt, setAdmittedAt] = useState(nowForInput());
  const [expectedDischargeAt, setExpectedDischargeAt] = useState("");
  const [notes, setNotes] = useState("");
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const isDischargeMode = Boolean(activeHospitalization);

  useEffect(() => {
    if (!isOpen) return;

    setErrors({});
    setIsSaving(false);
    setDischargeSummary("");

    if (activeHospitalization) {
      setDepartment(activeHospitalization.department || "פנימית");
      setCageOrRoom(activeHospitalization.cage_or_room || "");
      setReason(activeHospitalization.reason || "");
      setSeverity((activeHospitalization.severity as UrgencyLevel) || "normal");
      setVetName(activeHospitalization.vet_name || "ד״ר יוסי כהן");
      setNotes(activeHospitalization.notes || "");
      return;
    }

    setDepartment("פנימית");
    setCageOrRoom("");
    setReason("");
    setSeverity("normal");
    setVetName("ד״ר יוסי כהן");
    setAdmittedAt(nowForInput());
    setExpectedDischargeAt("");
    setNotes("");
  }, [isOpen, activeHospitalization]);

  const modalTitle = useMemo(() => {
    return isDischargeMode ? "שחרור מאשפוז" : "פתיחת אשפוז";
  }, [isDischargeMode]);

  if (!isOpen) return null;

  const validateOpen = () => {
    const nextErrors: FormErrors = {};
    if (!department.trim()) nextErrors.department = "חובה להזין מחלקה";
    if (!reason.trim()) nextErrors.reason = "חובה להזין סיבת אשפוז";
    if (!vetName.trim()) nextErrors.vetName = "חובה להזין רופא אחראי";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateDischarge = () => {
    const nextErrors: FormErrors = {};
    if (!dischargeSummary.trim()) nextErrors.dischargeSummary = "חובה להזין סיכום שחרור קצר";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleOpenHospitalization = async () => {
    if (!validateOpen()) return;
    setIsSaving(true);
    let createdVisitId: number | null = null;
    let hospitalizationSaved = false;

    try {
      const admittedIso = toIsoOrNull(admittedAt) || new Date().toISOString();
      const expectedIso = toIsoOrNull(expectedDischargeAt);

      const visit = await addVisit({
        patientId,
        date: admittedIso,
        vetName,
        reason: `אשפוז: ${reason.trim()}`,
        diagnosis: "",
        treatment: "פתיחת אשפוז והשגחה במחלקה",
        notes,
        attachments: 0,
        visitType: "hospitalization",
        urgencyLevel: severity,
        chiefComplaint: reason.trim(),
        finalDiagnosis: "",
        followUpRequired: Boolean(expectedIso),
        followUpNotes: expectedIso ? `צפי שחרור: ${formatDateTime(expectedIso)}` : "",
        entryData: {
          entryType: "hospitalization",
          label: "אשפוז",
          hospitalizationStatus: "active",
          department: department.trim(),
          cageOrRoom: cageOrRoom.trim(),
          reason: reason.trim(),
          severity,
          admittedAt: admittedIso,
          expectedDischargeAt: expectedIso,
        },
      }, { showSuccessToast: false });

      if (!visit) throw new Error("הביקור הרפואי לא נשמר");
      createdVisitId = visit.id;

      const { data, error } = await supabase
        .from("hospitalizations")
        .insert({
          pet_id: patientId,
          owner_id: ownerId || null,
          visit_id: visit.id,
          department: department.trim(),
          cage_or_room: cageOrRoom.trim() || null,
          reason: reason.trim(),
          status: "active",
          severity,
          admitted_at: admittedIso,
          expected_discharge_at: expectedIso,
          vet_name: vetName.trim(),
          notes: notes.trim() || null,
        })
        .select("*")
        .single();

      if (error) throw error;
      hospitalizationSaved = true;

      await updateVisit(visit.id, {
        entryData: {
          ...(visit.entryData || {}),
          hospitalizationId: data.hospitalization_id,
        },
      });

      toast.success("האשפוז נפתח ונשמר בתיק הרפואי");
      await onSaved();
      onClose();
    } catch (error: any) {
      console.error("Failed opening hospitalization", error);
      let rollbackFailed = false;
      if (createdVisitId && !hospitalizationSaved) {
        const { error: rollbackError } = await supabase
          .from("medical_visits")
          .delete()
          .eq("visit_id", createdVisitId);
        rollbackFailed = Boolean(rollbackError);
      }
      toast.error(
        rollbackFailed
          ? "האשפוז לא נפתח, אך נשמר ביקור חלקי בתיק. בדקו את התיק לפני ניסיון נוסף."
          : error?.message || "לא הצלחנו לפתוח אשפוז",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDischargeHospitalization = async () => {
    if (!activeHospitalization) return;
    if (!validateDischarge()) return;
    setIsSaving(true);
    let hospitalizationUpdated = false;
    let persistenceComplete = false;

    try {
      const dischargeIso = new Date().toISOString();
      const { error } = await supabase
        .from("hospitalizations")
        .update({
          status: "discharged",
          discharged_at: dischargeIso,
          discharge_summary: dischargeSummary.trim(),
          notes: notes.trim() || activeHospitalization.notes || null,
        })
        .eq("hospitalization_id", activeHospitalization.hospitalization_id);

      if (error) throw error;
      hospitalizationUpdated = true;

      const dischargeVisit = await addVisit({
        patientId,
        date: dischargeIso,
        vetName: vetName.trim() || activeHospitalization.vet_name || "צוות המרפאה",
        reason: "שחרור מאשפוז",
        diagnosis: "",
        treatment: dischargeSummary.trim(),
        notes: notes.trim(),
        attachments: 0,
        visitType: "hospitalization_discharge",
        urgencyLevel: "normal",
        chiefComplaint: "שחרור מאשפוז",
        finalDiagnosis: "",
        followUpRequired: false,
        followUpNotes: "",
        entryData: {
          entryType: "hospitalization_discharge",
          label: "שחרור מאשפוז",
          hospitalizationId: activeHospitalization.hospitalization_id,
          dischargedAt: dischargeIso,
          dischargeSummary: dischargeSummary.trim(),
        },
      }, { showSuccessToast: false });
      if (!dischargeVisit) throw new Error("סיכום השחרור לא נשמר בתיק הרפואי");
      persistenceComplete = true;

      toast.success("האשפוז נסגר ונוסף סיכום שחרור לתיק הרפואי");
      await onSaved();
      onClose();
    } catch (error: any) {
      console.error("Failed discharging hospitalization", error);
      let rollbackFailed = false;
      if (hospitalizationUpdated && !persistenceComplete && activeHospitalization) {
        const { error: rollbackError } = await supabase
          .from("hospitalizations")
          .update({
            status: activeHospitalization.status || "active",
            discharged_at: activeHospitalization.discharged_at || null,
            discharge_summary: activeHospitalization.discharge_summary || null,
            notes: activeHospitalization.notes || null,
          })
          .eq("hospitalization_id", activeHospitalization.hospitalization_id);
        rollbackFailed = Boolean(rollbackError);
      }
      toast.error(
        rollbackFailed
          ? "האשפוז עודכן חלקית ללא סיכום רפואי. בדקו את האשפוז לפני ניסיון נוסף."
          : error?.message || "לא הצלחנו לשחרר מאשפוז",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = () => {
    if (isDischargeMode) {
      void handleDischargeHospitalization();
    } else {
      void handleOpenHospitalization();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center px-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-3xl overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-700 to-emerald-600 px-6 py-5 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
              {isDischargeMode ? <CheckCircle2 className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-[20px] font-bold">{modalTitle}</h2>
              <p className="text-white/80 text-[13px] mt-0.5">{petName} · בעלים: {ownerName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="סגור חלון" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {isDischargeMode && activeHospitalization ? (
            <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-[14px] text-gray-700 leading-7">
              <p className="font-bold text-gray-900 mb-1">אשפוז פעיל</p>
              <p>מחלקה: {activeHospitalization.department || "לא צוין"}{activeHospitalization.cage_or_room ? ` · ${activeHospitalization.cage_or_room}` : ""}</p>
              <p>סיבה: {activeHospitalization.reason || "לא צוינה"}</p>
              <p>תאריך פתיחה: {formatDateTime(activeHospitalization.admitted_at)}</p>
            </div>
          ) : (
            <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-[14px] text-gray-700 leading-7">
              <p className="font-bold text-gray-900 mb-1">פתיחת אשפוז תיצור גם רשומה רפואית</p>
              <p>כך האשפוז יופיע גם בדשבורד וגם בהיסטוריה הרפואית של החיה.</p>
            </div>
          )}

          {!isDischargeMode ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-[14px] font-semibold mb-2">מחלקה *</label>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${errors.department ? "border-red-300" : "border-gray-200"}`}
                    placeholder="לדוגמה: פנימית / כירורגיה / טיפול נמרץ"
                  />
                  {errors.department && <p className="text-red-500 text-[12px] mt-1.5 font-semibold">{errors.department}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] font-semibold mb-2">חדר / כלוב</label>
                  <input
                    value={cageOrRoom}
                    onChange={(e) => setCageOrRoom(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="לדוגמה: חדר 2 / כלוב 5"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] font-semibold mb-2">רמת חומרה</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as UrgencyLevel)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-white"
                  >
                    {severityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] font-semibold mb-2">רופא אחראי *</label>
                  <input
                    value={vetName}
                    onChange={(e) => setVetName(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${errors.vetName ? "border-red-300" : "border-gray-200"}`}
                    placeholder="שם הרופא"
                  />
                  {errors.vetName && <p className="text-red-500 text-[12px] mt-1.5 font-semibold">{errors.vetName}</p>}
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] font-semibold mb-2">תאריך ושעת אשפוז</label>
                  <input
                    type="datetime-local"
                    value={admittedAt}
                    onChange={(e) => setAdmittedAt(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] font-semibold mb-2">צפי שחרור</label>
                  <input
                    type="datetime-local"
                    value={expectedDischargeAt}
                    onChange={(e) => setExpectedDischargeAt(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] font-semibold mb-2">סיבת אשפוז *</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none ${errors.reason ? "border-red-300" : "border-gray-200"}`}
                  placeholder="לדוגמה: השגחה לאחר טיפול, נוזלים, מעקב אחרי נשימה..."
                />
                {errors.reason && <p className="text-red-500 text-[12px] mt-1.5 font-semibold">{errors.reason}</p>}
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] font-semibold mb-2">הערות לצוות</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                  placeholder="הנחיות מעקב, אכילה/שתייה, תרופות, מדדים לבדיקה..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 flex gap-3 text-amber-800">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-[14px] leading-7">שחרור מאשפוז יסגור את האשפוז הפעיל ויוסיף רשומת שחרור להיסטוריה הרפואית.</p>
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] font-semibold mb-2">סיכום שחרור *</label>
                <textarea
                  value={dischargeSummary}
                  onChange={(e) => setDischargeSummary(e.target.value)}
                  rows={5}
                  className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none ${errors.dischargeSummary ? "border-red-300" : "border-gray-200"}`}
                  placeholder="מצב בשחרור, טיפול שבוצע, הנחיות להמשך ומעקב נדרש..."
                />
                {errors.dischargeSummary && <p className="text-red-500 text-[12px] mt-1.5 font-semibold">{errors.dischargeSummary}</p>}
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] font-semibold mb-2">הערות פנימיות</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                  placeholder="הערות לצוות בלבד..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer font-semibold"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className={`px-6 py-2.5 rounded-xl text-white transition-colors cursor-pointer font-bold ${isDischargeMode ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"} ${isSaving ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isSaving ? "שומר..." : isDischargeMode ? "שחרר מאשפוז" : "פתח אשפוז"}
          </button>
        </div>
      </div>
    </div>
  );
}
