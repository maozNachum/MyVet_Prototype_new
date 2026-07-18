import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bed,
  CalendarCheck,
  CalendarPlus,
  ClipboardPlus,
  Cat,
  Check,
  Clock,
  Dog,
  FlaskConical,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Package,
  PawPrint,
  Phone,
  RefreshCw,
  Search,
  UserPlus,
  Video,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { DashboardAssistant } from "../components/ai/PageAssistants";
import { TreatmentModal } from "../components/TreatmentModal";
import { canEditMedicalRecords, getStaffName, getStaffType, type StaffType } from "../data/staffAuth";
import { useAppointmentStore } from "../data/AppointmentStore";

type SpeciesType = "dog" | "cat" | "bird" | "rabbit" | "hamster" | "other";

type PatientListItem = {
  id: number;
  petName: string;
  petSpecies: SpeciesType;
  speciesLabel: string;
  breed: string;
  microchip: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
};

type OwnerRow = {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type PatientRow = {
  pet_id: number | string;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  microchip: string | null;
  owner_id: string | null;
};

type AppointmentItem = {
  id: number;
  petId: number | null;
  petSpecies: SpeciesType;
  petName: string;
  ownerName: string;
  ownerPhone: string;
  startTime: string;
  timeLabel: string;
  type: string;
  mode: "physical" | "video";
  vetName: string;
  room: string;
  department: string;
  notes: string;
  color: string;
  hasTreatment: boolean;
};

type DashboardData = {
  appointments: AppointmentItem[];
  conversations: any[];
  labs: any[];
  hospitalizations: any[];
  payments: any[];
  inventory: any[];
};

type WorkItem = {
  id: string;
  title: string;
  detail: string;
  icon: any;
  tone: "red" | "amber" | "blue" | "emerald" | "purple" | "slate";
  path: string;
  action: string;
  priority: number;
};

type StatusTileTone = "schedule" | "communication" | "pending" | "warning";

type StatusTile = {
  label: string;
  value: number;
  status: string;
  icon: any;
  tone: StatusTileTone;
  path: string;
};

type NewPatientForm = {
  petName: string;
  speciesType: string;
  gender: string;
  breed: string;
  birthDate: string;
  weight: string;
  microchip: string;
  allergies: string;
  neuteredStatus: "unknown" | "yes" | "no";
  ownerFirstName: string;
  ownerLastName: string;
  ownerId: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerAddress: string;
};

const emptyForm: NewPatientForm = {
  petName: "",
  speciesType: "dog",
  gender: "זכר",
  breed: "",
  birthDate: "",
  weight: "",
  microchip: "",
  allergies: "",
  neuteredStatus: "unknown",
  ownerFirstName: "",
  ownerLastName: "",
  ownerId: "",
  ownerPhone: "",
  ownerEmail: "",
  ownerAddress: "",
};

const speciesOptions = [
  { value: "dog", label: "כלב", species: "כלב", icon: Dog },
  { value: "cat", label: "חתול", species: "חתול", icon: Cat },
  { value: "bird", label: "ציפור", species: "ציפור", icon: PawPrint },
  { value: "rabbit", label: "ארנב", species: "ארנב", icon: PawPrint },
  { value: "hamster", label: "אוגר", species: "אוגר", icon: PawPrint },
  { value: "other", label: "אחר", species: "אחר", icon: PawPrint },
] as const;

const genderOptions = [
  { value: "זכר", label: "זכר" },
  { value: "נקבה", label: "נקבה" },
];

const neuteredOptions = [
  { value: "unknown", label: "לא ידוע" },
  { value: "yes", label: "כן" },
  { value: "no", label: "לא" },
];

function normalizeSpecies(species?: string | null): SpeciesType {
  const value = (species || "").trim().toLowerCase();
  if (value === "dog" || value === "כלב") return "dog";
  if (value === "cat" || value === "חתול") return "cat";
  if (value === "bird" || value === "ציפור") return "bird";
  if (value === "rabbit" || value === "ארנב") return "rabbit";
  if (value === "hamster" || value === "אוגר") return "hamster";
  return "other";
}

function speciesLabel(species?: string | null) {
  const normalized = normalizeSpecies(species);
  const option = speciesOptions.find((item) => item.value === normalized);
  return option?.label || species || "אחר";
}

function fullName(first?: string | null, last?: string | null) {
  return `${first || ""} ${last || ""}`.trim();
}

function matchesPatient(item: PatientListItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.petName, item.ownerName, item.ownerPhone, item.ownerEmail, item.ownerId, item.microchip, item.breed, item.speciesLabel]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function isLowInventoryItem(item: any) {
  const quantity = Number(item.stock_quantity ?? 0);
  const threshold = Number(item.low_stock_threshold ?? 5);
  return quantity <= threshold;
}

function hasPrioritySignal(value?: string | null) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  const priorityTerms = [
    "חירום",
    "דחוף",
    "דחופה",
    "דחופים",
    "עדיפות גבוהה",
    "גבוהה",
    "קריטי",
    "קריטית",
    "urgent",
    "emergency",
    "critical",
    "high priority",
    "high",
  ];
  return priorityTerms.some((term) => text.includes(term));
}

function isRedLikeColor(value?: string | null) {
  const color = String(value || "").trim().toLowerCase();
  if (!color) return false;
  return ["red", "rose", "danger", "urgent", "#ef4444", "#dc2626", "#f43f5e", "#e11d48"].some((term) => color.includes(term));
}

function isPriorityAppointment(appointment: AppointmentItem) {
  return (
    hasPrioritySignal(appointment.type) ||
    hasPrioritySignal(appointment.department) ||
    hasPrioritySignal(appointment.notes) ||
    isRedLikeColor(appointment.color)
  );
}

function toneClasses(tone: WorkItem["tone"]) {
  const map = {
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
    slate: "border-slate-100 bg-slate-50 text-slate-700",
  };
  return map[tone];
}

