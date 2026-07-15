import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FileText,
  Stethoscope,
  Pill,
  FlaskConical,
  Paperclip,
  Download,
  Eye,
  Loader2,
  AlertCircle,
  ClipboardList,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { PrescriptionDocumentModal } from "./PrescriptionDocumentModal";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ClientMedicalReportsProps {
  petId: number;
  petName: string;
}

interface OwnerInfo {
  ownerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
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
  visit_type?: string | null;
  urgency_level?: "normal" | "serious" | "critical" | null;
  chief_complaint?: string | null;
  final_diagnosis?: string | null;
  follow_up_required?: boolean | null;
  follow_up_notes?: string | null;
}

interface PhysicalExamRow {
  physical_exam_id: number;
  visit_id: number | null;
  pet_id: number;
  exam_date: string | null;
  findings: string | null;
}

interface MedicalProblemRow {
  problem_id: number;
  visit_id: number | null;
  pet_id: number;
  problem_text: string | null;
  severity: "normal" | "serious" | "critical" | null;
  status: "active" | "improved" | "resolved" | null;
  notes: string | null;
}

interface DifferentialDiagnosisRow {
  diagnosis_id: number;
  visit_id: number | null;
  pet_id: number;
  diagnosis_text: string | null;
  likelihood: "low" | "possible" | "likely" | null;
  notes: string | null;
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
  test_date?: string | null;
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
  { key: "visits", label: "ביקורים", icon: Stethoscope },
  { key: "prescriptions", label: "מרשמים", icon: Pill },
  { key: "labs", label: "בדיקות מעבדה", icon: FlaskConical },
  { key: "documents", label: "מסמכים", icon: Paperclip },
];

