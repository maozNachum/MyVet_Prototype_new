import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  FlaskConical,
  Hospital,
  Pill,
  Search,
  Stethoscope,
  Syringe,
  Video,
  type LucideIcon,
} from "lucide-react";
import type {
  DifferentialDiagnosis,
  MedicalProblem,
  MedicalVisit,
  PhysicalExam,
  Prescription,
} from "../data/MedicalStore";

type TimelineFilter = "all" | "critical" | "follow_up" | "lab" | "prescription" | "vaccination" | "video" | "hospitalization";

type PatientMedicalTimelineProps = {
  visits: MedicalVisit[];
  prescriptions: Prescription[];
  getPhysicalExamsForVisit: (visitId: number) => PhysicalExam[];
  getMedicalProblemsForVisit: (visitId: number) => MedicalProblem[];
  getDifferentialDiagnosesForVisit: (visitId: number) => DifferentialDiagnosis[];
  onOpenPrescription: (prescription: Prescription, visit: MedicalVisit | null) => void;
};

const filters: Array<{ id: TimelineFilter; label: string }> = [
  { id: "all", label: "הכול" },
  { id: "critical", label: "דחופים" },
  { id: "follow_up", label: "מעקב" },
  { id: "lab", label: "מעבדה" },
  { id: "prescription", label: "מרשמים" },
  { id: "vaccination", label: "חיסונים" },
  { id: "video", label: "וידאו" },
  { id: "hospitalization", label: "אשפוז" },
];

