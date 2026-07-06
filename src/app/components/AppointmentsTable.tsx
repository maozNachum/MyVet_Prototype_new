import {
  Clock,
  X,
  Dog,
  Cat,
  Calendar,
  Building2,
  Stethoscope,
  AlertTriangle,
  Activity,
  Pill,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { TreatmentModal } from "./TreatmentModal";
import { canEditMedicalRecords, getStaffType } from "../data/staffAuth";
import {
  useAppointmentStore,
  type CalendarAppointment,
} from "../data/AppointmentStore";
import { supabase } from "../../services/supabaseClient";

const TableSkeletonRow = () => (
  <tr className="animate-pulse border-b border-gray-50">
    <td className="px-6 py-5">
      <div className="h-4 w-12 bg-gray-100 rounded-md"></div>
    </td>
    <td className="px-6 py-5">
      <div className="h-6 w-20 bg-gray-100 rounded-full"></div>
    </td>
    <td className="px-6 py-5">
      <div className="h-4 w-24 bg-gray-100 rounded-md"></div>
    </td>
    <td className="px-6 py-5">
      <div className="h-4 w-24 bg-gray-100 rounded-md"></div>
    </td>
    <td className="px-6 py-5">
      <div className="h-4 w-28 bg-gray-100 rounded-md"></div>
    </td>
    <td className="px-6 py-5">
      <div className="h-6 w-24 bg-gray-100 rounded-full"></div>
    </td>
    <td className="px-6 py-5">
      <div className="h-8 w-24 bg-gray-100 rounded-lg ml-auto"></div>
    </td>
  </tr>
);

type PatientSnapshotRow = {
  pet_id: number | string;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  weight: number | string | null;
  allergies: string | null;
  owner_id: string | null;
};

type MedicalVisitSnapshotRow = {
  visit_id: number | string;
  visit_date: string | null;
  visit_type: string | null;
  chief_complaint: string | null;
  final_diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
};

type PrescriptionSnapshotRow = {
  prescription_id: number | string;
  medication: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  start_date: string | null;
};

type ProblemSnapshotRow = {
  problem_id: number | string;
  problem_text: string | null;
  severity: string | null;
  status: string | null;
};

type AppointmentSnapshot = {
  patient: PatientSnapshotRow | null;
  visits: MedicalVisitSnapshotRow[];
  prescriptions: PrescriptionSnapshotRow[];
  activeProblems: ProblemSnapshotRow[];
};

function isSameDay(appt: CalendarAppointment, date: Date) {
  return (
    appt.day === date.getDate() &&
    appt.month === date.getMonth() &&
    appt.year === date.getFullYear()
  );
}

function appointmentStartDate(appt: CalendarAppointment) {
  const [hour, minute] = appt.time.split(":").map(Number);
  return new Date(
    appt.year,
    appt.month,
    appt.day,
    hour || 0,
    minute || 0,
    0,
    0,
  );
}

function appointmentEndDate(appt: CalendarAppointment) {
  const [hour, minute] = (appt.endTime || appt.time).split(":").map(Number);
  return new Date(
    appt.year,
    appt.month,
    appt.day,
    hour || 0,
    minute || 0,
    0,
    0,
  );
}

function getStatusUI(appt: CalendarAppointment) {
  const now = new Date();
  const start = appointmentStartDate(appt);
  const end = appointmentEndDate(appt);

  if (Number.isNaN(start.getTime())) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 text-[12px] font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> מתוכנן
      </span>
    );
  }

  if (now < start) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 text-[12px] font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> טרם הגיע
      </span>
    );
  }

  if (now >= start && now <= end) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 text-[12px] font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />{" "}
        עכשיו
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-[12px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> עבר
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("he-IL");
}

function visitTypeLabel(type?: string | null) {
  switch (type) {
    case "full_exam":
      return "בדיקה רפואית מלאה";
    case "vaccination":
      return "חיסון";
    case "weight_check":
      return "שקילה";
    case "prescription_only":
      return "מרשם בלבד";
    case "lab":
      return "בדיקת מעבדה";
    case "follow_up":
      return "מעקב קצר";
    case "note":
      return "הערה רפואית";
    default:
      return type || "ביקור רפואי";
  }
}

