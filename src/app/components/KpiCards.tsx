import {
  Calendar,
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  MapPin,
  Dog,
  Cat,
  Rabbit,
  X,
  Loader2,
  MessageCircle,
  CreditCard,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../../services/supabaseClient";
import { useAppointmentStore } from "../data/AppointmentStore";
import { getStaffType } from "../data/staffAuth";

type PetSpecies = "dog" | "cat" | "rabbit" | "other";

type MedicalProblemRow = {
  problem_id: number | string;
  pet_id: number | string;
  problem_text: string | null;
  severity: string | null;
  status: string | null;
  created_at: string | null;
};

type HospitalizationRow = {
  hospitalization_id: number | string;
  pet_id: number | string;
  owner_id: string | null;
  visit_id: number | string | null;
  department: string | null;
  cage_or_room: string | null;
  reason: string | null;
  status: string | null;
  severity: string | null;
  admitted_at: string | null;
  expected_discharge_at: string | null;
  vet_name: string | null;
};

type ConversationRow = {
  conversation_id: number | string;
  owner_id: string | null;
  pet_id: number | string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  last_message_at: string | null;
  created_at: string | null;
};

type PaymentRow = {
  payment_id: number | string;
  owner_id: string | null;
  pet_id: number | string | null;
  amount: number | string | null;
  status: string | null;
  due_date: string | null;
  created_at: string | null;
};

type PatientRow = {
  pet_id: number | string;
  pet_name: string | null;
  species: string | null;
  owner_id: string | null;
};

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
};

type UrgentCase = {
  id: number;
  petId: number;
  petName: string;
  species: PetSpecies;
  speciesLabel: string;
  ownerName: string;
  issue: string;
  severity: string;
  severityLabel: string;
  severityColor: string;
  timeLabel: string;
};

type HospitalizedCase = {
  id: number;
  petId: number;
  petName: string;
  species: PetSpecies;
  speciesLabel: string;
  ownerName: string;
  department: string;
  status: string;
  statusColor: string;
  sinceLabel: string;
};

type ConversationCase = {
  id: number;
  petName: string;
  ownerName: string;
  subject: string;
  status: string;
  statusLabel: string;
  priority: string;
  priorityLabel: string;
  priorityColor: string;
  timeLabel: string;
};

type PaymentCase = {
  id: number;
  petName: string;
  ownerName: string;
  amount: number;
  status: string;
  statusLabel: string;
  statusColor: string;
  dueLabel: string;
};

function isToday(day: number, month: number, year: number) {
  const now = new Date();
  return (
    day === now.getDate() &&
    month === now.getMonth() &&
    year === now.getFullYear()
  );
}

function normalizeSpecies(species?: string | null): PetSpecies {
  const value = (species || "").trim().toLowerCase();
  if (value === "dog" || value === "כלב") return "dog";
  if (value === "cat" || value === "חתול") return "cat";
  if (value === "rabbit" || value === "ארנב") return "rabbit";
  return "other";
}

function speciesLabel(species?: string | null) {
  const normalized = normalizeSpecies(species);
  if (normalized === "dog") return "כלב";
  if (normalized === "cat") return "חתול";
  if (normalized === "rabbit") return "ארנב";
  return species || "אחר";
}

function fullName(first?: string | null, last?: string | null) {
  return `${first || ""} ${last || ""}`.trim() || "ללא שם בעלים";
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("he-IL");
}

function getSeverityLabel(severity?: string | null) {
  if (severity === "critical") return "קריטי";
  if (severity === "serious") return "חמור";
  return "רגיל";
}

function getSeverityColor(severity?: string | null) {
  if (severity === "critical") return "bg-red-100 text-red-700";
  if (severity === "serious") return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-700";
}

function getPriorityLabel(priority?: string | null) {
  if (priority === "urgent") return "דחוף";
  if (priority === "high") return "גבוה";
  if (priority === "low") return "נמוך";
  return "רגיל";
}

function getPriorityColor(priority?: string | null) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  if (priority === "low") return "bg-gray-100 text-gray-700";
  return "bg-blue-100 text-blue-700";
}

