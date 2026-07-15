import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Barcode,
  CalendarDays,
  Camera,
  CheckCircle2,
  Download,
  FileImage,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Syringe,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { getStaffName } from "../data/staffAuth";

const VACCINATIONS_CHANGED_EVENT = "myvet:vaccinations-changed";

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export type VaccinationBookMode = "staff" | "owner";

export type VaccinationBookProps = {
  patientId: number;
  petName: string;
  species?: string | null;
  breed?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  mode?: VaccinationBookMode;
  compact?: boolean;
};

type VaccinationRecord = {
  vaccination_id: string;
  pet_id: number;
  owner_id: string | null;
  visit_id: number | null;
  vaccine_name: string;
  vaccine_type: string | null;
  manufacturer: string | null;
  batch_number: string | null;
  barcode_value: string | null;
  given_date: string;
  next_due_date: string | null;
  expiry_date: string | null;
  administered_by: string | null;
  entry_method: string | null;
  sticker_image_path: string | null;
  sticker_image_url: string | null;
  notes: string | null;
  created_at: string | null;
};

type FormState = {
  vaccine_name: string;
  vaccine_type: string;
  manufacturer: string;
  batch_number: string;
  barcode_value: string;
  given_date: string;
  next_due_date: string;
  expiry_date: string;
  administered_by: string;
  notes: string;
};

const emptyForm: FormState = {
  vaccine_name: "",
  vaccine_type: "",
  manufacturer: "",
  batch_number: "",
  barcode_value: "",
  given_date: new Date().toISOString().slice(0, 10),
  next_due_date: "",
  expiry_date: "",
  administered_by: "",
  notes: "",
};

const vaccineTypeOptions = [
  "כלבת",
  "משושה",
  "מרובע",
  "תולעת הפארק",
  "חתולים",
  "שעלת",
  "אחר",
];

function formatDate(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL");
}

function isFutureDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() >= today.getTime();
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 90);
}

