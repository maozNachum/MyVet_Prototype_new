import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Stethoscope,
  Pill,
  FlaskConical,
  Paperclip,
  Calendar,
  User,
  ChevronLeft,
  Download,
  Eye,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";

interface ClientMedicalReportsProps {
  petId: number;
  petName: string;
}

interface VisitRow {
  visit_id: number;
  appointment_id: number | null;
  pet_id: number;
  visit_date: string | null;
  vet_name: string | null;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  attachments: string | null;
}

interface PrescriptionRow {
  prescription_id: number;
  visit_id: number | null;
  pet_id: number;
  medication: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  start_date: string | null;
  prescribed_by: string | null;
}

interface LabOrderRow {
  lab_order_id: number;
  pet_id: number;
  test_name: string | null;
  category: string | null;
  status: string | null;
  ordered_date: string | null;
  results: string | null;
  normal_range: string | null;
  result_value: string | null;
  result_status: string | null;
  completed_date: string | null;
  notes: string | null;
  is_urgent: boolean | null;
}

interface DocumentRow {
  document_id: number;
  owner_id: string | null;
  pet_id: number | null;
  visit_id: number | null;
  file_name: string;
  file_path: string;
  file_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  category: string;
  uploaded_at: string | null;
}

type TabKey = "visits" | "prescriptions" | "labs" | "documents";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "visits", label: "סיכומי ביקור", icon: Stethoscope },
  { key: "prescriptions", label: "מרשמים", icon: Pill },
  { key: "labs", label: "בדיקות מעבדה", icon: FlaskConical },
  { key: "documents", label: "מסמכים", icon: Paperclip },
];

function formatDate(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusLabel(status?: string | null) {
  switch (status) {
    case "completed":
      return "הושלם";
    case "ordered":
      return "הוזמן";
    case "in-progress":
      return "בתהליך";
    case "cancelled":
      return "בוטל";
    case "normal":
      return "תקין";
    case "abnormal":
      return "חריג";
    case "critical":
      return "קריטי";
    default:
      return status || "לא צוין";
  }
}

function fileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-gray-500 font-medium">
      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
      <p className="text-[14px]">{text}</p>
    </div>
  );
}