function statusTileSkin(tone: StatusTileTone) {
  const skins: Record<StatusTileTone, { card: string; icon: string; bar: string; value: string; status: string }> = {
    schedule: {
      card: "border-blue-100/80 bg-gradient-to-br from-white to-blue-50/45 hover:border-blue-200",
      icon: "bg-blue-50 text-blue-700 ring-blue-100",
      bar: "bg-blue-300",
      value: "text-blue-950",
      status: "text-blue-700",
    },
    communication: {
      card: "border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/45 hover:border-indigo-200",
      icon: "bg-indigo-50 text-indigo-700 ring-indigo-100",
      bar: "bg-indigo-300",
      value: "text-indigo-950",
      status: "text-indigo-700",
    },
    pending: {
      card: "border-amber-100/80 bg-gradient-to-br from-white to-amber-50/45 hover:border-amber-200",
      icon: "bg-amber-50 text-amber-700 ring-amber-100",
      bar: "bg-amber-300",
      value: "text-amber-950",
      status: "text-amber-700",
    },
    warning: {
      card: "border-orange-100/80 bg-gradient-to-br from-white to-orange-50/45 hover:border-orange-200",
      icon: "bg-orange-50 text-orange-700 ring-orange-100",
      bar: "bg-orange-300",
      value: "text-orange-950",
      status: "text-orange-700",
    },
  };
  return skins[tone];
}