function getConversationStatusLabel(status?: string | null) {
  if (status === "waiting_owner") return "ממתין ללקוח";
  if (status === "waiting_staff") return "ממתין לצוות";
  if (status === "closed") return "סגור";
  return "פתוח";
}

function getPaymentStatusLabel(status?: string | null) {
  if (status === "partial") return "חלקי";
  if (status === "paid") return "שולם";
  if (status === "cancelled") return "בוטל";
  if (status === "refunded") return "זוכה";
  return "לא שולם";
}

function getPaymentStatusColor(status?: string | null) {
  if (status === "partial") return "bg-amber-100 text-amber-700";
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  return "bg-red-100 text-red-700";
}

function petIcon(species: PetSpecies) {
  if (species === "cat") return Cat;
  if (species === "rabbit") return Rabbit;
  return Dog;
}

function money(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function KpiCards() {
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);
  const [urgentCases, setUrgentCases] = useState<UrgentCase[]>([]);
  const [hospitalizedCases, setHospitalizedCases] = useState<
    HospitalizedCase[]
  >([]);
  const [conversationCases, setConversationCases] = useState<
    ConversationCase[]
  >([]);
  const [paymentCases, setPaymentCases] = useState<PaymentCase[]>([]);
  const [isMedicalLoading, setIsMedicalLoading] = useState(true);
  const [isServiceLoading, setIsServiceLoading] = useState(true);
  const [medicalError, setMedicalError] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const navigate = useNavigate();
  const staffType = getStaffType();
  const isSecretary = staffType === "secretary";
  const { calendarAppointments, isLoading: isAppointmentsLoading } =
    useAppointmentStore();

  const todayAppointments = useMemo(() => {
    return (calendarAppointments || [])
      .filter((appt) => isToday(appt.day, appt.month, appt.year))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [calendarAppointments]);

  useEffect(() => {
    let mounted = true;

    async function loadMedicalDashboardData() {
      setIsMedicalLoading(true);
      setMedicalError(null);

      try {
        const [
          { data: problemRows, error: problemsError },
          { data: hospitalizationRows, error: hospitalizationsError },
        ] = await Promise.all([
          supabase
            .from("medical_problems")
            .select(
              "problem_id, pet_id, problem_text, severity, status, created_at",
            )
            .eq("status", "active")
            .in("severity", ["serious", "critical"])
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("hospitalizations")
            .select(
              "hospitalization_id, pet_id, owner_id, visit_id, department, cage_or_room, reason, status, severity, admitted_at, expected_discharge_at, vet_name",
            )
            .eq("status", "active")
            .order("admitted_at", { ascending: false })
            .limit(50),
        ]);

        if (problemsError) throw problemsError;
        if (hospitalizationsError) throw hospitalizationsError;

        const typedProblems = (problemRows || []) as MedicalProblemRow[];
        const typedHospitalizations = (hospitalizationRows ||
          []) as HospitalizationRow[];

        const petIds = Array.from(
          new Set([
            ...typedProblems.map((row) => Number(row.pet_id)).filter(Boolean),
            ...typedHospitalizations
              .map((row) => Number(row.pet_id))
              .filter(Boolean),
          ]),
        );

        const patientsById = new Map<number, PatientRow>();
        const ownersById = new Map<string, OwnerRow>();

        if (petIds.length > 0) {
          const { data: patientRows, error: patientsError } = await supabase
            .from("patients")
            .select("pet_id, pet_name, species, owner_id")
            .in("pet_id", petIds);

          if (patientsError) throw patientsError;

          const typedPatients = (patientRows || []) as PatientRow[];
          for (const patient of typedPatients) {
            patientsById.set(Number(patient.pet_id), patient);
          }

          const ownerIds = Array.from(
            new Set(
              typedPatients
                .map((row) => row.owner_id)
                .filter(Boolean) as string[],
            ),
          );
          if (ownerIds.length > 0) {
            const { data: ownerRows, error: ownersError } = await supabase
              .from("owners")
              .select("owner_id, owner_first_name, owner_last_name")
              .in("owner_id", ownerIds);

            if (ownersError) throw ownersError;
            for (const owner of (ownerRows || []) as OwnerRow[]) {
              ownersById.set(String(owner.owner_id), owner);
            }
          }
        }

        if (!mounted) return;

        setUrgentCases(
          typedProblems.map((row) => {
            const patient = patientsById.get(Number(row.pet_id));
            const owner = patient?.owner_id
              ? ownersById.get(String(patient.owner_id))
              : undefined;
            return {
              id: Number(row.problem_id),
              petId: Number(row.pet_id),
              petName: patient?.pet_name || "חיה לא מזוהה",
              species: normalizeSpecies(patient?.species),
              speciesLabel: speciesLabel(patient?.species),
              ownerName: owner
                ? fullName(owner.owner_first_name, owner.owner_last_name)
                : "ללא בעלים",
              issue: row.problem_text || "בעיה רפואית פעילה",
              severity: row.severity || "normal",
              severityLabel: getSeverityLabel(row.severity),
              severityColor: getSeverityColor(row.severity),
              timeLabel: row.created_at
                ? `נפתח ${formatDate(row.created_at)} ${formatTime(row.created_at)}`
                : "פתוח",
            };
          }),
        );

        setHospitalizedCases(
          typedHospitalizations.map((row) => {
            const patient = patientsById.get(Number(row.pet_id));
            const owner = patient?.owner_id
              ? ownersById.get(String(patient.owner_id))
              : row.owner_id
                ? ownersById.get(String(row.owner_id))
                : undefined;
            const department = [row.department || "אשפוז", row.cage_or_room]
              .filter(Boolean)
              .join(" · ");
            const severityLabel = getSeverityLabel(row.severity);
            const status =
              row.severity === "critical" || row.severity === "serious"
                ? severityLabel
                : "מאושפז פעיל";
            return {
              id: Number(row.hospitalization_id),
              petId: Number(row.pet_id),
              petName: patient?.pet_name || "חיה לא מזוהה",
              species: normalizeSpecies(patient?.species),
              speciesLabel: speciesLabel(patient?.species),
              ownerName: owner
                ? fullName(owner.owner_first_name, owner.owner_last_name)
                : "ללא בעלים",
              department,
              status,
              statusColor: getSeverityColor(row.severity),
              sinceLabel: row.admitted_at
                ? `מ-${formatDate(row.admitted_at)}`
                : "פעיל",
            };
          }),
        );
      } catch (err) {
        console.error("Failed to load medical dashboard data", err);
        if (mounted) {
          setMedicalError("לא הצלחנו לטעון נתוני דחיפות ואשפוז מהמסד");
          setUrgentCases([]);
          setHospitalizedCases([]);
        }
      } finally {
        if (mounted) setIsMedicalLoading(false);
      }
    }

    loadMedicalDashboardData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSecretaryDashboardData() {
      if (!isSecretary) {
        setIsServiceLoading(false);
        setServiceError(null);
        setConversationCases([]);
        setPaymentCases([]);
        return;
      }

      setIsServiceLoading(true);
      setServiceError(null);

      try {
        const [
          { data: conversationRows, error: conversationsError },
          { data: paymentRows, error: paymentsError },
        ] = await Promise.all([
          supabase
            .from("conversations")
            .select(
              "conversation_id, owner_id, pet_id, subject, status, priority, last_message_at, created_at",
            )
            .neq("status", "closed")
            .order("last_message_at", { ascending: false })
            .limit(30),
          supabase
            .from("payments")
            .select(
              "payment_id, owner_id, pet_id, amount, status, due_date, created_at",
            )
            .in("status", ["unpaid", "partial"])
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(30),
        ]);

        if (conversationsError) throw conversationsError;
        if (paymentsError) throw paymentsError;

        const typedConversations = (conversationRows ||
          []) as ConversationRow[];
        const typedPayments = (paymentRows || []) as PaymentRow[];

        const petIds = Array.from(
          new Set([
            ...typedConversations
              .map((row) => Number(row.pet_id))
              .filter(Boolean),
            ...typedPayments.map((row) => Number(row.pet_id)).filter(Boolean),
          ]),
        );
        const ownerIds = Array.from(
          new Set([
            ...typedConversations.map((row) => row.owner_id).filter(Boolean),
            ...typedPayments.map((row) => row.owner_id).filter(Boolean),
          ] as string[]),
        );

        const patientsById = new Map<number, PatientRow>();
        const ownersById = new Map<string, OwnerRow>();

        if (petIds.length > 0) {
          const { data: patientRows, error: patientsError } = await supabase
            .from("patients")
            .select("pet_id, pet_name, species, owner_id")
            .in("pet_id", petIds);

          if (patientsError) throw patientsError;
          for (const patient of (patientRows || []) as PatientRow[]) {
            patientsById.set(Number(patient.pet_id), patient);
            if (patient.owner_id) ownerIds.push(String(patient.owner_id));
          }
        }

        const uniqueOwnerIds = Array.from(new Set(ownerIds.filter(Boolean)));
        if (uniqueOwnerIds.length > 0) {
          const { data: ownerRows, error: ownersError } = await supabase
            .from("owners")
            .select("owner_id, owner_first_name, owner_last_name")
            .in("owner_id", uniqueOwnerIds);

          if (ownersError) throw ownersError;
          for (const owner of (ownerRows || []) as OwnerRow[]) {
            ownersById.set(String(owner.owner_id), owner);
          }
        }

        if (!mounted) return;

        setConversationCases(
          typedConversations.map((row) => {
            const patient = row.pet_id
              ? patientsById.get(Number(row.pet_id))
              : undefined;
            const owner = row.owner_id
              ? ownersById.get(String(row.owner_id))
              : patient?.owner_id
                ? ownersById.get(String(patient.owner_id))
                : undefined;
            return {
              id: Number(row.conversation_id),
              petName: patient?.pet_name || "ללא חיה משויכת",
              ownerName: owner
                ? fullName(owner.owner_first_name, owner.owner_last_name)
                : "ללא בעלים",
              subject: row.subject || "פנייה ללא נושא",
              status: row.status || "open",
              statusLabel: getConversationStatusLabel(row.status),
              priority: row.priority || "normal",
              priorityLabel: getPriorityLabel(row.priority),
              priorityColor: getPriorityColor(row.priority),
              timeLabel: row.last_message_at
                ? `${formatDate(row.last_message_at)} ${formatTime(row.last_message_at)}`
                : row.created_at
                  ? `${formatDate(row.created_at)} ${formatTime(row.created_at)}`
                  : "חדש",
            };
          }),
        );

        setPaymentCases(
          typedPayments.map((row) => {
            const patient = row.pet_id
              ? patientsById.get(Number(row.pet_id))
              : undefined;
            const owner = row.owner_id
              ? ownersById.get(String(row.owner_id))
              : patient?.owner_id
                ? ownersById.get(String(patient.owner_id))
                : undefined;
            return {
              id: Number(row.payment_id),
              petName: patient?.pet_name || "ללא חיה משויכת",
              ownerName: owner
                ? fullName(owner.owner_first_name, owner.owner_last_name)
                : "ללא בעלים",
              amount: Number(row.amount || 0),
              status: row.status || "unpaid",
              statusLabel: getPaymentStatusLabel(row.status),
              statusColor: getPaymentStatusColor(row.status),
              dueLabel: row.due_date
                ? `לתשלום עד ${formatDate(row.due_date)}`
                : row.created_at
                  ? `נוצר ${formatDate(row.created_at)}`
                  : "למעקב",
            };
          }),
        );
      } catch (err) {
        console.error("Failed to load secretary dashboard data", err);
        if (mounted) {
          setServiceError("לא הצלחנו לטעון נתוני שירות וגבייה מהמסד");
          setConversationCases([]);
          setPaymentCases([]);
        }
      } finally {
        if (mounted) setIsServiceLoading(false);
      }
    }

    loadSecretaryDashboardData();
    return () => {
      mounted = false;
    };
  }, [isSecretary]);

  const kpis = isSecretary
    ? [
        {
          id: "appointments",
          label: "תורים היום",
          value: todayAppointments.length,
          icon: Calendar,
          iconBg: "bg-blue-50",
          iconColor: "text-blue-600",
          hoverBorder: "hover:border-blue-200",
          activeBorder: "border-blue-300",
        },
        {
          id: "conversations",
          label: "פניות פתוחות",
          value: conversationCases.length,
          icon: MessageCircle,
          iconBg: "bg-indigo-50",
          iconColor: "text-indigo-600",
          hoverBorder: "hover:border-indigo-200",
          activeBorder: "border-indigo-300",
        },
        {
          id: "payments",
          label: "תשלומים למעקב",
          value: paymentCases.length,
          icon: CreditCard,
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
          hoverBorder: "hover:border-amber-200",
          activeBorder: "border-amber-300",
        },
        {
          id: "hospitalized",
          label: "מאושפזים פעילים",
          value: hospitalizedCases.length,
          icon: Activity,
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
          hoverBorder: "hover:border-emerald-200",
          activeBorder: "border-emerald-300",
        },
      ]
    : [
        {
          id: "appointments",
          label: "תורים היום",
          value: todayAppointments.length,
          icon: Calendar,
          iconBg: "bg-blue-50",
          iconColor: "text-blue-600",
          hoverBorder: "hover:border-blue-200",
          activeBorder: "border-blue-300",
        },
        {
          id: "hospitalized",
          label: staffType === "nurse" ? "מאושפזים למעקב" : "מאושפזים במחלקה",
          value: hospitalizedCases.length,
          icon: Activity,
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
          hoverBorder: "hover:border-emerald-200",
          activeBorder: "border-emerald-300",
        },
        {
          id: "urgent",
          label: staffType === "nurse" ? "דחופים לטיפול" : "מקרים דחופים",
          value: urgentCases.length,
          icon: AlertTriangle,
          iconBg: "bg-orange-50",
          iconColor: "text-orange-500",
          hoverBorder: "hover:border-orange-200",
          activeBorder: "border-orange-300",
        },
      ];

  const toggleExpand = (id: string) => {
    setExpandedKpi(expandedKpi === id ? null : id);
  };

  const isCardLoading = (id: string) => {
    if (id === "appointments") return isAppointmentsLoading;
    if (id === "conversations" || id === "payments") return isServiceLoading;
    return isMedicalLoading;
  };

  const gridClass = isSecretary
    ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6"
    : "grid grid-cols-1 md:grid-cols-3 gap-6";

  return (
    <div className="space-y-4">
      <div className={gridClass}>
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const isActive = expandedKpi === kpi.id;
          const isLoading = isCardLoading(kpi.id);
          return (
            <button
              key={kpi.id}
              type="button"
              onClick={() => toggleExpand(kpi.id)}
              className={`bg-white rounded-xl shadow-sm border p-6 flex items-center gap-5 transition-all cursor-pointer text-right w-full group ${
                isActive
                  ? `${kpi.activeBorder} shadow-md`
                  : `border-gray-100 ${kpi.hoverBorder} hover:shadow-md`
              }`}
            >
              <div
                className={`${kpi.iconBg} rounded-xl p-4 group-hover:scale-105 transition-transform`}
              >
                <Icon className={`w-7 h-7 ${kpi.iconColor}`} />
              </div>
              <div className="flex-1">
                <p
                  className="text-gray-700 text-[16px] mb-1"
                  style={{ fontWeight: 700 }}
                >
                  {kpi.label}
                </p>
                <p
                  className="text-gray-900 text-[32px] leading-none"
                  style={{ fontWeight: 800 }}
                >
                  {isLoading ? (
                    <Loader2 className="w-7 h-7 animate-spin text-gray-300" />
                  ) : (
                    kpi.value
                  )}
                </p>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-gray-300 transition-transform ${isActive ? "rotate-180 text-gray-500" : ""}`}
              />
            </button>
          );
        })}
      </div>

      {expandedKpi === "appointments" && (
        <div className="bg-white rounded-2xl shadow-md border border-blue-200 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="px-6 py-4 bg-gradient-to-l from-blue-50 to-white border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3
                className="text-gray-900 text-[16px]"
                style={{ fontWeight: 700 }}
              >
                כל התורים להיום
              </h3>
              <span
                className="bg-blue-100 text-blue-700 text-[12px] px-2.5 py-0.5 rounded-full"
                style={{ fontWeight: 600 }}
              >
                {todayAppointments.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpandedKpi(null)}
              className="text-gray-500 font-medium hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {isAppointmentsLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              טוען תורים...
            </div>
          ) : todayAppointments.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {todayAppointments.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  onClick={() => navigate("/appointments")}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer text-right group"
                >
                  <div
                    className="bg-blue-50 rounded-lg px-2.5 py-1.5 text-[13px] text-blue-700 shrink-0 group-hover:bg-blue-100 transition-colors"
                    style={{ fontWeight: 700 }}
                  >
                    {appt.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-gray-900 text-[14px] truncate"
                      style={{ fontWeight: 600 }}
                    >
                      {appt.petName}{" "}
                      <span
                        className="text-gray-500 font-medium text-[12px]"
                        style={{ fontWeight: 400 }}
                      >
                        · {appt.ownerName}
                      </span>
                    </p>
                    <p className="text-gray-500 text-[12px] truncate">
                      {appt.type}
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-300 -rotate-90 group-hover:text-blue-500 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-[14px]">
              אין תורים להיום במסד.
            </div>
          )}
        </div>
      )}

      {expandedKpi === "conversations" && isSecretary && (
        <div className="bg-white rounded-2xl shadow-md border border-indigo-200 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="px-6 py-4 bg-gradient-to-l from-indigo-50 to-white border-b border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MessageCircle className="w-5 h-5 text-indigo-600" />
              <h3
                className="text-gray-900 text-[16px]"
                style={{ fontWeight: 700 }}
              >
                פניות פתוחות לטיפול
              </h3>
              <span
                className="bg-indigo-100 text-indigo-700 text-[12px] px-2 py-0.5 rounded-full"
                style={{ fontWeight: 600 }}
              >
                {conversationCases.length} פתוחות
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpandedKpi(null)}
              className="text-gray-500 font-medium hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {isServiceLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              טוען פניות...
            </div>
          ) : serviceError ? (
            <div className="p-8 text-center text-red-500 text-[14px]">
              {serviceError}
            </div>
          ) : conversationCases.length > 0 ? (
            <div className="p-4 space-y-3">
              {conversationCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate("/digital-care")}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all text-right cursor-pointer"
                >
                  <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-gray-900 text-[14px]"
                        style={{ fontWeight: 600 }}
                      >
                        {item.subject}
                      </span>
                      <span className="text-gray-500 font-medium text-[12px]">
                        {item.petName} · {item.ownerName}
                      </span>
                    </div>
                    <p className="text-gray-500 text-[12px] truncate">
                      {item.statusLabel} · {item.timeLabel}
                    </p>
                  </div>
                  <span
                    className={`text-[13px] px-2.5 py-0.5 rounded-full ${item.priorityColor} shrink-0`}
                    style={{ fontWeight: 600 }}
                  >
                    {item.priorityLabel}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-[14px]">
              אין פניות פתוחות כרגע.
            </div>
          )}
        </div>
      )}

      {expandedKpi === "payments" && isSecretary && (
        <div className="bg-white rounded-2xl shadow-md border border-amber-200 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="px-6 py-4 bg-gradient-to-l from-amber-50 to-white border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CreditCard className="w-5 h-5 text-amber-600" />
              <h3
                className="text-gray-900 text-[16px]"
                style={{ fontWeight: 700 }}
              >
                תשלומים למעקב
              </h3>
              <span
                className="bg-amber-100 text-amber-700 text-[12px] px-2 py-0.5 rounded-full"
                style={{ fontWeight: 600 }}
              >
                {paymentCases.length} פתוחים
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpandedKpi(null)}
              className="text-gray-500 font-medium hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {isServiceLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              טוען תשלומים...
            </div>
          ) : serviceError ? (
            <div className="p-8 text-center text-red-500 text-[14px]">
              {serviceError}
            </div>
          ) : paymentCases.length > 0 ? (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {paymentCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate("/clients")}
                  className="w-full flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/30 px-4 py-3 text-right hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-[14px] font-semibold truncate">
                      {item.ownerName}{" "}
                      <span className="text-gray-500 text-[12px] font-normal">
                        · {item.petName}
                      </span>
                    </p>
                    <p className="text-gray-500 text-[12px] truncate">
                      {item.dueLabel}
                    </p>
                  </div>
                  <div className="text-left shrink-0 space-y-1">
                    <p className="text-gray-900 text-[14px] font-bold">
                      {money(item.amount)}
                    </p>
                    <span
                      className={`text-[12px] px-2.5 py-1 rounded-full ${item.statusColor} font-semibold`}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-[14px]">
              אין תשלומים פתוחים כרגע.
            </div>
          )}
        </div>
      )}

      {expandedKpi === "hospitalized" && (
        <div className="bg-white rounded-2xl shadow-md border border-emerald-200 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="px-6 py-4 bg-gradient-to-l from-emerald-50 to-white border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <h3
                className="text-gray-900 text-[16px]"
                style={{ fontWeight: 700 }}
              >
                {isSecretary
                  ? "מאושפזים פעילים למעקב תפעולי"
                  : "מאושפזים פעילים"}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setExpandedKpi(null)}
              className="text-gray-500 font-medium hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {isMedicalLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              טוען אשפוזים...
            </div>
          ) : medicalError ? (
            <div className="p-8 text-center text-red-500 text-[14px]">
              {medicalError}
            </div>
          ) : hospitalizedCases.length > 0 ? (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {hospitalizedCases.map((item) => {
                const Icon = petIcon(item.species);
                const content = (
                  <>
                    <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
                      <Icon className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-[14px] font-semibold truncate">
                        {item.petName}{" "}
                        <span className="text-gray-500 text-[12px] font-normal">
                          · {item.ownerName}
                        </span>
                      </p>
                      <p className="text-gray-500 text-[12px] truncate">
                        {item.department} · {item.sinceLabel}
                      </p>
                    </div>
                    <span
                      className={`text-[12px] px-2.5 py-1 rounded-full ${item.statusColor} font-semibold`}
                    >
                      {isSecretary ? "פעיל" : item.status}
                    </span>
                  </>
                );

                if (isSecretary) {
                  return (
                    <div
                      key={item.id}
                      className="w-full flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3 text-right"
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/patients?selected=${item.petId}`)}
                    className="w-full flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3 text-right hover:bg-emerald-50 transition-colors cursor-pointer"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-[14px]">
              אין אשפוזים פעילים כרגע.
            </div>
          )}
        </div>
      )}

      {expandedKpi === "urgent" && !isSecretary && (
        <div className="bg-white rounded-2xl shadow-md border border-orange-200 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="px-6 py-4 bg-gradient-to-l from-orange-50 to-white border-b border-orange-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h3
                className="text-gray-900 text-[16px]"
                style={{ fontWeight: 700 }}
              >
                {staffType === "nurse"
                  ? "מקרים דחופים למעקב סיעודי"
                  : "מקרים דחופים פעילים"}
              </h3>
              <span
                className="bg-red-100 text-red-700 text-[12px] px-2 py-0.5 rounded-full"
                style={{ fontWeight: 600 }}
              >
                {urgentCases.length} פתוחים
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpandedKpi(null)}
              className="text-gray-500 font-medium hover:text-gray-600 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {isMedicalLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              טוען מקרים דחופים...
            </div>
          ) : medicalError ? (
            <div className="p-8 text-center text-red-500 text-[14px]">
              {medicalError}
            </div>
          ) : urgentCases.length > 0 ? (
            <div className="p-4 space-y-3">
              {urgentCases.map((uc) => {
                const Icon = petIcon(uc.species);
                return (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() => navigate(`/patients?selected=${uc.petId}`)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/20 transition-all text-right cursor-pointer"
                  >
                    <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-gray-900 text-[14px]"
                          style={{ fontWeight: 600 }}
                        >
                          {uc.petName}
                        </span>
                        <span className="text-gray-500 font-medium text-[12px]">
                          {uc.speciesLabel} · {uc.ownerName}
                        </span>
                      </div>
                      <p className="text-gray-600 text-[13px] font-medium truncate">
                        {uc.issue}
                      </p>
                    </div>
                    <div className="text-left shrink-0 space-y-1">
                      <span
                        className={`text-[13px] px-2.5 py-0.5 rounded-full ${uc.severityColor} block text-center`}
                        style={{ fontWeight: 600 }}
                      >
                        {uc.severityLabel}
                      </span>
                      <p className="text-gray-500 font-medium text-[12px] text-center">
                        {uc.timeLabel}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-[14px]">
              אין בעיות פעילות ברמת חמור/קריטי במסד.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