function formatDate(value?: string | null) {
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusLabel(status?: string | null) {
  switch (status) {
    case "completed": return "הושלם";
    case "ordered": return "הוזמן";
    case "in-progress": return "בתהליך";
    case "cancelled": return "בוטל";
    case "normal": return "תקין";
    case "abnormal": return "חריג";
    case "critical": return "קריטי";
    case "active": return "פעיל";
    case "improved": return "השתפר";
    case "resolved": return "נפתר";
    case "serious": return "חמור";
    case "low": return "נמוכה";
    case "possible": return "אפשרית";
    case "likely": return "סבירה";
    default: return status || "לא צוין";
  }
}

function urgencyClass(value?: string | null) {
  switch (value) {
    case "critical": return "bg-red-50 text-red-700 border-red-200";
    case "serious": return "bg-amber-50 text-amber-700 border-amber-200";
    default: return "bg-emerald-50 text-emerald-700 border-emerald-200";
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
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionRow | null>(null);
  const [selectedPrescriptionVisit, setSelectedPrescriptionVisit] = useState<VisitRow | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [physicalExams, setPhysicalExams] = useState<PhysicalExamRow[]>([]);
  const [medicalProblems, setMedicalProblems] = useState<MedicalProblemRow[]>([]);
  const [differentials, setDifferentials] = useState<DifferentialDiagnosisRow[]>([]);
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
        const [visitsRes, examsRes, problemsRes, diffRes, prescriptionsRes, labsRes, documentsRes] = await Promise.all([
          supabase.from("medical_visits").select("*").eq("pet_id", petId).order("visit_date", { ascending: false }),
          supabase.from("physical_exams").select("*").eq("pet_id", petId).order("exam_date", { ascending: false }),
          supabase.from("medical_problems").select("*").eq("pet_id", petId).order("created_at", { ascending: true }),
          supabase.from("differential_diagnoses").select("*").eq("pet_id", petId).order("created_at", { ascending: true }),
          supabase.from("prescriptions").select("*").eq("pet_id", petId).order("start_date", { ascending: false }),
          supabase.from("lab_orders").select("*").eq("pet_id", petId).order("ordered_date", { ascending: false }),
          supabase.from("documents").select("*").eq("pet_id", petId).order("uploaded_at", { ascending: false }),
        ]);

        if (visitsRes.error) throw visitsRes.error;
        if (examsRes.error) throw examsRes.error;
        if (problemsRes.error) throw problemsRes.error;
        if (diffRes.error) throw diffRes.error;
        if (prescriptionsRes.error) throw prescriptionsRes.error;
        if (labsRes.error) throw labsRes.error;
        if (documentsRes.error) throw documentsRes.error;

        setVisits((visitsRes.data || []) as VisitRow[]);
        setPhysicalExams((examsRes.data || []) as PhysicalExamRow[]);
        setMedicalProblems((problemsRes.data || []) as MedicalProblemRow[]);
        setDifferentials((diffRes.data || []) as DifferentialDiagnosisRow[]);
        setPrescriptions((prescriptionsRes.data || []) as PrescriptionRow[]);
        setLabOrders((labsRes.data || []) as LabOrderRow[]);
        setDocuments((documentsRes.data || []) as DocumentRow[]);

        const { data: patientRow, error: patientError } = await supabase
          .from("patients")
          .select("owner_id")
          .eq("pet_id", petId)
          .maybeSingle();

        if (patientError) throw patientError;

        if (patientRow?.owner_id) {
          const { data: ownerRow, error: ownerError } = await supabase
            .from("owners")
            .select("owner_id, owner_first_name, owner_last_name, phone, email, address")
            .eq("owner_id", patientRow.owner_id)
            .maybeSingle();

          if (ownerError) throw ownerError;

          setOwnerInfo(ownerRow ? {
            ownerId: ownerRow.owner_id,
            firstName: ownerRow.owner_first_name,
            lastName: ownerRow.owner_last_name,
            phone: ownerRow.phone,
            email: ownerRow.email,
            address: ownerRow.address,
          } : null);
        } else {
          setOwnerInfo(null);
        }
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

    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    const { data, error: signedError } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 60 * 5);

    if (signedError || !data?.signedUrl) {
      popup?.close();
      toast.error("לא הצלחנו לפתוח את המסמך");
      return;
    }

    if (popup) popup.location.href = data.signedUrl;
    else window.open(data.signedUrl, "_blank");
  };

  const exportReports = () => {
    const workbook = XLSX.utils.book_new();
    const summary = [
      ["תיק רפואי דיגיטלי", petName],
      ["תאריך הפקה", new Date().toLocaleDateString("he-IL")],
      ["ביקורים", visits.length],
      ["מרשמים", prescriptions.length],
      ["בדיקות מעבדה", labOrders.length],
      ["מסמכים", documents.length],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "סיכום");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(visits.map((visit) => ({
      תאריך: formatDate(visit.visit_date), רופא: visit.vet_name || "", סיבה: visit.reason || "", אבחנה: visit.final_diagnosis || visit.diagnosis || "", טיפול: visit.treatment || "", הערות: visit.notes || "",
    }))), "ביקורים");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(prescriptions.map((item) => ({
      תרופה: item.medication || "", מינון: item.dosage || "", תדירות: item.frequency || "", משך: item.duration || "", תאריך: formatDate(item.start_date), רופא: item.prescribed_by || "",
    }))), "מרשמים");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(labOrders.map((item) => ({
      בדיקה: item.test_name || "", קטגוריה: item.category || "", סטטוס: statusLabel(item.status), תאריך: formatDate(item.ordered_date), תוצאה: item.result_value || item.results || "", טווח: item.normal_range || "",
    }))), "מעבדה");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documents.map((item) => ({
      מסמך: item.file_name, קטגוריה: item.category, תאריך: formatDate(item.uploaded_at), סוג: item.mime_type || "",
    }))), "מסמכים");
    XLSX.writeFile(workbook, `MyVet_${petName}_medical_record.xlsx`);
    toast.success("התיק הרפואי יוצא בהצלחה");
  };

  const openPrescriptionDocument = (prescription: PrescriptionRow) => {
    setSelectedPrescription(prescription);
    setSelectedPrescriptionVisit(visits.find((visit) => visit.visit_id === prescription.visit_id) || null);
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
      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h4 className="text-gray-900 text-[15px] font-bold">תיק רפואי דיגיטלי — {petName}</h4>
          <p className="text-gray-500 font-medium text-[12px]">ביקורים, בעיות, בדיקה גופנית, אבחנות, מרשמים ומסמכים</p>
        </div>
        <button type="button" onClick={exportReports} className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-100 px-3 py-1.5 text-[13px] font-medium text-emerald-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 sm:w-auto">
          <Download className="w-3.5 h-3.5" /> ייצוא
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-gray-100 px-3 pt-3 sm:flex-wrap sm:px-4 sm:pt-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.key];
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-t-xl text-[13px] border-b-2 transition-colors cursor-pointer ${active ? "text-[#1e40af] border-[#1e40af] bg-blue-50/60" : "text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50"}`}
            >
              <Icon className="w-4 h-4" />
              <span className="font-semibold">{tab.label}</span>
              <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-[11px]">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="p-3 sm:p-5">
        {activeTab === "visits" && (
          <div className="space-y-4">
            {visits.length === 0 ? <EmptyState text="אין עדיין סיכומי ביקור" /> : visits.map((visit) => {
              const visitProblems = medicalProblems.filter((p) => p.visit_id === visit.visit_id);
              const visitExams = physicalExams.filter((e) => e.visit_id === visit.visit_id);
              const visitDifferentials = differentials.filter((d) => d.visit_id === visit.visit_id);
              const visitPrescriptions = prescriptions.filter((p) => p.visit_id === visit.visit_id);
              const expanded = expandedVisitId === visit.visit_id;

              return (
                <article key={visit.visit_id} className="border border-gray-100 rounded-2xl overflow-hidden hover:border-blue-100 transition-colors">
                  <button onClick={() => setExpandedVisitId(expanded ? null : visit.visit_id)} className="w-full p-4 text-right bg-white hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-gray-900 text-[15px]">{visit.chief_complaint || visit.reason || "ביקור רפואי"}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${urgencyClass(visit.urgency_level)}`}>{statusLabel(visit.urgency_level || "normal")}</span>
                          {visit.follow_up_required && <span className="px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 text-[11px] font-bold">נדרש מעקב</span>}
                        </div>
                        <p className="text-gray-500 text-[12px]">{formatDate(visit.visit_date)} · {visit.vet_name || "צוות המרפאה"}</p>
                      </div>
                      <span className="text-blue-600 text-[12px] font-semibold">{expanded ? "סגור" : "פתח"}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-100 p-5 bg-gray-50/40 space-y-4">
                      <Section icon={ClipboardList} title="סיבת ביקור">
                        <p>{visit.chief_complaint || visit.reason || "לא צוין"}</p>
                      </Section>

                      {visitProblems.length > 0 && (
                        <Section icon={AlertTriangle} title="בעיות רפואיות">
                          <div className="space-y-2">
                            {visitProblems.map((problem) => (
                              <div key={problem.problem_id} className="bg-white rounded-xl border border-gray-100 p-3">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-bold text-gray-900">{problem.problem_text}</span>
                                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${urgencyClass(problem.severity)}`}>{statusLabel(problem.severity)}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">{statusLabel(problem.status)}</span>
                                </div>
                                {problem.notes && <p className="text-gray-600 whitespace-pre-wrap">{problem.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </Section>
                      )}

                      {visitExams.length > 0 && (
                        <Section icon={Activity} title="בדיקה גופנית">
                          {visitExams.map((exam) => (
                            <div key={exam.physical_exam_id} className="bg-white rounded-xl border border-gray-100 p-3 mb-2 last:mb-0">
                              <p className="text-gray-500 text-[12px] mb-1">תאריך בדיקה: {formatDate(exam.exam_date)}</p>
                              <p className="whitespace-pre-wrap leading-7">{exam.findings}</p>
                            </div>
                          ))}
                        </Section>
                      )}

                      <Section icon={Stethoscope} title="טיפול">
                        <p className="whitespace-pre-wrap">{visit.treatment || "לא צוין"}</p>
                      </Section>

                      {visitDifferentials.length > 0 && (
                        <Section icon={FileText} title="אבחנות מבדלות">
                          <div className="space-y-2">
                            {visitDifferentials.map((diagnosis) => (
                              <div key={diagnosis.diagnosis_id} className="bg-white rounded-xl border border-gray-100 p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-gray-900">{diagnosis.diagnosis_text}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">{statusLabel(diagnosis.likelihood)}</span>
                                </div>
                                {diagnosis.notes && <p className="text-gray-600 whitespace-pre-wrap">{diagnosis.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </Section>
                      )}

                      <Section icon={CheckCircle2} title="אבחנה סופית">
                        <p className="whitespace-pre-wrap">{visit.final_diagnosis || visit.diagnosis || "לא צוין"}</p>
                      </Section>

                      {visitPrescriptions.length > 0 && (
                        <Section icon={Pill} title="מרשמים מהביקור">
                          <div className="space-y-2">
                            {visitPrescriptions.map((prescription) => (
                              <div key={prescription.prescription_id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold text-gray-900">{prescription.medication}</p>
                                  <p className="text-gray-600 text-[13px] mt-1">{[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(" · ")}</p>
                                </div>
                                <button
                                  onClick={() => openPrescriptionDocument(prescription)}
                                  className="shrink-0 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-[12px] font-semibold"
                                >
                                  הצג מרשם
                                </button>
                              </div>
                            ))}
                          </div>
                        </Section>
                      )}

                      {visit.notes && (
                        <Section icon={MessageIcon} title="סיכום והערות">
                          <p className="whitespace-pre-wrap leading-7">{visit.notes}</p>
                        </Section>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {activeTab === "prescriptions" && (
          <div className="space-y-3">
            {prescriptions.length === 0 ? <EmptyState text="אין מרשמים" /> : prescriptions.map((prescription) => (
              <div key={prescription.prescription_id} className="border border-gray-100 rounded-2xl p-4 flex items-start justify-between gap-4">
                <div>
                  <h5 className="font-bold text-gray-900 text-[15px]">{prescription.medication || "תרופה"}</h5>
                  <p className="text-gray-500 text-[13px] mt-1">{[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(" · ")}</p>
                  <p className="text-gray-400 text-[12px] mt-1">תאריך התחלה: {formatDate(prescription.start_date)}</p>
                </div>
                <button
                  onClick={() => openPrescriptionDocument(prescription)}
                  className="text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-[12px] font-semibold"
                >
                  הצג מרשם
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "labs" && (
          <div className="space-y-3">
            {labOrders.length === 0 ? <EmptyState text="אין בדיקות מעבדה" /> : labOrders.map((lab) => (
              <div key={lab.lab_order_id} className="border border-gray-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h5 className="font-bold text-gray-900 text-[15px]">{lab.test_name || "בדיקת מעבדה"}</h5>
                    <p className="text-gray-500 text-[13px] mt-1">הוזמן: {formatDate(lab.ordered_date)} · תאריך בדיקה: {formatDate(lab.test_date)}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${lab.result_status === "critical" || lab.is_urgent ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"}`}>{lab.is_urgent ? "דחוף" : statusLabel(lab.status)}</span>
                </div>
                {(lab.result_value || lab.results || lab.notes) && (
                  <div className="mt-3 bg-gray-50 rounded-xl p-3 text-[13px] text-gray-700 whitespace-pre-wrap">
                    {lab.result_value && <p><b>תוצאה:</b> {lab.result_value}</p>}
                    {lab.results && <p>{lab.results}</p>}
                    {lab.notes && <p><b>הערות:</b> {lab.notes}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-3">
            {documents.length === 0 ? <EmptyState text="אין מסמכים" /> : documents.map((doc) => (
              <div key={doc.document_id} className="border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h5 className="font-bold text-gray-900 text-[14px] truncate">{doc.file_name}</h5>
                  <p className="text-gray-500 text-[12px] mt-1">{formatDate(doc.uploaded_at)} {fileSize(doc.file_size) && `· ${fileSize(doc.file_size)}`}</p>
                </div>
                <button onClick={() => openDocument(doc)} className="flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-[12px] font-semibold">
                  <Eye className="w-4 h-4" /> פתח
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <PrescriptionDocumentModal
        isOpen={Boolean(selectedPrescription)}
        onClose={() => {
          setSelectedPrescription(null);
          setSelectedPrescriptionVisit(null);
        }}
        prescription={selectedPrescription}
        petName={petName}
        owner={ownerInfo}
        visit={selectedPrescriptionVisit}
      />
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h5 className="flex items-center gap-2 text-gray-900 font-bold text-[14px] mb-2">
        <Icon className="w-4 h-4 text-[#1e40af]" /> {title}
      </h5>
      <div className="text-gray-700 text-[13px] leading-6">{children}</div>
    </div>
  );
}

function MessageIcon(props: any) {
  return <FileText {...props} />;
}