export function ClientMedicalReports({ petId, petName }: ClientMedicalReportsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("visits");
  const [expandedVisitId, setExpandedVisitId] = useState<number | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      setIsLoading(true);
      setError(null);

      try {
        const [visitsRes, prescriptionsRes, labsRes, documentsRes] = await Promise.all([
          supabase
            .from("medical_visits")
            .select("*")
            .eq("pet_id", petId)
            .order("visit_date", { ascending: false }),
          supabase
            .from("prescriptions")
            .select("*")
            .eq("pet_id", petId)
            .order("start_date", { ascending: false }),
          supabase
            .from("lab_orders")
            .select("*")
            .eq("pet_id", petId)
            .order("ordered_date", { ascending: false }),
          supabase
            .from("documents")
            .select("*")
            .eq("pet_id", petId)
            .order("uploaded_at", { ascending: false }),
        ]);

        if (visitsRes.error) throw visitsRes.error;
        if (prescriptionsRes.error) throw prescriptionsRes.error;
        if (labsRes.error) throw labsRes.error;
        if (documentsRes.error) throw documentsRes.error;

        setVisits((visitsRes.data || []) as VisitRow[]);
        setPrescriptions((prescriptionsRes.data || []) as PrescriptionRow[]);
        setLabOrders((labsRes.data || []) as LabOrderRow[]);
        setDocuments((documentsRes.data || []) as DocumentRow[]);
      } catch (err: any) {
        console.error("Failed loading client medical reports", err);
        setError(err?.message || "שגיאה בטעינת תיק רפואי");
      } finally {
        setIsLoading(false);
      }
    }

    loadReports();
  }, [petId]);

  const counts = useMemo(() => ({
    visits: visits.length,
    prescriptions: prescriptions.length,
    labs: labOrders.length,
    documents: documents.length,
  }), [visits.length, prescriptions.length, labOrders.length, documents.length]);

  const openDocument = async (doc: DocumentRow) => {
    if (doc.file_url) {
      window.open(doc.file_url, "_blank");
      return;
    }

    const { data, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 60 * 5);

    if (signedError || !data?.signedUrl) {
      alert("לא הצלחנו לפתוח את המסמך");
      return;
    }

    window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-500">
        <Loader2 className="w-7 h-7 mx-auto mb-3 animate-spin text-[#1e40af]" />
        <p className="text-[14px] font-medium">טוען תיק רפואי של {petName}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl border border-red-200 p-5 text-red-600 flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        <span className="text-[14px] font-semibold">{error}</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" dir="rtl">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>תיק רפואי דיגיטלי — {petName}</h4>
          <p className="text-gray-500 font-medium text-[12px]">נתונים אמיתיים ממסד הנתונים</p>
        </div>
        <button className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[12px] border border-transparent hover:border-emerald-200" style={{ fontWeight: 500 }}>
          <Download className="w-3.5 h-3.5" /> ייצוא
        </button>
      </div>

      <div className="px-4 pt-4 border-b border-gray-100 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.key];
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-t-xl text-[13px] border-b-2 transition-colors cursor-pointer ${
                active
                  ? "text-[#1e40af] border-[#1e40af] bg-blue-50/60"
                  : "text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50"
              }`}
              style={{ fontWeight: active ? 700 : 500 }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[11px]">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="p-4">
        {activeTab === "visits" && (
          <div className="space-y-3">
            {visits.length === 0 ? <EmptyState text="אין סיכומי ביקור שמורים במסד" /> : visits.map((visit) => {
              const expanded = expandedVisitId === visit.visit_id;
              return (
                <div key={visit.visit_id} className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setExpandedVisitId(expanded ? null : visit.visit_id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 text-right">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <Stethoscope className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-gray-900 text-[14px]" style={{ fontWeight: 700 }}>{visit.reason || "ביקור רפואי"}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-gray-500 mt-0.5">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(visit.visit_date)}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{visit.vet_name || "לא צוין"}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3 text-[13px]">
                      <div>
                        <p className="text-gray-500 mb-1" style={{ fontWeight: 700 }}>אבחנה</p>
                        <p className="text-gray-800 bg-blue-50/50 rounded-lg px-3 py-2 border border-blue-100">{visit.diagnosis || "לא צוין"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-1" style={{ fontWeight: 700 }}>טיפול שבוצע / תוכנית טיפול</p>
                        <p className="text-gray-800 bg-emerald-50/50 rounded-lg px-3 py-2 border border-emerald-100">{visit.treatment || "לא צוין"}</p>
                      </div>
                      {visit.notes && (
                        <div>
                          <p className="text-gray-500 mb-1" style={{ fontWeight: 700 }}>הערות והנחיות</p>
                          <p className="text-gray-800 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{visit.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "prescriptions" && (
          <div className="space-y-3">
            {prescriptions.length === 0 ? <EmptyState text="אין מרשמים שמורים במסד" /> : prescriptions.map((prescription) => (
              <div key={prescription.prescription_id} className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 flex items-start gap-3">
                <Pill className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-gray-900 text-[14px]" style={{ fontWeight: 700 }}>{prescription.medication || "תרופה"}</p>
                  <p className="text-gray-600 text-[13px] mt-1">
                    מינון: {prescription.dosage || "לא צוין"} · תדירות: {prescription.frequency || "לא צוין"} · משך: {prescription.duration || "לא צוין"}
                  </p>
                  <p className="text-gray-500 text-[12px] mt-1">תאריך התחלה: {formatDate(prescription.start_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "labs" && (
          <div className="space-y-3">
            {labOrders.length === 0 ? <EmptyState text="אין בדיקות מעבדה שמורות במסד" /> : labOrders.map((lab) => (
              <div key={lab.lab_order_id} className="rounded-xl border border-teal-100 bg-teal-50/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-teal-600" />
                    <p className="text-gray-900 text-[14px]" style={{ fontWeight: 700 }}>{lab.test_name || "בדיקה"}</p>
                  </div>
                  <span className="text-[12px] px-2 py-1 rounded-full bg-white border border-teal-100 text-teal-700" style={{ fontWeight: 600 }}>{statusLabel(lab.status)}</span>
                </div>
                <p className="text-gray-500 text-[12px] mb-2">הוזמן: {formatDate(lab.ordered_date)} · קטגוריה: {lab.category || "לא צוין"}</p>
                {(lab.results || lab.result_value) && (
                  <p className="text-gray-800 text-[13px] bg-white rounded-lg border border-teal-100 px-3 py-2">
                    תוצאה: {lab.results || lab.result_value} {lab.normal_range ? `· טווח תקין: ${lab.normal_range}` : ""} {lab.result_status ? `· סטטוס: ${statusLabel(lab.result_status)}` : ""}
                  </p>
                )}
                {lab.notes && <p className="text-gray-600 text-[13px] mt-2">{lab.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-3">
            {documents.length === 0 ? <EmptyState text="אין מסמכים שמורים במסד" /> : documents.map((doc) => (
              <div key={doc.document_id} className="rounded-xl border border-violet-100 bg-violet-50/30 p-4 flex items-center gap-3">
                <Paperclip className="w-5 h-5 text-violet-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-[14px] truncate" style={{ fontWeight: 700 }}>{doc.file_name}</p>
                  <p className="text-gray-500 text-[12px]">{doc.category} · {formatDate(doc.uploaded_at)} {fileSize(doc.file_size) ? `· ${fileSize(doc.file_size)}` : ""}</p>
                </div>
                <button
                  onClick={() => openDocument(doc)}
                  className="flex items-center gap-1.5 text-[#1e40af] hover:bg-blue-50 px-3 py-2 rounded-lg text-[12px] border border-blue-100 cursor-pointer"
                  style={{ fontWeight: 600 }}
                >
                  <Eye className="w-3.5 h-3.5" /> פתח
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