function buildWorkItems(data: DashboardData, staffType: StaffType): WorkItem[] {
  const isAdmin = staffType === "clinic_admin";
  const isSecretary = staffType === "secretary";
  const isVet = staffType === "vet";
  const isNurse = staffType === "nurse";
  const now = Date.now();
  const upcomingAppointments = data.appointments.filter((item) => {
    const startTime = new Date(item.startTime).getTime();
    return Number.isNaN(startTime) || startTime >= now;
  });
  const videoAppointments = upcomingAppointments.filter((item) => item.mode === "video");
  const missingVet = upcomingAppointments.filter((item) => !item.vetName || item.vetName === "לא שובץ");
  const missingRoom = upcomingAppointments.filter((item) => item.mode !== "video" && !item.room);
  const urgentConversations = data.conversations.filter((item) => (
    ["open", "waiting_staff"].includes(String(item.status || "")) &&
    (item.priority === "urgent" || item.priority === "high")
  ));
  const openLabs = data.labs.filter((item) => String(item.status || "").toLowerCase() !== "completed");
  const urgentLabs = openLabs.filter((item) => item.is_urgent === true);
  const openPayments = data.payments.filter((item) => ["unpaid", "partial"].includes(String(item.status || "")));
  const lowInventory = data.inventory.filter(isLowInventoryItem);
  const items: WorkItem[] = [];

  if (urgentConversations.length > 0) items.push({ id: "urgent-conversations", title: `${urgentConversations.length} פניות בעדיפות גבוהה`, detail: "לטיפול לפני פניות רגילות", icon: MessageCircle, tone: "amber", path: "/digital-care?filter=urgent", action: "פתח", priority: 1 });
  if (videoAppointments.length > 0) items.push({ id: "video-appointments", title: `${videoAppointments.length} תורי וידאו להיום`, detail: "בדוק את פרטי התור והקישור", icon: Video, tone: "blue", path: "/appointments", action: "פתח", priority: 2 });
  if (missingVet.length > 0) items.push({ id: "missing-vet", title: `${missingVet.length} תורים בלי רופא`, detail: "להשלים שיבוץ", icon: CalendarCheck, tone: "amber", path: "/appointments", action: "פתח", priority: 3 });
  if (missingRoom.length > 0) items.push({ id: "missing-room", title: `${missingRoom.length} תורים בלי חדר`, detail: "להשלים מיקום", icon: LayoutDashboard, tone: "amber", path: "/appointments", action: "פתח", priority: 4 });
  if ((isAdmin || isVet || isNurse) && urgentLabs.length > 0) items.push({
    id: "urgent-labs",
    title: `${urgentLabs.length} בדיקות דחופות`,
    detail: "בדוק תוצאות",
    icon: FlaskConical,
    tone: "amber",
    path: "/lab-orders?filter=urgent",
    action: "פתח",
    priority: 5,
  });
  const criticalHospitalizations = data.hospitalizations.filter((item) => item.severity === "critical" || item.severity === "serious");
  const expectedDischarges = data.hospitalizations.filter((item) => Boolean(item.expected_discharge_at));

  if ((isAdmin || isVet || isNurse) && criticalHospitalizations.length > 0) items.push({
    id: "critical-hospitalizations",
    title: `${criticalHospitalizations.length} אשפוזים חמורים`,
    detail: "בדוק סטטוס",
    icon: Bed,
    tone: "amber",
    path: "/hospitalizations?filter=critical",
    action: "פתח",
    priority: 6,
  });
  if ((isAdmin || isVet || isNurse) && expectedDischarges.length > 0) items.push({
    id: "expected-discharges",
    title: `${expectedDischarges.length} שחרורים צפויים`,
    detail: "הכן שחרור",
    icon: Bed,
    tone: "emerald",
    path: "/hospitalizations?filter=discharge",
    action: "פתח",
    priority: 7,
  });
  if ((isAdmin || isSecretary) && openPayments.length > 0) items.push({ id: "payments", title: `${openPayments.length} תשלומים למעקב`, detail: "בדוק חיובים", icon: WalletCards, tone: "emerald", path: "/clients?filter=debt", action: "פתח", priority: 7 });
  if (lowInventory.length > 0) items.push({ id: "inventory", title: `${lowInventory.length} פריטי מלאי נמוכים`, detail: "בדוק הזמנה", icon: Package, tone: "amber", path: "/inventory?filter=low-stock", action: "פתח", priority: 8 });

  return items.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

function dashboardTitle() {
  return "מרכז המרפאה";
}

export function Dashboard() {
  const [showWalkInPicker, setShowWalkInPicker] = useState(false);
  const [walkInSearch, setWalkInSearch] = useState("");
  const [modalView, setModalView] = useState<"list" | "new-patient">("list");
  const [newForm, setNewForm] = useState<NewPatientForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewPatientForm, string>>>({});
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [treatmentPatient, setTreatmentPatient] = useState<{ id: number; petName: string; petSpecies: string; ownerName: string; appointmentId?: number } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData>({ appointments: [], conversations: [], labs: [], hospitalizations: [], payments: [], inventory: [] });
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardLoadWarning, setDashboardLoadWarning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const navigate = useNavigate();
  const { refreshAppointments } = useAppointmentStore();
  const staffType = getStaffType();
  const isSecretary = staffType === "secretary";
  const canTreat = canEditMedicalRecords();
  const walkInButtonLabel = staffType === "nurse" ? "קליטת מטופל" : "טיפול ללא תור";

  const filteredPatients = useMemo(() => patients.filter((patient) => matchesPatient(patient, walkInSearch)).slice(0, 50), [patients, walkInSearch]);
  const workItems = useMemo(() => buildWorkItems(dashboardData, staffType), [dashboardData, staffType]);

  const todaysAppointments = useMemo(() => dashboardData.appointments, [dashboardData.appointments]);
  const nowTime = useMemo(() => new Date(), [lastUpdated, dashboardData.appointments.length]);
  const prioritizedTodaysAppointments = useMemo(() => {
    const nowMs = nowTime.getTime();
    const priority = (appointment: AppointmentItem) => {
      if (appointment.hasTreatment) return 2;
      const startsAt = new Date(appointment.startTime).getTime();
      return !Number.isNaN(startsAt) && startsAt < nowMs ? 0 : 1;
    };
    return [...dashboardData.appointments].sort((left, right) => {
      const priorityDifference = priority(left) - priority(right);
      if (priorityDifference !== 0) return priorityDifference;
      return new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
    });
  }, [dashboardData.appointments, nowTime]);
  const nextAppointment = useMemo(() => {
    const nowMs = nowTime.getTime();
    return dashboardData.appointments.find((appointment) => {
      const value = new Date(appointment.startTime).getTime();
      return !Number.isNaN(value) && value >= nowMs;
    }) || null;
  }, [dashboardData.appointments, nowTime]);
  const remainingAppointmentsCount = useMemo(() => {
    return dashboardData.appointments.filter((appointment) => {
      const value = new Date(appointment.startTime).getTime();
      return !appointment.hasTreatment && !Number.isNaN(value);
    }).length;
  }, [dashboardData.appointments]);
  const videoAppointmentsCount = useMemo(() => dashboardData.appointments.filter((appointment) => appointment.mode === "video").length, [dashboardData.appointments]);
  const physicalAppointmentsCount = dashboardData.appointments.length - videoAppointmentsCount;
  const expectedDischarges = useMemo(() => dashboardData.hospitalizations.filter((item) => Boolean(item.expected_discharge_at)), [dashboardData.hospitalizations]);
  const openConversations = useMemo(
    () => dashboardData.conversations.filter((conversation: any) => ["open", "waiting_staff"].includes(String(conversation.status || ""))),
    [dashboardData.conversations],
  );
  const urgentOpenConversationsCount = useMemo(
    () => openConversations.filter((conversation: any) => ["urgent", "high"].includes(String(conversation.priority || "").toLowerCase())).length,
    [openConversations]
  );

  const urgentLabsCount = useMemo(() => dashboardData.labs.filter((lab: any) => lab.is_urgent === true).length, [dashboardData.labs]);
  const severeHospitalizationsCount = useMemo(() => dashboardData.hospitalizations.filter((item: any) => ["critical", "serious"].includes(String(item.severity || "").toLowerCase())).length, [dashboardData.hospitalizations]);
  const outOfStockCount = useMemo(() => dashboardData.inventory.filter((item: any) => Number(item.stock_quantity ?? 0) <= 0).length, [dashboardData.inventory]);

  const statusTiles = useMemo<StatusTile[]>(() => {
    const hasAppointments = dashboardData.appointments.length > 0;
    const hasOpenConversations = openConversations.length > 0;
    const labCount = isSecretary ? dashboardData.payments.length : dashboardData.labs.length;
    const hasLabsOrPayments = labCount > 0;
    return [
      {
        label: "תורים להיום",
        value: dashboardData.appointments.length,
        status: hasAppointments ? `${videoAppointmentsCount} וידאו · ${physicalAppointmentsCount} במרפאה` : "אין תורים להיום",
        icon: CalendarCheck,
        tone: "schedule",
        path: "/appointments",
      },
      {
        label: "פניות פתוחות",
        value: openConversations.length,
        status: hasOpenConversations ? "ממתינות למענה" : "אין פניות פתוחות",
        icon: MessageCircle,
        tone: "communication",
        path: "/digital-care?filter=open",
      },
      {
        label: isSecretary ? "גבייה למעקב" : "בדיקות ממתינות",
        value: labCount,
        status: isSecretary ? (hasLabsOrPayments ? "חיובים פתוחים" : "אין חיובים פתוחים") : hasLabsOrPayments ? "ממתינות לתוצאה" : "אין בדיקות פתוחות",
        icon: isSecretary ? WalletCards : FlaskConical,
        tone: isSecretary ? "warning" : "pending",
        path: isSecretary ? "/clients?filter=debt" : "/lab-orders?filter=open",
      },
    ];
  }, [dashboardData, isSecretary, openConversations, videoAppointmentsCount, physicalAppointmentsCount]);

  async function loadPatients() {
    setIsLoadingPatients(true);
    setLoadError(null);
    try {
      const { data: patientRows, error: patientsError } = await supabase.from("patients").select("pet_id, pet_name, species, breed, microchip, owner_id").order("pet_name", { ascending: true });
      if (patientsError) throw patientsError;
      const typedPatients = (patientRows || []) as PatientRow[];
      const ownerIds = Array.from(new Set(typedPatients.map((row) => row.owner_id).filter(Boolean) as string[]));
      const ownersById = new Map<string, OwnerRow>();
      if (ownerIds.length > 0) {
        const { data: ownerRows, error: ownersError } = await supabase.from("owners").select("owner_id, owner_first_name, owner_last_name, phone, email, address").in("owner_id", ownerIds);
        if (ownersError) throw ownersError;
        for (const owner of (ownerRows || []) as OwnerRow[]) ownersById.set(String(owner.owner_id), owner);
      }
      setPatients(typedPatients.map((row) => {
        const owner = row.owner_id ? ownersById.get(String(row.owner_id)) : undefined;
        return {
          id: Number(row.pet_id),
          petName: row.pet_name || "ללא שם חיה",
          petSpecies: normalizeSpecies(row.species),
          speciesLabel: speciesLabel(row.species),
          breed: row.breed || "",
          microchip: row.microchip || "",
          ownerId: row.owner_id || "",
          ownerName: owner ? fullName(owner.owner_first_name, owner.owner_last_name) || "ללא שם בעלים" : "ללא בעלים",
          ownerPhone: owner?.phone || "",
          ownerEmail: owner?.email || "",
        };
      }));
    } catch (error) {
      console.error("Failed to load walk-in patients", error);
      setLoadError("לא הצלחנו לטעון את רשימת המטופלים. נסה שוב בעוד רגע.");
      setPatients([]);
    } finally {
      setIsLoadingPatients(false);
    }
  }

  async function loadDashboardData(showLoading = true) {
    if (showLoading) setIsDashboardLoading(true);
    try {
      const { start, end } = todayRange();
      const [appointmentsResult, conversationsResult, labsResult, hospitalizationsResult, paymentsResult, inventoryResult] = await Promise.allSettled([
        supabase.from("appointments").select("appointment_id, pet_id, start_time, appointment_type, department, vet_name, room, notes, appointment_mode, color").gte("start_time", start.toISOString()).lt("start_time", end.toISOString()).order("start_time", { ascending: true }),
        supabase.from("conversations").select("conversation_id, subject, status, priority, last_message_at").in("status", ["open", "waiting_staff", "waiting_owner"]).order("last_message_at", { ascending: false }),
        supabase.from("lab_orders").select("lab_order_id, test_name, status, is_urgent, ordered_date, test_date, pet_id").neq("status", "completed").order("ordered_date", { ascending: false }),
        supabase.from("hospitalizations").select("hospitalization_id, pet_id, department, status, severity, admitted_at, expected_discharge_at").eq("status", "active"),
        supabase.from("payments").select("payment_id, amount, status, due_date, owner_id, pet_id").in("status", ["unpaid", "partial"]),
        supabase.from("inventory").select("item_id, item_name, category, stock_quantity, low_stock_threshold, price"),
      ]);

      const dashboardResults = [appointmentsResult, conversationsResult, labsResult, hospitalizationsResult, paymentsResult, inventoryResult];
      const hasBaseLoadWarning = dashboardResults.some((result) => (
        result.status === "rejected" || Boolean(result.value.error)
      ));

      const rawAppointments = appointmentsResult.status === "fulfilled" && !appointmentsResult.value.error ? (appointmentsResult.value.data || []) as any[] : [];
      const appointmentIds = rawAppointments.map((item) => Number(item.appointment_id)).filter(Number.isFinite);
      const treatedAppointmentIds = new Set<number>();
      let treatmentLookupFailed = false;
      if (appointmentIds.length > 0) {
        const { data: visitRows, error: visitsError } = await supabase
          .from("medical_visits")
          .select("appointment_id")
          .in("appointment_id", appointmentIds);
        treatmentLookupFailed = Boolean(visitsError);
        if (!visitsError) {
          for (const visit of visitRows || []) {
            if (visit.appointment_id !== null) treatedAppointmentIds.add(Number(visit.appointment_id));
          }
        }
      }
      const petIds = Array.from(new Set(rawAppointments.map((item) => item.pet_id).filter(Boolean).map((item) => Number(item))));
      const petMap = new Map<number, { petName: string; petSpecies: string; ownerName: string; ownerPhone: string }>();

      if (petIds.length > 0) {
        const { data: patientRows } = await supabase.from("patients").select("pet_id, pet_name, species, owner_id").in("pet_id", petIds);
        const ownerIds = Array.from(new Set(((patientRows || []) as any[]).map((row) => row.owner_id).filter(Boolean)));
        const ownersById = new Map<string, OwnerRow>();
        if (ownerIds.length > 0) {
          const { data: ownerRows } = await supabase.from("owners").select("owner_id, owner_first_name, owner_last_name, phone, email, address").in("owner_id", ownerIds);
          for (const owner of (ownerRows || []) as OwnerRow[]) ownersById.set(String(owner.owner_id), owner);
        }
        for (const row of (patientRows || []) as any[]) {
          const owner = row.owner_id ? ownersById.get(String(row.owner_id)) : undefined;
          petMap.set(Number(row.pet_id), {
            petName: row.pet_name || "מטופל",
            petSpecies: row.species || "",
            ownerName: owner ? fullName(owner.owner_first_name, owner.owner_last_name) || "בעלים" : "בעלים",
            ownerPhone: owner?.phone || "",
          });
        }
      }

      const appointments = rawAppointments.map((row) => {
        const petInfo = row.pet_id ? petMap.get(Number(row.pet_id)) : undefined;
        return {
          id: Number(row.appointment_id),
          petId: row.pet_id ? Number(row.pet_id) : null,
          petSpecies: normalizeSpecies(petInfo?.petSpecies),
          petName: petInfo?.petName || "מטופל",
          ownerName: petInfo?.ownerName || "בעלים",
          ownerPhone: petInfo?.ownerPhone || "",
          startTime: row.start_time || "",
          timeLabel: formatTime(row.start_time),
          type: row.appointment_type || row.department || "בדיקה",
          mode: row.appointment_mode === "video" ? "video" : "physical",
          vetName: row.vet_name || "",
          room: row.room || "",
          department: row.department || "",
          notes: row.notes || "",
          color: row.color || "",
          hasTreatment: treatedAppointmentIds.has(Number(row.appointment_id)),
        } as AppointmentItem;
      });

      setDashboardLoadWarning(hasBaseLoadWarning || treatmentLookupFailed);

      setDashboardData({
        appointments,
        conversations: conversationsResult.status === "fulfilled" && !conversationsResult.value.error ? conversationsResult.value.data || [] : [],
        labs: labsResult.status === "fulfilled" && !labsResult.value.error ? labsResult.value.data || [] : [],
        hospitalizations: hospitalizationsResult.status === "fulfilled" && !hospitalizationsResult.value.error ? hospitalizationsResult.value.data || [] : [],
        payments: paymentsResult.status === "fulfilled" && !paymentsResult.value.error ? paymentsResult.value.data || [] : [],
        inventory: inventoryResult.status === "fulfilled" && !inventoryResult.value.error
          ? ((inventoryResult.value.data || []) as any[])
              .filter(isLowInventoryItem)
              .sort((a, b) => (
                Number(a.stock_quantity ?? 0) - Number(a.low_stock_threshold ?? 5)
              ) - (
                Number(b.stock_quantity ?? 0) - Number(b.low_stock_threshold ?? 5)
              ))
          : [],
      });
      setLastUpdated(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      console.error("Failed to load dashboard data", error);
      setDashboardLoadWarning(true);
    } finally {
      setIsDashboardLoading(false);
    }
  }

  useEffect(() => {
    void refreshAppointments();
    void loadDashboardData();
    void loadPatients();
    const syncDashboard = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void refreshAppointments();
        void loadDashboardData(false);
      }
    };
    window.addEventListener("focus", syncDashboard);
    document.addEventListener("visibilitychange", syncDashboard);
    const channel = supabase
      .channel("myvet-dashboard-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, syncDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, syncDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, syncDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "hospitalizations" }, syncDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, syncDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, syncDashboard)
      .subscribe();
    return () => {
      window.removeEventListener("focus", syncDashboard);
      document.removeEventListener("visibilitychange", syncDashboard);
      void supabase.removeChannel(channel);
    };
  }, [refreshAppointments]);

  const closeModal = () => {
    setShowWalkInPicker(false);
    setWalkInSearch("");
    setModalView("list");
    setNewForm(emptyForm);
    setFormErrors({});
    setLoadError(null);
  };

  const handleSelectPatient = (patient: PatientListItem) => {
    closeModal();
    if (canTreat) {
      setTreatmentPatient({ id: patient.id, petName: patient.petName, petSpecies: patient.petSpecies, ownerName: patient.ownerName });
    } else {
      navigate(`/appointments/new?pet_id=${patient.id}`);
    }
  };

  const updateField = (field: keyof NewPatientForm, value: string) => {
    setNewForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validateForm = () => {
    const errors: Partial<Record<keyof NewPatientForm, string>> = {};
    if (!newForm.petName.trim()) errors.petName = "חובה להזין שם חיה";
    if (!newForm.speciesType.trim()) errors.speciesType = "חובה לבחור סוג חיה";
    if (!newForm.breed.trim()) errors.breed = "חובה להזין גזע או אחר";
    if (!newForm.ownerFirstName.trim()) errors.ownerFirstName = "חובה להזין שם פרטי של בעלים";
    if (!newForm.ownerPhone.trim()) errors.ownerPhone = "חובה להזין טלפון בעלים";
    if (newForm.weight && Number.isNaN(Number(newForm.weight))) errors.weight = "משקל חייב להיות מספר";
    return errors;
  };

  const validateAndSave = async () => {
    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSavingPatient(true);
    try {
      const ownerId = newForm.ownerId.trim() || `owner-${Date.now()}`;
      const ownerPayload = {
        owner_id: ownerId,
        owner_first_name: newForm.ownerFirstName.trim(),
        owner_last_name: newForm.ownerLastName.trim(),
        phone: newForm.ownerPhone.trim(),
        email: newForm.ownerEmail.trim() || null,
        address: newForm.ownerAddress.trim() || null,
      };
      const { data: existingOwner, error: existingOwnerError } = await supabase
        .from("owners")
        .select("owner_id, owner_first_name, owner_last_name, phone, email, address")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (existingOwnerError) throw existingOwnerError;

      let createdOwner = false;
      if (!existingOwner) {
        const { error: ownerError } = await supabase.from("owners").insert(ownerPayload);
        if (ownerError) throw ownerError;
        createdOwner = true;
      }
      const resolvedOwner = existingOwner || ownerPayload;
      const specOpt = speciesOptions.find((s) => s.value === newForm.speciesType);
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .insert([{ pet_name: newForm.petName.trim(), species: specOpt?.species || newForm.speciesType, breed: newForm.breed.trim(), gender: newForm.gender, birth_date: newForm.birthDate || null, microchip: newForm.microchip.trim() || null, allergies: newForm.allergies.trim() || null, weight: newForm.weight ? Number(newForm.weight) : null, neutered_status: newForm.neuteredStatus, owner_id: ownerId }])
        .select("pet_id, pet_name, species, breed, microchip, owner_id")
        .single();
      if (patientError) {
        if (createdOwner) {
          const { error: rollbackError } = await supabase.from("owners").delete().eq("owner_id", ownerId);
          if (rollbackError) console.error("Failed rolling back owner after patient creation failed", rollbackError);
        }
        throw patientError;
      }
      await loadPatients();
      const newPatient: PatientListItem = { id: Number(patientData.pet_id), petName: patientData.pet_name || newForm.petName, petSpecies: normalizeSpecies(patientData.species), speciesLabel: speciesLabel(patientData.species), breed: patientData.breed || newForm.breed, microchip: patientData.microchip || "", ownerId, ownerName: fullName(resolvedOwner.owner_first_name, resolvedOwner.owner_last_name) || resolvedOwner.owner_first_name, ownerPhone: resolvedOwner.phone || "", ownerEmail: resolvedOwner.email || "" };
      handleSelectPatient(newPatient);
    } catch (error) {
      console.error("Failed to create walk-in patient", error);
      setLoadError("לא הצלחנו לשמור את המטופל החדש. בדוק שהפרטים מלאים ונסה שוב.");
    } finally {
      setIsSavingPatient(false);
    }
  };

  const inputClass = (field: keyof NewPatientForm) => `w-full px-3.5 py-2.5 border rounded-xl text-[14px] focus:outline-none focus:ring-2 transition-all ${formErrors[field] ? "border-red-300 bg-red-50/50 focus:ring-red-500/20" : "border-gray-200 bg-white focus:ring-orange-500/20"}`;
  const renderError = (field: keyof NewPatientForm) => formErrors[field] ? <p className="mt-1 text-[13px] text-red-500 font-medium">{formErrors[field]}</p> : null;
  const renderInput = (label: string, field: keyof NewPatientForm, placeholder: string, required = false, type = "text") => (
    <div>
      <label className="block text-gray-600 text-[13px] mb-1.5 font-medium">{label} {required && <span className="text-red-400">*</span>}</label>
      <input type={type} placeholder={placeholder} value={newForm[field]} onChange={(e) => updateField(field, e.target.value)} className={inputClass(field)} />
      {renderError(field)}
    </div>
  );


  const openLabTarget = () => navigate("/lab-orders?filter=open");

  const openHospitalizationTarget = () => navigate("/hospitalizations?filter=active");

  const openConversationTarget = () => navigate("/digital-care?filter=open");

  const clinicAttentionCount = workItems.length;
  const clinicAreas = [
    {
      id: "conversations",
      title: "פניות",
      needsAttention: urgentOpenConversationsCount > 0,
      icon: MessageCircle,
      onClick: openConversationTarget,
      iconClass: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    },
    {
      id: "labs",
      title: "מעבדה",
      needsAttention: urgentLabsCount > 0,
      icon: FlaskConical,
      onClick: openLabTarget,
      iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
    },
    {
      id: "hospitalizations",
      title: "אשפוזים",
      needsAttention: severeHospitalizationsCount > 0 || expectedDischarges.length > 0,
      icon: Bed,
      onClick: openHospitalizationTarget,
      iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    },
    {
      id: "inventory",
      title: "מלאי",
      needsAttention: dashboardData.inventory.length > 0,
      icon: Package,
      onClick: () => navigate("/inventory?filter=low-stock"),
      iconClass: "bg-orange-50 text-orange-700 ring-orange-100",
    },
  ];

  const openAppointment = (appointment: AppointmentItem) => {
    const appointmentTime = new Date(appointment.startTime).getTime();
    const isOverdueWithoutTreatment = !Number.isNaN(appointmentTime) && appointmentTime < Date.now() && !appointment.hasTreatment;
    if (appointment.petId && canTreat && isOverdueWithoutTreatment) {
      setTreatmentPatient({
        id: appointment.petId,
        petName: appointment.petName,
        petSpecies: appointment.petSpecies,
        ownerName: appointment.ownerName,
        appointmentId: appointment.id,
      });
      return;
    }
    if (appointment.petId) {
      navigate(`/patients?selected=${appointment.petId}`);
      return;
    }
    navigate("/appointments");
  };

  return (
    <main className="relative mx-auto min-h-[calc(100vh-84px)] max-w-[1500px] px-4 py-3 sm:px-5" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[220px] rounded-b-[42px] bg-[radial-gradient(circle_at_82%_0%,rgba(37,99,235,0.17),transparent_46%),radial-gradient(circle_at_12%_16%,rgba(14,165,233,0.08),transparent_34%)]" />
      {showSuccessToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-emerald-500" />
          <span className="font-bold text-[15px]">הפעולה עודכנה בהצלחה</span>
        </div>
      )}

      <div className="space-y-3">
        <header className="flex flex-col gap-3 rounded-2xl border border-blue-100/80 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(30,64,175,0.065)] sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-slate-600">ברוך הבא, {getStaffName()}</p>
            <h1 className="text-[25px] font-extrabold leading-tight text-slate-950 sm:text-[27px]">{dashboardTitle()}</h1>
            <p className="mt-0.5 text-[13px] text-slate-600">כל מה שצריך כדי לנהל את היום, במקום אחד.</p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end shrink-0">
            <span className="basis-full pb-1 text-[13px] text-slate-500 sm:basis-auto sm:px-2 sm:pb-0">עודכן {lastUpdated || "--:--"}</span>
            <button type="button" onClick={() => loadDashboardData(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[13px] font-semibold flex items-center gap-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
              <RefreshCw className={`w-4 h-4 ${isDashboardLoading ? "animate-spin" : ""}`} /> רענן
            </button>
            <DashboardAssistant attentionCount={clinicAttentionCount} />
            {isSecretary ? (
              <button type="button" onClick={() => navigate("/appointments/new")} className="h-9 px-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[13px] font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
                <CalendarPlus className="w-4 h-4" /> קבע תור
              </button>
            ) : (
              <button type="button" onClick={() => { setShowWalkInPicker(true); loadPatients(); }} className="h-9 px-3 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[13px] font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
                <ClipboardPlus className="w-4 h-4" /> {walkInButtonLabel}
              </button>
            )}
          </div>
        </header>

        {dashboardLoadWarning && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="status">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[13px] font-medium">חלק מנתוני המרפאה לא נטענו. הנתונים שכן התקבלו מוצגים כרגיל.</p>
            </div>
            <button type="button" onClick={() => loadDashboardData()} className="self-start rounded-xl border border-amber-200 bg-white px-3 py-2 text-[13px] font-bold text-amber-800 hover:bg-amber-100 sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30">
              נסה שוב
            </button>
          </div>
        )}

        <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 items-stretch">
          {statusTiles.map((tile) => {
            const Icon = tile.icon;
            const tileSkin = statusTileSkin(tile.tone);
            return (
              <button key={tile.label} type="button" onClick={() => navigate(tile.path)} className={`group relative h-full min-h-[86px] overflow-hidden rounded-2xl border px-3.5 py-2.5 text-right hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${tileSkin.card}`}>
                <span className={`absolute right-0 top-4 bottom-4 w-1 rounded-l-full ${tileSkin.bar}`} />
                <div className="flex h-full flex-col justify-between gap-2 pr-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13.5px] font-bold text-slate-700">{tile.label}</p>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ring-1 ${tileSkin.icon}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  </div>
                  <div>
                    <p className={`text-[23px] font-extrabold leading-none ${tileSkin.value}`}>{isDashboardLoading ? "…" : tile.value}</p>
                    <p className={`mt-1 truncate text-[12.5px] font-semibold leading-4 ${tileSkin.status}`}>{isDashboardLoading ? "טוען נתונים" : tile.status}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-12">
          <section className="flex min-h-[408px] h-full flex-col overflow-hidden rounded-2xl border border-blue-100/90 bg-white shadow-[0_12px_30px_rgba(30,64,175,0.055)] xl:col-span-7">
            <div className="flex min-h-[62px] items-center justify-between gap-3 bg-gradient-to-l from-blue-600 to-[#1e40af] px-5 py-3 text-white">
              <div>
                <h2 className="text-[18px] font-extrabold">לטיפול עכשיו</h2>
                <p className="mt-0.5 text-[12.5px] text-blue-100">תמונת מצב קצרה ופעולות שמומלץ לקדם היום.</p>
              </div>
              {!isDashboardLoading && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/14 px-3 py-1.5 text-[12px] font-bold ring-1 ring-white/20 backdrop-blur-sm">
                  <span className={`h-2 w-2 rounded-full ${clinicAttentionCount > 0 ? "bg-amber-300" : "bg-emerald-300"}`} />
                  {clinicAttentionCount > 0 ? `${clinicAttentionCount} פעולות` : "הכול בשליטה"}
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col">
                <div className="grid grid-cols-2 gap-2 border-b border-blue-100/70 bg-blue-50/45 p-3 sm:grid-cols-4">
                  {clinicAreas.map((area) => {
                    const Icon = area.icon;
                    return (
                      <button key={area.id} type="button" onClick={area.onClick} className="group flex min-h-[54px] items-center gap-2 rounded-xl border border-blue-100/80 bg-white px-3 text-right transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${area.iconClass}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-extrabold text-slate-900">{area.title}</span>
                          <span className={`mt-0.5 flex items-center gap-1 text-[11.5px] font-bold ${area.needsAttention ? "text-amber-700" : "text-emerald-700"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${area.needsAttention ? "bg-amber-500" : "bg-emerald-500"}`} />
                            {area.needsAttention ? "דורש בדיקה" : "תקין"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {isDashboardLoading ? (
                  <div className="flex min-h-[174px] items-center justify-center gap-2 text-[14px] font-medium text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" /> טוען תמונת מצב...</div>
                ) : workItems.length === 0 ? (
                  <div className="flex min-h-[174px] flex-col items-center justify-center px-4 text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"><Check className="h-5 w-5" /></div>
                    <p className="text-[15px] font-extrabold text-slate-950">אין כרגע פעולות חריגות</p>
                    <p className="mt-1 text-[13px] text-slate-500">אפשר להתמקד בתורים ובטיפול השוטף.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 px-3 py-1">
                    {workItems.map((item) => {
                      const Icon = item.icon;
                      const soft = item.tone === "blue" ? "bg-blue-50 text-blue-700" : item.tone === "emerald" ? "bg-emerald-50 text-emerald-700" : item.tone === "purple" ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700";
                      return (
                        <button key={item.id} type="button" onClick={() => navigate(item.path)} className="group flex min-h-[61px] w-full items-center gap-3 px-2 py-2 text-right transition-colors hover:bg-blue-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${soft}`}><Icon className="h-[17px] w-[17px]" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-extrabold text-slate-950">{item.title}</span><span className="mt-0.5 block truncate text-[12.5px] text-slate-600">{item.detail}</span></span>
                          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-blue-700" />
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          </section>

          <section className="flex min-h-[408px] h-full flex-col overflow-hidden rounded-2xl border border-blue-100/90 bg-white shadow-[0_12px_30px_rgba(30,64,175,0.055)] xl:col-span-5">
            <div className="flex min-h-[62px] items-center justify-between gap-3 border-b border-blue-100/70 bg-gradient-to-l from-blue-50/90 via-white to-white px-5 py-3">
              <div>
                <h2 className="text-[18px] font-extrabold text-slate-950">תורים להיום</h2>
                <p className="mt-0.5 text-[12.5px] text-slate-600">{dashboardData.appointments.length} תורים · {remainingAppointmentsCount} נותרו לטיפול היום</p>
              </div>
              <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 ring-1 ring-blue-100">
                <Clock className="w-[18px] h-[18px]" />
              </div>
            </div>

            <div className="border-b border-blue-100/70 bg-blue-50/45 p-2.5">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/appointments")}
                  className="rounded-xl border border-blue-600 bg-gradient-to-l from-blue-600 to-[#1e40af] px-3 py-2 text-right text-white shadow-sm shadow-blue-700/15 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  <p className="text-[13px] font-bold text-blue-100">התור הבא</p>
                  <p className="mt-0.5 truncate text-[14px] font-extrabold text-white">{nextAppointment ? nextAppointment.timeLabel : "אין תור קרוב"}</p>
                </button>
                <button type="button" onClick={() => navigate("/appointments")} className="rounded-xl bg-white border border-blue-100 px-3 py-2 text-right hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
                  <p className="text-[12.5px] font-bold text-slate-600">וידאו</p>
                  <p className="mt-0.5 text-[14px] font-extrabold text-slate-950">{videoAppointmentsCount}</p>
                </button>
                <button type="button" onClick={() => navigate("/appointments")} className="rounded-xl bg-white border border-blue-100 px-3 py-2 text-right hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
                  <p className="text-[12.5px] font-bold text-slate-600">במרפאה</p>
                  <p className="mt-0.5 text-[14px] font-extrabold text-slate-950">{physicalAppointmentsCount}</p>
                </button>
              </div>
            </div>

            <div className="flex-1 px-3 py-1">
              {isDashboardLoading ? (
                <div className="flex min-h-[160px] items-center justify-center gap-2 text-[13px] font-medium text-slate-500" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" /> טוען את יומן היום...
                </div>
              ) : todaysAppointments.length === 0 ? (
                <div className="min-h-[120px] flex flex-col items-center justify-center text-center text-gray-500">
                  <CalendarCheck className="w-9 h-9 text-gray-300 mb-2" />
                  <p className="text-[14px] font-bold text-gray-700">אין תורים להיום</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {prioritizedTodaysAppointments.slice(0, 5).map((appointment) => {
                    const appointmentTime = new Date(appointment.startTime).getTime();
                    const isPast = !Number.isNaN(appointmentTime) && appointmentTime < nowTime.getTime();
                    const isOverdue = isPast && !appointment.hasTreatment;
                    const isCompleted = appointment.hasTreatment;
                    const isNext = nextAppointment?.id === appointment.id;
                    const isPriority = isPriorityAppointment(appointment);
                    const isActivePriority = isPriority && !isPast;
                    const appointmentClass = isCompleted
                      ? "bg-slate-50/55 opacity-45 grayscale-[0.25] hover:opacity-65"
                      : isOverdue
                      ? "bg-orange-50/80 ring-1 ring-inset ring-orange-200 hover:bg-orange-100/70"
                      : isActivePriority
                      ? "bg-amber-50/65 hover:bg-amber-50"
                      : isNext
                        ? "bg-blue-50/85 hover:bg-blue-100/70"
                        : "hover:bg-slate-50";
                    const timeClass = isCompleted
                      ? "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                      : isOverdue
                      ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300"
                      : isActivePriority
                      ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                      : isNext
                        ? "bg-blue-600 text-white"
                        : "bg-gray-50 text-gray-900";
                    return (
                      <button key={appointment.id} type="button" onClick={() => openAppointment(appointment)} className={`w-full px-2 py-2 text-right cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 ${appointmentClass}`}>
                        <div className="flex items-center gap-3">
                          {isActivePriority && <span className="h-10 w-1 shrink-0 rounded-full bg-amber-500" />}
                          <div className={`w-14 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${timeClass}`}>
                            <span className="text-[14px] font-extrabold leading-none">{appointment.timeLabel}</span>
                            <span className="mt-1 text-[11px] opacity-75">{isCompleted ? "טופל" : isOverdue ? "באיחור" : isActivePriority ? "דחוף" : isNext ? "הבא" : "מתוכנן"}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`${isCompleted ? "text-slate-600" : isOverdue ? "text-orange-950" : isActivePriority ? "text-amber-950" : "text-gray-950"} truncate text-[14px] font-extrabold`}>{appointment.type || "ביקור"}</p>
                              {isOverdue && <span className="rounded-full border border-orange-200 bg-white/90 px-2 py-0.5 text-[11px] font-bold text-orange-800">טרם התחיל טיפול</span>}
                              {isActivePriority && <span className="rounded-full border border-amber-200 bg-white/85 px-2 py-0.5 text-[11px] font-bold text-amber-800">עדיפות גבוהה</span>}
                              {appointment.mode === "video" && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">וידאו</span>}
                            </div>
                            <p className={`mt-0.5 truncate text-[13px] ${isCompleted ? "text-slate-500" : "text-slate-700"}`}>{appointment.petName} · {appointment.ownerName}</p>
                            <p className="truncate text-[13px] text-slate-500">{appointment.vetName || "רופא לא שובץ"}{appointment.room ? ` · ${appointment.room}` : appointment.mode === "video" ? " · דיגיטל" : ""}</p>
                          </div>
                          <ArrowLeft className={`h-4 w-4 ${isOverdue ? "text-orange-600" : isActivePriority ? "text-amber-600" : "text-slate-400"} shrink-0`} />
                        </div>
                      </button>
                    );
                  })}
                  {todaysAppointments.length > 5 && (
                    <button type="button" onClick={() => navigate("/appointments")} className="w-full h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                      עוד {todaysAppointments.length - 5} תורים ביומן <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
              <button type="button" onClick={() => navigate("/appointments")} className="flex-1 h-10 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                פתח יומן <ArrowLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => navigate("/appointments/new")} className="flex-1 h-10 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                קבע תור <CalendarPlus className="w-4 h-4" />
              </button>
            </div>
          </section>

        </section>
      </div>

      {showWalkInPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-l from-orange-500 to-amber-500 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {modalView === "new-patient" ? <button onClick={() => { setModalView("list"); setNewForm(emptyForm); setFormErrors({}); }} className="text-white/70 hover:text-white cursor-pointer p-1"><ArrowRight className="w-5 h-5" /></button> : <ClipboardPlus className="w-5 h-5 text-white/80" />}
                <div>
                  <h3 className="text-white text-[17px] font-semibold">{modalView === "list" ? walkInButtonLabel : "רישום מטופל חדש"}</h3>
                  <p className="text-white/70 text-[13px]">{modalView === "list" ? "בחרו מטופל קיים או הוסיפו מטופל חדש" : "מלאו את הפרטים לפתיחת טיפול"}</p>
                </div>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white cursor-pointer p-1"><X className="w-5 h-5" /></button>
            </div>

            {modalView === "list" && (
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 pt-5 pb-3 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                    {walkInSearch && <button onClick={() => setWalkInSearch("")} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>}
                    <input type="text" placeholder="חיפוש לפי שם חיה, בעלים, טלפון, שבב..." value={walkInSearch} onChange={(e) => setWalkInSearch(e.target.value)} className="w-full pr-11 pl-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300" autoFocus />
                  </div>
                  {loadError && <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-600 text-[13px]"><AlertCircle className="w-4 h-4" />{loadError}</div>}
                  <button onClick={() => setModalView("new-patient")} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer text-[14px] font-semibold"><UserPlus className="w-4 h-4" /> מטופל חדש שלא קיים במערכת</button>
                </div>
                <div className="overflow-y-auto px-5 pb-5 max-h-[50vh] space-y-2">
                  {isLoadingPatients ? <div className="py-10 text-center text-gray-500 text-[14px]"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />טוען מטופלים...</div> : filteredPatients.length === 0 ? <div className="py-10 text-center text-gray-400 text-[14px]">לא נמצאו מטופלים מתאימים.</div> : filteredPatients.map((patient) => {
                    const Icon = patient.petSpecies === "dog" ? Dog : patient.petSpecies === "cat" ? Cat : PawPrint;
                    return (
                      <button key={patient.id} onClick={() => handleSelectPatient(patient)} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 transition-all text-right cursor-pointer group">
                        <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-orange-50 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-orange-500" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-[15px] font-semibold truncate">{patient.petName} <span className="text-gray-400 font-normal">· {patient.speciesLabel}</span></p>
                          <p className="text-gray-500 text-[13px] truncate">{patient.ownerName}</p>
                          <p className="text-gray-400 text-[13px] flex items-center gap-1"><Phone className="w-3 h-3" /> {patient.ownerPhone || "אין טלפון"}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {modalView === "new-patient" && (
              <div className="overflow-y-auto p-5 space-y-5">
                {loadError && <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-red-600 text-[13px]"><AlertCircle className="w-4 h-4" />{loadError}</div>}
                <section className="space-y-3">
                  <h4 className="text-gray-800 text-[14px] font-bold">פרטי החיה</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {renderInput("שם חיה", "petName", "למשל: לונה", true)}
                    <div><label className="block text-gray-600 text-[13px] mb-1.5 font-medium">סוג חיה</label><select value={newForm.speciesType} onChange={(e) => updateField("speciesType", e.target.value)} className={inputClass("speciesType")}>{speciesOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{renderError("speciesType")}</div>
                    <div><label className="block text-gray-600 text-[13px] mb-1.5 font-medium">מין</label><select value={newForm.gender} onChange={(e) => updateField("gender", e.target.value)} className={inputClass("gender")}>{genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    {renderInput("גזע", "breed", "למשל: לברדור", true)}
                    {renderInput("תאריך לידה", "birthDate", "", false, "date")}
                    {renderInput("משקל", "weight", "ק״ג", false, "number")}
                    {renderInput("שבב", "microchip", "מספר שבב")}
                    <div><label className="block text-gray-600 text-[13px] mb-1.5 font-medium">מסורס / מעוקרת</label><select value={newForm.neuteredStatus} onChange={(e) => updateField("neuteredStatus", e.target.value)} className={inputClass("neuteredStatus")}>{neuteredOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    <div className="sm:col-span-2">{renderInput("אלרגיות", "allergies", "אם אין — להשאיר ריק")}</div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h4 className="text-gray-800 text-[14px] font-bold">פרטי בעלים</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {renderInput("שם פרטי", "ownerFirstName", "שם פרטי", true)}
                    {renderInput("שם משפחה", "ownerLastName", "שם משפחה")}
                    {renderInput("תעודת זהות", "ownerId", "אפשר להשאיר ריק")}
                    {renderInput("טלפון", "ownerPhone", "05X-XXXXXXX", true)}
                    {renderInput("אימייל", "ownerEmail", "name@email.com", false, "email")}
                    {renderInput("כתובת", "ownerAddress", "כתובת")}
                  </div>
                </section>
                <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
                  <button onClick={validateAndSave} disabled={isSavingPatient} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white transition-colors cursor-pointer text-[14px] font-semibold flex items-center justify-center gap-2">{isSavingPatient ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{staffType === "nurse" ? "שמור ופתח תיעוד" : "שמור והתחל רשומה"}</button>
                  <button onClick={() => setModalView("list")} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] font-medium">חזרה</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {treatmentPatient && (
        <TreatmentModal isOpen={Boolean(treatmentPatient)} onClose={() => setTreatmentPatient(null)} patientId={treatmentPatient.id} appointmentId={treatmentPatient.appointmentId} petName={treatmentPatient.petName} petSpecies={treatmentPatient.petSpecies} ownerName={treatmentPatient.ownerName} onSave={() => { setTreatmentPatient(null); void loadDashboardData(false); setShowSuccessToast(true); setTimeout(() => setShowSuccessToast(false), 3000); }} />
      )}
    </main>
  );
}
