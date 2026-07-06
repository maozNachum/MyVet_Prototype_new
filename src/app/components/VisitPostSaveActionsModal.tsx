import { useState } from "react";
import {
  Check,
  CreditCard,
  CalendarPlus,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { VisitCheckoutModal } from "./VisitCheckoutModal";
import {
  createOwnerReminder,
  publishPrescriptionToOwner,
  publishTreatmentSummaryToOwner,
} from "../../services/portalNotifications";

type EntryType =
  | "full_exam"
  | "vaccination"
  | "weight_check"
  | "prescription_only"
  | "lab"
  | "follow_up"
  | "note";

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

interface VisitPostSaveActionsModalProps {
  petName: string;
  ownerName: string;
  ownerId?: string;
  patientId?: number;
  visitId: number;
  entryType: EntryType;
  entryLabel: string;
  visitDate: string;
  ownerSummaryDraft: string;
  prescriptions: PrescriptionDraft[];
  labs: LabDraft[];
  onClose: () => void;
}

function todayPlusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function VisitPostSaveActionsModal({
  petName,
  ownerName,
  ownerId,
  patientId,
  visitId,
  entryType,
  entryLabel,
  visitDate,
  ownerSummaryDraft,
  prescriptions,
  labs,
  onClose,
}: VisitPostSaveActionsModalProps) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState(ownerSummaryDraft);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState(todayPlusDays(7));
  const [reminderTitle, setReminderTitle] = useState(`מעקב עבור ${petName}`);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [summarySent, setSummarySent] = useState(false);
  const [reminderCreated, setReminderCreated] = useState(false);
  const [checkoutCreated, setCheckoutCreated] = useState(false);
  const [prescriptionsSent, setPrescriptionsSent] = useState(false);
  const [isSendingPrescriptions, setIsSendingPrescriptions] = useState(false);

  const publishSummary = async () => {
    if (!summaryText.trim()) {
      toast.error("יש לכתוב סיכום לבעלים");
      return;
    }
    if (!ownerId) {
      toast.error("לא נמצא בעלים לשיוך הסיכום");
      return;
    }

    setIsSavingSummary(true);
    try {
      await publishTreatmentSummaryToOwner({
        ownerId,
        petId: patientId || null,
        visitId,
        petName,
        summaryText: summaryText.trim(),
      });
      setSummarySent(true);
      toast.success("הסיכום נשמר לפורטל");
    } catch (error) {
      console.error("Failed publishing owner summary", error);
      toast.error("לא הצלחנו לשמור את הסיכום");
    } finally {
      setIsSavingSummary(false);
    }
  };

  const createReminder = async () => {
    if (!reminderDate) {
      toast.error("יש לבחור תאריך מעקב");
      return;
    }

    setIsSavingReminder(true);
    try {
      if (!ownerId) {
        toast.error("לא נמצא בעלים לשיוך המעקב");
        return;
      }

      await createOwnerReminder({
        ownerId,
        petId: patientId || null,
        visitId,
        title: reminderTitle.trim() || `מעקב עבור ${petName}`,
        message: "מומלץ לבצע מעקב לאחר הביקור.",
        reminderType: "follow_up",
        dueAt: new Date(`${reminderDate}T09:00:00`).toISOString(),
        actionView: "pets",
      });
      setReminderCreated(true);
      toast.success("המעקב נשמר");
    } catch (error) {
      console.error("Failed creating reminder", error);
      toast.error("לא הצלחנו לשמור את המעקב");
    } finally {
      setIsSavingReminder(false);
    }
  };

  const sendPrescriptionsToOwner = async () => {
    if (!ownerId) {
      toast.error("לא נמצא בעלים לשליחת המרשם");
      return;
    }

    if (prescriptions.length === 0) {
      toast.error("אין מרשמים לשליחה");
      return;
    }

    const prescriptionText = [
      `נשלח מרשם עבור ${petName}:`,
      ...prescriptions.map((prescription, index) => {
        const details = [
          prescription.dosage,
          prescription.frequency,
          prescription.duration,
        ]
          .filter(Boolean)
          .join(" · ");
        return `${index + 1}. ${prescription.medication}${details ? ` — ${details}` : ""}`;
      }),
      "יש לפעול לפי ההנחיות שנמסרו על ידי צוות המרפאה.",
    ].join("\n");

    setIsSendingPrescriptions(true);
    try {
      await publishPrescriptionToOwner({
        ownerId,
        petId: patientId || null,
        visitId,
        petName,
        prescriptionText,
      });
      setPrescriptionsSent(true);
      toast.success("המרשם נשלח לפורטל הלקוח");
    } catch (error) {
      console.error("Failed sending prescriptions to owner", error);
      toast.error("לא הצלחנו לשלוח את המרשם לפורטל");
    } finally {
      setIsSendingPrescriptions(false);
    }
  };

  const handleCheckoutSaved = () => {
    setCheckoutCreated(true);
    window.dispatchEvent(new CustomEvent("myvet:payments-updated"));
    toast.success("החיוב נשמר ונוסף לחובות הפתוחים של הבעלים");
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-6 text-center border-b border-gray-100">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-9 h-9 text-emerald-600" />
        </div>
        <h3 className="text-gray-900 text-[22px] font-bold mb-2">
          הרשומה נשמרה
        </h3>
        <p className="text-gray-500 text-[14px]">
          אפשר להמשיך לפעולות נוספות או לחזור לתיק של {petName}.
        </p>
      </div>

      <div
        className={`p-6 grid grid-cols-1 ${prescriptions.length > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}
      >
        <button
          type="button"
          onClick={() => setShowCheckout(true)}
          className={`rounded-2xl border p-5 text-right transition-all hover:shadow-sm ${checkoutCreated ? "border-emerald-200 bg-emerald-50" : "border-blue-100 bg-blue-50/70 hover:bg-blue-50"}`}
        >
          <CreditCard className="w-6 h-6 text-blue-700 mb-3" />
          <h4 className="text-gray-900 text-[16px] font-bold">צור חיוב</h4>
          <p
            className={`text-[13px] mt-1 ${checkoutCreated ? "text-emerald-700 font-semibold" : "text-gray-500"}`}
          >
            {checkoutCreated
              ? "החיוב נשמר ונוסף לחובות הפתוחים"
              : "בחירת שירותים, מוצרים ומחירים לביקור."}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSummaryOpen((value) => !value)}
          className={`rounded-2xl border p-5 text-right transition-all hover:shadow-sm ${summarySent ? "border-emerald-200 bg-emerald-50" : "border-purple-100 bg-purple-50/70 hover:bg-purple-50"}`}
        >
          <FileText className="w-6 h-6 text-purple-700 mb-3" />
          <h4 className="text-gray-900 text-[16px] font-bold">סיכום לבעלים</h4>
          <p
            className={`text-[13px] mt-1 ${summarySent ? "text-emerald-700 font-semibold" : "text-gray-500"}`}
          >
            {summarySent
              ? "הסיכום נשמר לפורטל"
              : "עריכת סיכום קצר שיופיע בפורטל."}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setReminderOpen((value) => !value)}
          className={`rounded-2xl border p-5 text-right transition-all hover:shadow-sm ${reminderCreated ? "border-emerald-200 bg-emerald-50" : "border-amber-100 bg-amber-50/70 hover:bg-amber-50"}`}
        >
          <CalendarPlus className="w-6 h-6 text-amber-700 mb-3" />
          <h4 className="text-gray-900 text-[16px] font-bold">קבע מעקב</h4>
          <p
            className={`text-[13px] mt-1 ${reminderCreated ? "text-emerald-700 font-semibold" : "text-gray-500"}`}
          >
            {reminderCreated ? "המעקב נשמר" : "יצירת תזכורת להמשך טיפול."}
          </p>
        </button>

        {prescriptions.length > 0 && (
          <button
            type="button"
            onClick={() => void sendPrescriptionsToOwner()}
            disabled={isSendingPrescriptions || prescriptionsSent}
            className={`rounded-2xl border p-5 text-right transition-all hover:shadow-sm disabled:cursor-not-allowed ${prescriptionsSent ? "border-emerald-200 bg-emerald-50" : "border-indigo-100 bg-indigo-50/70 hover:bg-indigo-50"}`}
          >
            {isSendingPrescriptions ? (
              <Loader2 className="w-6 h-6 text-indigo-700 mb-3 animate-spin" />
            ) : (
              <FileText className="w-6 h-6 text-indigo-700 mb-3" />
            )}
            <h4 className="text-gray-900 text-[16px] font-bold">שלח מרשם</h4>
            <p
              className={`text-[13px] mt-1 ${prescriptionsSent ? "text-emerald-700 font-semibold" : "text-gray-500"}`}
            >
              {prescriptionsSent
                ? "המרשם נשלח לפורטל"
                : "שליחת המרשמים לבעלים עם התראה."}
            </p>
          </button>
        )}
      </div>

      {(summaryOpen || reminderOpen) && (
        <div className="px-6 pb-6 space-y-4">
          {summaryOpen && (
            <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-gray-900 text-[15px] font-bold">
                  סיכום לבעלים
                </h4>
                <button
                  type="button"
                  onClick={() => setSummaryOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {summarySent && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 text-[13px] font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" /> הסיכום נשמר לפורטל הלקוח
                </div>
              )}
              <textarea
                value={summaryText}
                onChange={(event) => setSummaryText(event.target.value)}
                rows={5}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[14px] resize-none bg-white"
                placeholder="כתוב סיכום קצר וברור לבעלים"
              />
              <button
                type="button"
                onClick={publishSummary}
                disabled={isSavingSummary || summarySent}
                className="px-4 py-2.5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:bg-gray-300 text-[14px] font-bold flex items-center gap-2"
              >
                {isSavingSummary ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}{" "}
                {summarySent ? "הסיכום נשמר" : "שמור לפורטל"}
              </button>
            </section>
          )}

          {reminderOpen && (
            <section className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-gray-900 text-[15px] font-bold">
                  קביעת מעקב
                </h4>
                <button
                  type="button"
                  onClick={() => setReminderOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {reminderCreated && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 text-[13px] font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" /> המעקב נשמר לתאריך {reminderDate}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(event) => setReminderDate(event.target.value)}
                  className="px-4 py-3 rounded-xl border border-gray-200 text-[14px] bg-white"
                />
                <input
                  value={reminderTitle}
                  onChange={(event) => setReminderTitle(event.target.value)}
                  className="px-4 py-3 rounded-xl border border-gray-200 text-[14px] bg-white"
                  placeholder="כותרת מעקב"
                />
              </div>
              <button
                type="button"
                onClick={createReminder}
                disabled={isSavingReminder || reminderCreated}
                className="px-4 py-2.5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:bg-gray-300 text-[14px] font-bold flex items-center gap-2"
              >
                {isSavingReminder ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CalendarPlus className="w-4 h-4" />
                )}{" "}
                {reminderCreated ? "המעקב נשמר" : "שמור מעקב"}
              </button>
            </section>
          )}
        </div>
      )}

      <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-3 rounded-xl bg-[#1e40af] text-white font-bold hover:bg-[#1e3a8a]"
        >
          חזור לתיק הרפואי
        </button>
      </div>

      <VisitCheckoutModal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        onSaved={handleCheckoutSaved}
        ownerId={ownerId}
        patientId={patientId}
        visitId={visitId}
        petName={petName}
        ownerName={ownerName}
        entryType={entryType}
        entryLabel={entryLabel}
        visitDate={visitDate}
        prescriptions={prescriptions}
        labs={labs}
      />
    </div>
  );
}