function severityLabel(severity?: string | null) {
  if (severity === "critical") return "קריטי";
  if (severity === "serious") return "חמור";
  return "רגיל";
}

export function AppointmentsTable() {
  const { calendarAppointments, isLoading } = useAppointmentStore();
  const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(
    null,
  );
  const [treatmentAppt, setTreatmentAppt] =
    useState<CalendarAppointment | null>(null);
  const [snapshot, setSnapshot] = useState<AppointmentSnapshot | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const navigate = useNavigate();
  const staffType = getStaffType();
  const isSecretary = staffType === "secretary";
  const canTreat = canEditMedicalRecords();

  const todayAppointments = useMemo(() => {
    const now = new Date();
    return (calendarAppointments || [])
      .filter((appt) => isSameDay(appt, now))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(0, 8);
  }, [calendarAppointments]);

  useEffect(() => {
    let mounted = true;

    async function loadSnapshot() {
      if (!selectedAppt?.petId || isSecretary) {
        setSnapshot(null);
        setSnapshotError(null);
        setIsSnapshotLoading(false);
        return;
      }

      setIsSnapshotLoading(true);
      setSnapshotError(null);

      try {
        const [
          { data: patientRows, error: patientError },
          { data: visitsRows, error: visitsError },
          { data: prescriptionRows, error: prescriptionsError },
          { data: problemRows, error: problemsError },
        ] = await Promise.all([
          supabase
            .from("patients")
            .select(
              "pet_id, pet_name, species, breed, weight, allergies, owner_id",
            )
            .eq("pet_id", selectedAppt.petId)
            .limit(1),
          supabase
            .from("medical_visits")
            .select(
              "visit_id, visit_date, visit_type, chief_complaint, final_diagnosis, treatment, notes",
            )
            .eq("pet_id", selectedAppt.petId)
            .order("visit_date", { ascending: false })
            .limit(3),
          supabase
            .from("prescriptions")
            .select(
              "prescription_id, medication, dosage, frequency, duration, start_date",
            )
            .eq("pet_id", selectedAppt.petId)
            .order("start_date", { ascending: false })
            .limit(5),
          supabase
            .from("medical_problems")
            .select("problem_id, problem_text, severity, status")
            .eq("pet_id", selectedAppt.petId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        if (patientError) throw patientError;
        if (visitsError) throw visitsError;
        if (prescriptionsError) throw prescriptionsError;
        if (problemsError) throw problemsError;

        if (!mounted) return;
        setSnapshot({
          patient: ((patientRows || []) as PatientSnapshotRow[])[0] || null,
          visits: (visitsRows || []) as MedicalVisitSnapshotRow[],
          prescriptions: (prescriptionRows || []) as PrescriptionSnapshotRow[],
          activeProblems: (problemRows || []) as ProblemSnapshotRow[],
        });
      } catch (err) {
        console.error("Failed to load appointment medical snapshot", err);
        if (mounted) {
          setSnapshot(null);
          setSnapshotError("לא הצלחנו לטעון תקציר רפואי מהמסד");
        }
      } finally {
        if (mounted) setIsSnapshotLoading(false);
      }
    }

    loadSnapshot();
    return () => {
      mounted = false;
    };
  }, [selectedAppt, isSecretary]);

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-8">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 rounded-lg p-2">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <h2
              className="text-gray-900 text-[18px]"
              style={{ fontWeight: 600 }}
            >
              תקציר תורים להיום
            </h2>
          </div>
          <span className="text-gray-500 font-medium text-[14px]">
            {isLoading ? "טוען..." : `${todayAppointments.length} תורים`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100/60 border-b border-gray-200">
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  שעה
                </th>
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  סטטוס
                </th>
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  שם בעלים
                </th>
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  שם חיית מחמד
                </th>
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  סוג טיפול
                </th>
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px]"
                  style={{ fontWeight: 700 }}
                >
                  מחלקה / יעד
                </th>
                <th
                  className="text-right px-6 py-3.5 text-gray-700 text-[14px] w-32"
                  style={{ fontWeight: 700 }}
                >
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <>
                  <TableSkeletonRow />
                  <TableSkeletonRow />
                  <TableSkeletonRow />
                  <TableSkeletonRow />
                </>
              ) : todayAppointments.length > 0 ? (
                todayAppointments.map((appt) => {
                  const PetIcon = appt.petSpecies === "cat" ? Cat : Dog;
                  return (
                    <tr
                      key={appt.id}
                      onClick={() => setSelectedAppt(appt)}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                    >
                      <td
                        className="px-6 py-4 text-gray-900 text-[14px]"
                        style={{ fontWeight: 600 }}
                      >
                        {appt.time}
                      </td>
                      <td className="px-6 py-4">{getStatusUI(appt)}</td>
                      <td className="px-6 py-4 text-gray-600 text-[14px]">
                        {appt.ownerName}
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-[14px]">
                        <div className="flex items-center gap-2">
                          <PetIcon className="w-4 h-4 text-gray-500 font-medium shrink-0" />
                          <span className="whitespace-nowrap">
                            {appt.petName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-[14px]">
                        {appt.type}
                      </td>
                      <td className="px-6 py-4">
                        {appt.department === "וטרינר פרטי" ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[12px]"
                            style={{ fontWeight: 500 }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{" "}
                            וטרינר פרטי
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[12px]"
                            style={{ fontWeight: 500 }}
                          >
                            <Building2 className="w-3 h-3" /> {appt.department}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          {canTreat ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTreatmentAppt(appt);
                              }}
                              className="flex items-center gap-1.5 border border-blue-200 bg-transparent text-blue-700 hover:bg-blue-50/70 hover:border-blue-300 px-3.5 py-1.5 rounded-full text-[13px] transition-all cursor-pointer font-medium"
                            >
                              <Stethoscope className="w-3.5 h-3.5 opacity-80" />{" "}
                              הוסף רשומה
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppt(appt);
                              }}
                              className="flex items-center gap-1.5 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 px-3.5 py-1.5 rounded-full text-[13px] transition-all cursor-pointer font-medium"
                            >
                              פרטי תור
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-gray-500 text-[14px]"
                  >
                    אין תורים להיום במסד.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAppt && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setSelectedAppt(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  {selectedAppt.petSpecies === "cat" ? (
                    <Cat className="w-6 h-6 text-white" />
                  ) : (
                    <Dog className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h3
                    className="text-white text-[20px]"
                    style={{ fontWeight: 700 }}
                  >
                    {selectedAppt.petName}
                  </h3>
                  <p className="text-white/80 text-[13px]">
                    {selectedAppt.ownerName} | {selectedAppt.type} |{" "}
                    {selectedAppt.time}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppt(null)}
                className="text-white/60 hover:text-white cursor-pointer p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {isSecretary ? (
                <>
                  <div className="space-y-5">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                      <h4
                        className="flex items-center gap-2 text-blue-800 text-[14px] mb-3"
                        style={{ fontWeight: 700 }}
                      >
                        <Calendar className="w-4 h-4 text-blue-500" /> פרטי התור
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-gray-500 text-[11px] font-semibold">
                            סוג טיפול
                          </p>
                          <p className="text-gray-900 text-[14px] font-bold">
                            {selectedAppt.type}
                          </p>
                        </div>
                        <div className="flex justify-between gap-4">
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              שעה
                            </p>
                            <p className="text-gray-900 text-[14px] font-bold">
                              {selectedAppt.time}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              מחלקה
                            </p>
                            <p className="text-gray-900 text-[14px] font-bold">
                              {selectedAppt.department}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-gray-500 text-[11px] font-semibold">
                            רופא / יעד
                          </p>
                          <p className="text-gray-900 text-[14px] font-bold">
                            {selectedAppt.vet || "לא שובץ"}
                          </p>
                        </div>
                        {selectedAppt.notes && (
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              הערות תור
                            </p>
                            <p className="text-gray-900 text-[13px]">
                              {selectedAppt.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                      <h4
                        className="flex items-center gap-2 text-gray-800 text-[14px] mb-3"
                        style={{ fontWeight: 700 }}
                      >
                        <ClipboardList className="w-4 h-4 text-gray-500" /> פרטי
                        שירות
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-gray-500 text-[11px] font-semibold">
                            בעלים
                          </p>
                          <p className="text-gray-900 text-[14px] font-bold">
                            {selectedAppt.ownerName}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-[11px] font-semibold">
                            חיית מחמד
                          </p>
                          <p className="text-gray-900 text-[14px] font-bold">
                            {selectedAppt.petName}
                          </p>
                        </div>
                        <p className="text-gray-500 text-[13px] leading-6 bg-white rounded-lg border border-gray-100 p-3">
                          בתפקיד מזכירה מוצגים כאן פרטי תור ושירות בלבד. מידע
                          רפואי מלא ופתיחת רשומה רפואית זמינים רק לווטרינר או
                          אחות.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : isSnapshotLoading ? (
                <div className="md:col-span-2 py-10 text-center text-gray-500">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-blue-500" />
                  טוען תקציר רפואי מהמסד...
                </div>
              ) : snapshotError ? (
                <div className="md:col-span-2 py-8 text-center text-red-500 text-[14px]">
                  {snapshotError}
                </div>
              ) : (
                <>
                  <div className="space-y-5">
                    <div>
                      <h4
                        className="flex items-center gap-2 text-gray-800 text-[14px] mb-2"
                        style={{ fontWeight: 700 }}
                      >
                        <AlertTriangle className="w-4 h-4 text-red-500" />{" "}
                        רגישויות ואזהרות
                      </h4>
                      {snapshot?.patient?.allergies ? (
                        <div className="flex flex-wrap gap-2">
                          {snapshot.patient.allergies
                            .split(/[,;\n]/)
                            .map((a) => a.trim())
                            .filter(Boolean)
                            .map((allergy) => (
                              <span
                                key={allergy}
                                className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-lg text-[12px] font-semibold"
                              >
                                {allergy}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-[13px] bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          לא תועדו רגישויות במסד.
                        </p>
                      )}
                    </div>

                    <div>
                      <h4
                        className="flex items-center gap-2 text-gray-800 text-[14px] mb-2"
                        style={{ fontWeight: 700 }}
                      >
                        <ClipboardList className="w-4 h-4 text-blue-500" />{" "}
                        בעיות רפואיות פעילות
                      </h4>
                      {snapshot?.activeProblems?.length ? (
                        <ul className="space-y-1.5">
                          {snapshot.activeProblems.map((problem) => (
                            <li
                              key={problem.problem_id}
                              className="text-gray-600 text-[13px] bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 flex items-center justify-between gap-2"
                            >
                              <span>
                                {problem.problem_text || "בעיה רפואית"}
                              </span>
                              <span className="text-[11px] text-orange-600 font-semibold">
                                {severityLabel(problem.severity)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 text-[13px] bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          אין בעיות פעילות מתועדות.
                        </p>
                      )}
                    </div>

                    <div>
                      <h4
                        className="flex items-center gap-2 text-gray-800 text-[14px] mb-2"
                        style={{ fontWeight: 700 }}
                      >
                        <Pill className="w-4 h-4 text-indigo-500" /> מרשמים
                        אחרונים
                      </h4>
                      {snapshot?.prescriptions?.length ? (
                        <ul className="space-y-1.5">
                          {snapshot.prescriptions.map((rx) => (
                            <li
                              key={rx.prescription_id}
                              className="text-gray-600 text-[13px] bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100"
                            >
                              <span className="font-semibold text-gray-800">
                                {rx.medication || "תרופה"}
                              </span>
                              {(rx.dosage || rx.frequency || rx.duration) && (
                                <span>
                                  {" "}
                                  —{" "}
                                  {[rx.dosage, rx.frequency, rx.duration]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 text-[13px] bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                          אין מרשמים אחרונים במסד.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                      <h4
                        className="flex items-center gap-2 text-blue-800 text-[14px] mb-3"
                        style={{ fontWeight: 700 }}
                      >
                        <Calendar className="w-4 h-4 text-blue-500" /> פרטי
                        הביקור להיום
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-gray-500 text-[11px] font-semibold">
                            סוג טיפול
                          </p>
                          <p className="text-gray-900 text-[14px] font-bold">
                            {selectedAppt.type}
                          </p>
                        </div>
                        <div className="flex justify-between gap-4">
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              שעה
                            </p>
                            <p className="text-gray-900 text-[14px] font-bold">
                              {selectedAppt.time}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              רופא מטפל
                            </p>
                            <p className="text-gray-900 text-[14px] font-bold">
                              {selectedAppt.vet}
                            </p>
                          </div>
                        </div>
                        {selectedAppt.notes && (
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              הערות תור
                            </p>
                            <p className="text-gray-900 text-[13px]">
                              {selectedAppt.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4
                          className="flex items-center gap-2 text-emerald-800 text-[14px]"
                          style={{ fontWeight: 700 }}
                        >
                          <Activity className="w-4 h-4 text-emerald-500" />{" "}
                          נתונים רפואיים אחרונים
                        </h4>
                      </div>
                      <div className="space-y-3">
                        <div className="flex gap-4">
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              משקל
                            </p>
                            <p className="text-gray-900 text-[15px] font-bold">
                              {snapshot?.patient?.weight
                                ? `${snapshot.patient.weight} ק״ג`
                                : "לא תועד"}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-[11px] font-semibold">
                              ביקור אחרון
                            </p>
                            <p className="text-gray-900 text-[15px] font-bold">
                              {snapshot?.visits?.[0]?.visit_date
                                ? formatDate(snapshot.visits[0].visit_date)
                                : "אין"}
                            </p>
                          </div>
                        </div>
                        {snapshot?.visits?.length ? (
                          <div className="space-y-1.5 pt-2 border-t border-emerald-100">
                            {snapshot.visits.map((visit) => (
                              <div
                                key={visit.visit_id}
                                className="text-[12px] text-gray-600 bg-white/70 rounded-lg px-3 py-2 border border-emerald-100"
                              >
                                <span className="font-semibold text-gray-800">
                                  {visitTypeLabel(visit.visit_type)}
                                </span>
                                {visit.final_diagnosis && (
                                  <span> · {visit.final_diagnosis}</span>
                                )}
                                {visit.chief_complaint && (
                                  <span> · {visit.chief_complaint}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex gap-3">
              {isSecretary ? (
                <>
                  <button
                    type="button"
                    className="flex-1 py-3 rounded-xl transition-colors text-[14px] shadow-sm bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer"
                    style={{ fontWeight: 600 }}
                    onClick={() => navigate("/appointments")}
                  >
                    פתח ביומן
                  </button>
                  <button
                    type="button"
                    className="flex-1 py-3 rounded-xl transition-colors text-[14px] shadow-sm bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                    style={{ fontWeight: 600 }}
                    onClick={() => navigate("/digital-care")}
                  >
                    פתח פנייה דיגיטלית
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`flex-1 py-3 rounded-xl transition-colors text-[14px] shadow-sm ${canTreat ? "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer" : "bg-gray-200 text-gray-500 font-medium cursor-not-allowed"}`}
                  style={{ fontWeight: 600 }}
                  onClick={() => {
                    if (canTreat) {
                      setTreatmentAppt(selectedAppt);
                      setSelectedAppt(null);
                    }
                  }}
                  disabled={!canTreat}
                >
                  {canTreat ? "הוסף רשומה רפואית" : "🔒 מורשים בלבד"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedAppt(null)}
                className="px-6 py-3 border border-gray-200 bg-white rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-[14px] font-bold cursor-pointer"
              >
                סגור תצוגה
              </button>
            </div>
          </div>
        </div>
      )}

      {treatmentAppt && (
        <TreatmentModal
          isOpen={true}
          onClose={() => setTreatmentAppt(null)}
          petName={treatmentAppt.petName}
          petSpecies={treatmentAppt.petSpecies}
          ownerName={treatmentAppt.ownerName}
          patientId={treatmentAppt.petId}
        />
      )}
    </>
  );
}