function getMethodLabel(value?: string | null) {
  if (value === "barcode") return "ברקוד";
  if (value === "photo") return "צילום";
  return "ידני";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function VaccinationBook({
  patientId,
  petName,
  species,
  breed,
  ownerId,
  ownerName,
  ownerPhone,
  mode = "staff",
  compact = false,
}: VaccinationBookProps) {
  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<VaccinationRecord | null>(null);
  const [deletingVaccinationId, setDeletingVaccinationId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const canEdit = mode === "staff";

  const upcomingRecord = useMemo(() => {
    return [...records]
      .filter((record) => isFutureDate(record.next_due_date))
      .sort((a, b) => new Date(a.next_due_date || "").getTime() - new Date(b.next_due_date || "").getTime())[0] || null;
  }, [records]);

  const overdueRecords = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return records.filter((record) => {
      if (!record.next_due_date) return false;
      const due = new Date(record.next_due_date);
      if (Number.isNaN(due.getTime())) return false;
      due.setHours(0, 0, 0, 0);
      return due.getTime() < today.getTime();
    });
  }, [records]);

  const loadVaccinations = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("vaccinations")
        .select("*")
        .eq("pet_id", patientId)
        .order("given_date", { ascending: false });

      if (error) throw error;
      setRecords((data || []) as VaccinationRecord[]);
    } catch (error) {
      console.error("Failed to load vaccination book", error);
      setRecords([]);
      toast.error("לא הצלחנו לטעון את פנקס החיסונים");
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadVaccinations();
  }, [loadVaccinations]);

  useEffect(() => {
    const handleVaccinationsChanged = (event: Event) => {
      const changedPatientId = Number((event as CustomEvent<{ patientId?: number }>).detail?.patientId);
      if (changedPatientId === patientId) void loadVaccinations();
    };

    window.addEventListener(VACCINATIONS_CHANGED_EVENT, handleVaccinationsChanged);
    return () => window.removeEventListener(VACCINATIONS_CHANGED_EVENT, handleVaccinationsChanged);
  }, [loadVaccinations, patientId]);

  const stopScanner = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  }, []);

  useEffect(() => stopScanner, [stopScanner]);

  async function startScanner() {
    setScanError(null);

    if (!window.BarcodeDetector) {
      setScanError("סריקה אוטומטית לא זמינה בדפדפן הזה. אפשר להזין ברקוד ידנית או לצלם את המדבקה.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("לא ניתן לפתוח מצלמה בדפדפן הזה. אפשר להזין ברקוד ידנית או לצלם את המדבקה.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setIsScanning(true);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new window.BarcodeDetector({
        formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf"],
      });

      const scanFrame = async () => {
        const currentVideo = videoRef.current;
        if (!currentVideo || currentVideo.readyState < 2) {
          frameRef.current = requestAnimationFrame(scanFrame);
          return;
        }

        try {
          const results = await detector.detect(currentVideo);
          const first = results[0]?.rawValue;
          if (first) {
            setForm((prev) => ({ ...prev, barcode_value: first }));
            toast.success("הברקוד נקלט בהצלחה");
            stopScanner();
            return;
          }
        } catch (error) {
          console.warn("Barcode scan failed", error);
        }

        frameRef.current = requestAnimationFrame(scanFrame);
      };

      scanFrame();
    } catch (error) {
      console.error("Failed to start barcode scanner", error);
      setScanError("לא הצלחנו לפתוח מצלמה. אפשר להזין ברקוד ידנית או לצלם את המדבקה.");
      stopScanner();
    }
  }

  function openAddModal() {
    setEditingRecord(null);
    setForm({
      ...emptyForm,
      given_date: new Date().toISOString().slice(0, 10),
      administered_by: getStaffName(),
    });
    setStickerFile(null);
    setFormError(null);
    setScanError(null);
    setIsModalOpen(true);
  }

  function openEditModal(record: VaccinationRecord) {
    setEditingRecord(record);
    setForm({
      vaccine_name: record.vaccine_name || "",
      vaccine_type: record.vaccine_type || "",
      manufacturer: record.manufacturer || "",
      batch_number: record.batch_number || "",
      barcode_value: record.barcode_value || "",
      given_date: record.given_date || new Date().toISOString().slice(0, 10),
      next_due_date: record.next_due_date || "",
      expiry_date: record.expiry_date || "",
      administered_by: record.administered_by || getStaffName(),
      notes: record.notes || "",
    });
    setStickerFile(null);
    setFormError(null);
    setScanError(null);
    setIsModalOpen(true);
  }

  function closeAddModal() {
    stopScanner();
    setIsModalOpen(false);
    setEditingRecord(null);
    setStickerFile(null);
  }

  async function uploadStickerImage(vaccinationIdHint: string) {
    if (!stickerFile) return { path: null, url: null };

    const extension = stickerFile.name.includes(".") ? stickerFile.name.split(".").pop() : "jpg";
    const fileName = `${Date.now()}-${vaccinationIdHint}.${safeFileName(extension || "jpg")}`;
    const path = `vaccinations/${ownerId || "unknown-owner"}/${patientId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, stickerFile, { upsert: true, contentType: stickerFile.type || "image/jpeg" });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    return { path, url: data.publicUrl || null };
  }

  async function saveVaccination() {
    if (!canEdit) return;

    const vaccineName = form.vaccine_name.trim();
    if (!vaccineName) {
      setFormError("חובה להזין שם חיסון.");
      return;
    }
    if (!form.given_date) {
      setFormError("חובה להזין תאריך מתן חיסון.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const vaccinationIdHint = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
      const image = await uploadStickerImage(vaccinationIdHint);
      const entryMethod = form.barcode_value.trim()
        ? "barcode"
        : stickerFile || editingRecord?.sticker_image_path
          ? "photo"
          : "manual";
      const payload = {
        pet_id: patientId,
        owner_id: ownerId || editingRecord?.owner_id || null,
        vaccine_name: vaccineName,
        vaccine_type: form.vaccine_type.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        batch_number: form.batch_number.trim() || null,
        barcode_value: form.barcode_value.trim() || null,
        given_date: form.given_date,
        next_due_date: form.next_due_date || null,
        expiry_date: form.expiry_date || null,
        administered_by: form.administered_by.trim() || null,
        entry_method: entryMethod,
        sticker_image_path: image.path || editingRecord?.sticker_image_path || null,
        sticker_image_url: image.url || editingRecord?.sticker_image_url || null,
        notes: form.notes.trim() || null,
      };

      const saveQuery = editingRecord
        ? supabase.from("vaccinations").update(payload).eq("vaccination_id", editingRecord.vaccination_id)
        : supabase.from("vaccinations").insert(payload);
      const { data, error } = await saveQuery.select("*").single();

      if (error) throw error;
      const savedRecord = data as VaccinationRecord;

      setRecords((current) => {
        const next = editingRecord
          ? current.map((record) => record.vaccination_id === savedRecord.vaccination_id ? savedRecord : record)
          : [savedRecord, ...current];
        return [...next].sort((a, b) => new Date(b.given_date).getTime() - new Date(a.given_date).getTime());
      });

      const successMessage = editingRecord ? "פרטי החיסון עודכנו" : "החיסון נוסף לפנקס";
      closeAddModal();
      toast.success(successMessage);
    } catch (error) {
      console.error("Failed to save vaccination", error);
      setFormError(editingRecord ? "לא הצלחנו לעדכן את החיסון במסד הנתונים." : "לא הצלחנו לשמור את החיסון במסד הנתונים.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteVaccination(record: VaccinationRecord) {
    if (!canEdit || deletingVaccinationId) return;
    const linkedVisitNote = record.visit_id ? " הרשומה הרפואית המקושרת לא תימחק." : "";
    if (!window.confirm(`למחוק את החיסון ${record.vaccine_name} מפנקס החיסונים?${linkedVisitNote}`)) return;

    setDeletingVaccinationId(record.vaccination_id);
    try {
      const { data, error } = await supabase
        .from("vaccinations")
        .delete()
        .eq("vaccination_id", record.vaccination_id)
        .select("vaccination_id")
        .single();

      if (error) throw error;
      if (!data?.vaccination_id) throw new Error("Vaccination delete was not confirmed by the database");

      setRecords((current) => current.filter((item) => item.vaccination_id !== record.vaccination_id));
      toast.success("החיסון נמחק מהפנקס");
    } catch (error) {
      console.error("Failed to delete vaccination", error);
      toast.error("לא הצלחנו למחוק את החיסון מהמסד");
    } finally {
      setDeletingVaccinationId(null);
    }
  }

  function printVaccinationBook() {
    const rows = records.map((record) => `
      <tr>
        <td>${escapeHtml(formatDate(record.given_date))}</td>
        <td>${escapeHtml(record.vaccine_name || "")}</td>
        <td>${escapeHtml(record.vaccine_type || "")}</td>
        <td>${escapeHtml(record.batch_number || "")}</td>
        <td>${escapeHtml(record.barcode_value || "")}</td>
        <td>${escapeHtml(formatDate(record.expiry_date))}</td>
        <td>${escapeHtml(formatDate(record.next_due_date))}</td>
        <td>${escapeHtml(record.administered_by || "")}</td>
      </tr>
    `).join("");

    const html = `<!doctype html>
      <html lang="he" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>פנקס חיסונים - ${escapeHtml(petName)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
          .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 2px solid #1e40af; padding-bottom: 18px; margin-bottom: 22px; }
          h1 { margin: 0; font-size: 26px; }
          .muted { color: #6b7280; font-size: 13px; margin-top: 6px; }
          .box { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; margin: 14px 0 22px; background: #f8fafc; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .label { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
          .value { font-weight: 700; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 9px 8px; text-align: right; }
          th { background: #eff6ff; color: #1e40af; font-weight: 700; }
          tr:nth-child(even) td { background: #fafafa; }
          .footer { margin-top: 28px; color: #6b7280; font-size: 11px; }
          @media print { body { margin: 18px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>פנקס חיסונים</h1>
            <div class="muted">הופק ממערכת MyVet בתאריך ${escapeHtml(formatDate(new Date().toISOString()))}</div>
          </div>
          <button class="no-print" onclick="window.print()" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #d1d5db; background: white; cursor: pointer;">הדפס / שמור PDF</button>
        </div>
        <div class="box grid">
          <div><div class="label">שם החיה</div><div class="value">${escapeHtml(petName)}</div></div>
          <div><div class="label">סוג / גזע</div><div class="value">${escapeHtml([species, breed].filter(Boolean).join(" · ") || "לא צוין")}</div></div>
          <div><div class="label">בעלים</div><div class="value">${escapeHtml(ownerName || "לא צוין")}</div></div>
          <div><div class="label">טלפון</div><div class="value">${escapeHtml(ownerPhone || "לא צוין")}</div></div>
          <div><div class="label">מספר חיסונים</div><div class="value">${records.length}</div></div>
          <div><div class="label">חיסון הבא</div><div class="value">${escapeHtml(upcomingRecord ? `${upcomingRecord.vaccine_name} · ${formatDate(upcomingRecord.next_due_date)}` : "לא מוגדר")}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>תאריך</th><th>שם חיסון</th><th>סוג</th><th>אצווה</th><th>ברקוד</th><th>תוקף</th><th>חיסון הבא</th><th>ניתן על ידי</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="8">אין חיסונים בפנקס</td></tr>`}</tbody>
        </table>
        <div class="footer">המסמך מיועד לצפייה והצגה לבעלים. פרטים רפואיים מלאים נמצאים בתיק הרפואי במרפאה.</div>
        <script>setTimeout(() => window.print(), 300);</script>
      </body>
      </html>`;

    const printWindow = window.open("", "_blank", "width=1100,height=760");
    if (!printWindow) {
      toast.error("הדפדפן חסם פתיחת חלון. אפשר לאפשר popups ולנסות שוב.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }

  const nextDueDays = daysUntil(upcomingRecord?.next_due_date);

  return (
    <section className={`bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden ${compact ? "" : "mb-8"}`} dir="rtl">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-l from-emerald-50/70 via-white to-white flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center ring-1 ring-emerald-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-gray-950 text-[18px] font-extrabold">פנקס חיסונים</h3>
            <p className="text-gray-600 text-[13px] font-medium mt-1">
              {records.length === 0
                ? "אין חיסונים שמורים עדיין"
                : upcomingRecord
                  ? `חיסון הבא: ${upcomingRecord.vaccine_name} · ${formatDate(upcomingRecord.next_due_date)}`
                  : `${records.length} חיסונים שמורים`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadVaccinations}
            className="h-10 px-3 rounded-2xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-[13px] font-bold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
          <button
            type="button"
            onClick={printVaccinationBook}
            className="h-10 px-3 rounded-2xl border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-[13px] font-bold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" /> הורד פנקס
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={openAddModal}
              className="h-10 px-4 rounded-2xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[13px] font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> הוסף חיסון
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-gray-500 text-[12px] font-bold">חיסונים בפנקס</p>
            <p className="text-gray-950 text-[24px] font-extrabold mt-1">{records.length}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${overdueRecords.length > 0 ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100"}`}>
            <p className={`text-[12px] font-bold ${overdueRecords.length > 0 ? "text-rose-700" : "text-emerald-700"}`}>דורש תשומת לב</p>
            <p className={`text-[24px] font-extrabold mt-1 ${overdueRecords.length > 0 ? "text-rose-800" : "text-emerald-800"}`}>{overdueRecords.length}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <p className="text-blue-700 text-[12px] font-bold">חיסון קרוב</p>
            <p className="text-blue-950 text-[15px] font-extrabold mt-2 truncate">
              {upcomingRecord ? upcomingRecord.vaccine_name : "לא נקבע"}
            </p>
            {upcomingRecord && <p className="text-blue-700 text-[12px] mt-1 font-semibold">{nextDueDays === 0 ? "היום" : nextDueDays && nextDueDays > 0 ? `בעוד ${nextDueDays} ימים` : formatDate(upcomingRecord.next_due_date)}</p>}
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-gray-500 gap-2 text-[14px] font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" /> טוען פנקס חיסונים...
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
            <Syringe className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-gray-900 text-[15px] font-extrabold">אין חיסונים שמורים</p>
            <p className="text-gray-500 text-[13px] font-medium mt-1">
              {canEdit ? "אפשר להוסיף חיסון עם ברקוד, הזנה ידנית או צילום מדבקה." : "כאשר המרפאה תתעד חיסונים, הם יופיעו כאן."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-full text-right text-[13px]">
              <thead className="bg-slate-50 text-slate-500 font-bold">
                <tr>
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">חיסון</th>
                  <th className="px-4 py-3">אצווה / ברקוד</th>
                  <th className="px-4 py-3">חיסון הבא</th>
                  <th className="px-4 py-3">תיעוד</th>
                  <th className="px-4 py-3">מדבקה</th>
                  {canEdit && <th className="px-4 py-3">פעולות</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map((record) => {
                  const due = daysUntil(record.next_due_date);
                  const isOverdue = due !== null && due < 0;
                  return (
                    <tr key={record.vaccination_id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-gray-700 font-semibold whitespace-nowrap">{formatDate(record.given_date)}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-950 font-extrabold">{record.vaccine_name}</p>
                        <p className="text-gray-500 text-[12px] mt-0.5">{[record.vaccine_type, record.manufacturer].filter(Boolean).join(" · ") || "לא צוין סוג/יצרן"}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p className="font-semibold">{record.batch_number || "אין אצווה"}</p>
                        <p className="text-gray-500 text-[12px] mt-0.5 truncate max-w-[160px]">{record.barcode_value || "אין ברקוד"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold border ${isOverdue ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                          <CalendarDays className="w-3.5 h-3.5" /> {formatDate(record.next_due_date)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-semibold">{getMethodLabel(record.entry_method)}</td>
                      <td className="px-4 py-3">
                        {record.sticker_image_url ? (
                          <a href={record.sticker_image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-xl px-3 py-1.5 text-[12px] font-bold transition-colors">
                            <FileImage className="w-3.5 h-3.5" /> הצג
                          </a>
                        ) : (
                          <span className="text-gray-400 text-[12px] font-semibold">אין צילום</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(record)}
                              disabled={Boolean(deletingVaccinationId)}
                              className="w-9 h-9 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                              aria-label={`עריכת חיסון ${record.vaccine_name}`}
                              title="עריכה"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteVaccination(record)}
                              disabled={Boolean(deletingVaccinationId)}
                              className="w-9 h-9 rounded-xl border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition-colors"
                              aria-label={`מחיקת חיסון ${record.vaccine_name}`}
                              title="מחיקה"
                            >
                              {deletingVaccinationId === record.vaccination_id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center px-4" onClick={closeAddModal}>
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-[28px] shadow-2xl border border-slate-100" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-gray-950 text-[20px] font-extrabold">{editingRecord ? "עריכת חיסון בפנקס" : "הוספת חיסון לפנקס"}</h3>
                <p className="text-gray-500 text-[13px] font-medium mt-1">
                  {editingRecord ? "השינויים יישמרו בפנקס לאחר אישור מהמסד." : "אפשר לסרוק ברקוד, להזין ידנית או לצלם מדבקה/אריזה."}
                </p>
              </div>
              <button type="button" onClick={closeAddModal} aria-label="סגור חלון" className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && <div className="rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 text-[13px] font-bold">{formError}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="שם החיסון" required>
                  <input value={form.vaccine_name} onChange={(e) => setForm((prev) => ({ ...prev, vaccine_name: e.target.value }))} className="input" placeholder="לדוגמה: כלבת / משושה" />
                </Field>
                <Field label="סוג חיסון">
                  <select value={form.vaccine_type} onChange={(e) => setForm((prev) => ({ ...prev, vaccine_type: e.target.value }))} className="input bg-white">
                    <option value="">בחר סוג</option>
                    {vaccineTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="תאריך מתן" required>
                  <input type="date" value={form.given_date} onChange={(e) => setForm((prev) => ({ ...prev, given_date: e.target.value }))} className="input" />
                </Field>
                <Field label="תאריך חיסון הבא">
                  <input type="date" value={form.next_due_date} onChange={(e) => setForm((prev) => ({ ...prev, next_due_date: e.target.value }))} className="input" />
                </Field>
                <Field label="יצרן">
                  <input value={form.manufacturer} onChange={(e) => setForm((prev) => ({ ...prev, manufacturer: e.target.value }))} className="input" placeholder="שם יצרן" />
                </Field>
                <Field label="מספר אצווה">
                  <input value={form.batch_number} onChange={(e) => setForm((prev) => ({ ...prev, batch_number: e.target.value }))} className="input" placeholder="Lot / Batch" />
                </Field>
                <Field label="תוקף חיסון / אריזה">
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm((prev) => ({ ...prev, expiry_date: e.target.value }))} className="input" />
                </Field>
                <Field label="ניתן על ידי">
                  <input value={form.administered_by} onChange={(e) => setForm((prev) => ({ ...prev, administered_by: e.target.value }))} className="input" placeholder="שם איש צוות" />
                </Field>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-gray-950 text-[15px] font-extrabold">ברקוד ומדבקה</h4>
                    <p className="text-gray-500 text-[12px] font-medium mt-1">סריקה אוטומטית אם נתמכת בדפדפן, או הזנה ידנית/צילום.</p>
                  </div>
                  <button
                    type="button"
                    onClick={isScanning ? stopScanner : startScanner}
                    className={`h-10 px-4 rounded-2xl text-[13px] font-bold flex items-center gap-2 cursor-pointer transition-colors ${isScanning ? "bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100" : "bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"}`}
                  >
                    {isScanning ? <X className="w-4 h-4" /> : <Barcode className="w-4 h-4" />}
                    {isScanning ? "עצור סריקה" : "סרוק ברקוד"}
                  </button>
                </div>

                {scanError && <div className="rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 px-4 py-3 text-[13px] font-bold mb-3">{scanError}</div>}

                {isScanning && (
                  <div className="rounded-2xl overflow-hidden border border-blue-100 bg-black mb-3">
                    <video ref={videoRef} className="w-full max-h-[260px] object-cover" muted playsInline />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="ברקוד / מזהה מדבקה">
                    <input value={form.barcode_value} onChange={(e) => setForm((prev) => ({ ...prev, barcode_value: e.target.value }))} className="input" placeholder="אפשר להזין ידנית" />
                  </Field>
                  <Field label="צילום מדבקה / אריזה">
                    <label className="h-[43px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors">
                      <span className="text-gray-600 text-[13px] font-semibold truncate">{stickerFile ? stickerFile.name : "בחר קובץ או צלם"}</span>
                      <span className="inline-flex items-center gap-1 text-blue-700 text-[12px] font-bold"><Camera className="w-4 h-4" /> צילום</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setStickerFile(e.target.files?.[0] || null)} />
                    </label>
                  </Field>
                </div>
              </div>

              <Field label="הערות">
                <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className="input min-h-[90px] resize-y" placeholder="הערות פנימיות על החיסון" />
              </Field>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={saveVaccination}
                  disabled={isSaving}
                  className="flex-1 h-12 rounded-2xl bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[14px] font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isSaving ? "שומר חיסון..." : editingRecord ? "שמור שינויים" : "שמור חיסון בפנקס"}
                </button>
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="h-12 px-6 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[14px] font-bold cursor-pointer transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0.625rem 0.875rem;
          font-size: 14px;
          color: #111827;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
      `}</style>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-gray-700 text-[13px] font-bold mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