function visitTypeConfig(visitType?: string | null): { label: string; icon: LucideIcon; color: string } {
  switch (visitType) {
    case "vaccination":
      return { label: "חיסון", icon: Syringe, color: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    case "weight_check":
      return { label: "שקילה", icon: Activity, color: "bg-sky-50 text-sky-700 border-sky-100" };
    case "prescription_only":
      return { label: "מרשם", icon: Pill, color: "bg-purple-50 text-purple-700 border-purple-100" };
    case "lab":
      return { label: "בדיקת מעבדה", icon: FlaskConical, color: "bg-amber-50 text-amber-700 border-amber-100" };
    case "follow_up":
      return { label: "מעקב", icon: CalendarDays, color: "bg-indigo-50 text-indigo-700 border-indigo-100" };
    case "note":
      return { label: "הערה רפואית", icon: FileText, color: "bg-gray-50 text-gray-700 border-gray-100" };
    case "hospitalization":
      return { label: "פתיחת אשפוז", icon: Hospital, color: "bg-orange-50 text-orange-700 border-orange-100" };
    case "hospitalization_discharge":
      return { label: "שחרור מאשפוז", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    case "video_consultation":
      return { label: "שיחת וידאו", icon: Video, color: "bg-blue-50 text-blue-700 border-blue-100" };
    case "full_exam":
    default:
      return { label: "בדיקה רפואית", icon: Stethoscope, color: "bg-blue-50 text-blue-700 border-blue-100" };
  }
}

function severityLabel(value?: string | null) {
  switch (value) {
    case "critical":
      return "קריטי";
    case "serious":
      return "חמור";
    default:
      return "רגיל";
  }
}

function severityClass(value?: string | null) {
  switch (value) {
    case "critical":
      return "bg-red-50 text-red-700 border-red-200";
    case "serious":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

function statusLabel(value?: string | null) {
  switch (value) {
    case "active":
      return "פעיל";
    case "improved":
      return "השתפר";
    case "resolved":
      return "נפתר";
    case "low":
      return "נמוכה";
    case "possible":
      return "אפשרית";
    case "likely":
      return "סבירה";
    default:
      return value || "לא צוין";
  }
}

function TextBlock({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-2 mb-2 text-gray-900 font-bold text-[14px]">
        <Icon className="w-4 h-4 text-[#1e40af]" />
        {title}
      </div>
      <div className="text-gray-600 text-[14px] leading-7 whitespace-pre-wrap">{children}</div>
    </section>
  );
}

function visitMatchesFilter(visit: MedicalVisit, visitPrescriptions: Prescription[], filter: TimelineFilter) {
  if (filter === "all") return true;
  if (filter === "critical") return visit.urgencyLevel === "critical" || visit.urgencyLevel === "serious";
  if (filter === "follow_up") return Boolean(visit.followUpRequired) || visit.visitType === "follow_up";
  if (filter === "lab") return visit.visitType === "lab";
  if (filter === "prescription") return visit.visitType === "prescription_only" || visitPrescriptions.length > 0;
  if (filter === "vaccination") return visit.visitType === "vaccination";
  if (filter === "video") return visit.visitType === "video_consultation";
  if (filter === "hospitalization") return visit.visitType === "hospitalization" || visit.visitType === "hospitalization_discharge";
  return true;
}

function visitMatchesSearch(visit: MedicalVisit, query: string, prescriptions: Prescription[]) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const searchable = [
    visit.reason,
    visit.chiefComplaint,
    visit.diagnosis,
    visit.finalDiagnosis,
    visit.treatment,
    visit.notes,
    visit.followUpNotes,
    visit.vetName,
    ...prescriptions.map((p) => [p.medication, p.dosage, p.frequency, p.duration].filter(Boolean).join(" ")),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(q);
}

export function PatientMedicalTimeline({
  visits,
  prescriptions,
  getPhysicalExamsForVisit,
  getMedicalProblemsForVisit,
  getDifferentialDiagnosesForVisit,
  onOpenPrescription,
}: PatientMedicalTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedVisitId, setExpandedVisitId] = useState<number | null>(visits[0]?.id ?? null);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const visitPrescriptions = prescriptions.filter((p) => p.visitId === visit.id);
      return visitMatchesFilter(visit, visitPrescriptions, activeFilter) && visitMatchesSearch(visit, query, visitPrescriptions);
    });
  }, [activeFilter, prescriptions, query, visits]);

  const visitsWithFollowUp = visits.filter((visit) => visit.followUpRequired).length;
  const urgentVisits = visits.filter((visit) => visit.urgencyLevel === "critical" || visit.urgencyLevel === "serious").length;
  const linkedPrescriptions = prescriptions.filter((prescription) => prescription.visitId).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h3 className="text-gray-900 text-[18px] font-bold">ציר זמן רפואי</h3>
            <p className="text-gray-500 text-[13px] mt-1">ביקורים, מעקבים, מרשמים, בדיקות ואשפוזים</p>
          </div>

          <div className="grid grid-cols-3 gap-2 min-w-[280px]">
            <div className="rounded-2xl bg-blue-50 border border-blue-100 px-3 py-2 text-center">
              <p className="text-blue-700 text-[18px] font-bold">{visits.length}</p>
              <p className="text-blue-700/70 text-[11px] font-semibold">רשומות</p>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2 text-center">
              <p className="text-amber-700 text-[18px] font-bold">{visitsWithFollowUp}</p>
              <p className="text-amber-700/70 text-[11px] font-semibold">מעקבים</p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-100 px-3 py-2 text-center">
              <p className="text-red-700 text-[18px] font-bold">{urgentVisits}</p>
              <p className="text-red-700/70 text-[11px] font-semibold">דחופים</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חפש סיבת ביקור, אבחנה, טיפול או רופא"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-10 pl-3 text-[14px] outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`px-3 py-2 rounded-xl border text-[12px] font-bold transition-colors ${
                  activeFilter === filter.id
                    ? "bg-[#1e40af] text-white border-[#1e40af] shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        {filteredVisits.length > 0 ? (
          <div className="relative space-y-4 before:absolute before:top-3 before:bottom-3 before:right-[21px] before:w-px before:bg-gray-100">
            {filteredVisits.map((visit) => {
              const cfg = visitTypeConfig(visit.visitType);
              const Icon = cfg.icon;
              const expanded = expandedVisitId === visit.id;
              const visitProblems = getMedicalProblemsForVisit(visit.id);
              const visitExams = getPhysicalExamsForVisit(visit.id);
              const visitDifferentials = getDifferentialDiagnosesForVisit(visit.id);
              const visitPrescriptions = prescriptions.filter((prescription) => prescription.visitId === visit.id);
              const preview = visit.finalDiagnosis || visit.diagnosis || visit.treatment || visit.notes || "פתחו את הרשומה לצפייה בפרטים";

              return (
                <article key={visit.id} className="relative pr-12">
                  <div className={`absolute right-0 top-4 w-11 h-11 rounded-2xl border flex items-center justify-center ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className={`rounded-2xl border bg-white transition-all ${expanded ? "border-blue-200 shadow-sm" : "border-gray-100 hover:border-blue-100"}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedVisitId(expanded ? null : visit.id)}
                      className="w-full p-4 text-right cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-gray-900 text-[15px] font-bold">{visit.chiefComplaint || visit.reason || cfg.label}</span>
                            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${severityClass(visit.urgencyLevel)}`}>
                              {severityLabel(visit.urgencyLevel)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">{cfg.label}</span>
                            {visitPrescriptions.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
                                {visitPrescriptions.length} מרשמים
                              </span>
                            )}
                            {visit.followUpRequired && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[11px] font-bold">מעקב</span>
                            )}
                          </div>
                          <p className="text-gray-500 text-[13px] font-medium">{visit.date} · {visit.vetName || "צוות המרפאה"}</p>
                          <p className="text-gray-500 text-[13px] mt-1 line-clamp-1">{preview}</p>
                        </div>

                        <span className="shrink-0 inline-flex items-center gap-1 text-blue-700 text-[12px] font-bold mt-1">
                          {expanded ? "סגור" : "פתח"}
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-100 bg-gray-50/60 p-5 space-y-4">
                        <TextBlock icon={ClipboardList} title="פרטי ביקור">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <p><b>תאריך:</b> {visit.date}</p>
                            <p><b>רופא מטפל:</b> {visit.vetName || "לא צוין"}</p>
                            <p><b>סוג רשומה:</b> {cfg.label}</p>
                            <p><b>רמת דחיפות:</b> {severityLabel(visit.urgencyLevel)}</p>
                          </div>
                          <p className="mt-2"><b>סיבת ביקור:</b> {visit.chiefComplaint || visit.reason || "לא צוין"}</p>
                        </TextBlock>

                        {visitProblems.length > 0 && (
                          <TextBlock icon={AlertTriangle} title="בעיות / תלונות">
                            <div className="space-y-2 whitespace-normal">
                              {visitProblems.map((problem) => (
                                <div key={problem.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <b className="text-gray-900">{problem.problemText}</b>
                                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${severityClass(problem.severity)}`}>{severityLabel(problem.severity)}</span>
                                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold">{statusLabel(problem.status)}</span>
                                  </div>
                                  {problem.notes && <p className="text-gray-600 whitespace-pre-wrap">{problem.notes}</p>}
                                </div>
                              ))}
                            </div>
                          </TextBlock>
                        )}

                        {visitExams.length > 0 && (
                          <TextBlock icon={Activity} title="בדיקה גופנית">
                            <div className="space-y-2 whitespace-normal">
                              {visitExams.map((exam) => (
                                <div key={exam.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                  <p className="text-gray-400 text-[12px] mb-1">{exam.examDate}</p>
                                  <p className="whitespace-pre-wrap leading-7">{exam.findings || "לא צוין"}</p>
                                </div>
                              ))}
                            </div>
                          </TextBlock>
                        )}

                        <TextBlock icon={Stethoscope} title="טיפול והנחיות">
                          {visit.treatment || "לא צוין"}
                        </TextBlock>

                        {visitDifferentials.length > 0 && (
                          <TextBlock icon={FileText} title="אבחנות מבדלות">
                            <div className="space-y-2 whitespace-normal">
                              {visitDifferentials.map((diagnosis) => (
                                <div key={diagnosis.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <b className="text-gray-900">{diagnosis.diagnosisText}</b>
                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">{statusLabel(diagnosis.likelihood)}</span>
                                  </div>
                                  {diagnosis.notes && <p className="text-gray-600 whitespace-pre-wrap">{diagnosis.notes}</p>}
                                </div>
                              ))}
                            </div>
                          </TextBlock>
                        )}

                        <TextBlock icon={CheckCircle2} title="אבחנה סופית">
                          {visit.finalDiagnosis || visit.diagnosis || "לא צוין"}
                        </TextBlock>

                        {visitPrescriptions.length > 0 && (
                          <TextBlock icon={Pill} title="מרשמים">
                            <div className="space-y-2 whitespace-normal">
                              {visitPrescriptions.map((prescription) => (
                                <div key={prescription.id} className="rounded-xl border border-gray-100 bg-white p-3 flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-bold text-gray-900">{prescription.medication || "תרופה"}</p>
                                    <p className="text-gray-600 text-[13px] mt-1">{[prescription.dosage, prescription.frequency, prescription.duration].filter(Boolean).join(" · ") || "אין פרטי מינון"}</p>
                                    <p className="text-gray-400 text-[12px] mt-1">תאריך התחלה: {prescription.startDate || "לא צוין"}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onOpenPrescription(prescription, visit);
                                    }}
                                    className="shrink-0 flex items-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer"
                                  >
                                    <FileText className="w-4 h-4" /> הצג מרשם
                                  </button>
                                </div>
                              ))}
                            </div>
                          </TextBlock>
                        )}

                        {(visit.notes || visit.followUpNotes) && (
                          <TextBlock icon={FileText} title="סיכום והערות">
                            {visit.notes && <p>{visit.notes}</p>}
                            {visit.followUpNotes && <p className="mt-2"><b>הערות מעקב:</b> {visit.followUpNotes}</p>}
                          </TextBlock>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : visits.length === 0 ? (
          <div className="text-center py-12 text-gray-500 font-medium">
            <Stethoscope className="w-9 h-9 mx-auto mb-3 text-gray-300" />
            <p>אין רשומות רפואיות עדיין</p>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 font-medium">
            <Search className="w-9 h-9 mx-auto mb-3 text-gray-300" />
            <p>לא נמצאו רשומות מתאימות</p>
          </div>
        )}

        {linkedPrescriptions === 0 && visits.length > 0 && prescriptions.some((prescription) => !prescription.visitId) && (
          <p className="sr-only">מרשמים כלליים מוצגים בהמשך המסך</p>
        )}
      </div>
    </div>
  );
}
