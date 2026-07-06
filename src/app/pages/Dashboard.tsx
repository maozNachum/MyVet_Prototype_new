import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bed,
  CalendarCheck,
  CalendarPlus,
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
  Zap,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { DashboardAssistant } from "../components/ai/PageAssistants";
import { TreatmentModal } from "../components/TreatmentModal";
import { canEditMedicalRecords, getStaffName, getStaffType } from "../data/staffAuth";
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

function buildWorkItems(data: DashboardData, staffType: string): WorkItem[] {
  const isSecretary = staffType === "secretary";
  const isVet = staffType === "vet";
  const isNurse = staffType === "nurse";
  const videoAppointments = data.appointments.filter((item) => item.mode === "video");
  const missingVet = data.appointments.filter((item) => !item.vetName || item.vetName === "לא שובץ");
  const missingRoom = data.appointments.filter((item) => item.mode !== "video" && !item.room);
  const urgentConversations = data.conversations.filter((item) => item.priority === "urgent" || item.priority === "high");
  const openLabs = data.labs.filter((item) => String(item.status || "").toLowerCase() !== "completed");
  const urgentLabs = openLabs.filter((item) => item.is_urgent === true);
  const openPayments = data.payments.filter((item) => ["unpaid", "partial"].includes(String(item.status || "")));
  const lowInventory = data.inventory.filter(isLowInventoryItem);
  const items: WorkItem[] = [];

  if (urgentConversations.length > 0) items.push({ id: "urgent-conversations", title: `${urgentConversations.length} פניות בעדיפות גבוהה`, detail: "לטיפול לפני פניות רגילות", icon: MessageCircle, tone: "red", path: "/digital-care?filter=urgent", action: "פתח", priority: 1 });
  if (videoAppointments.length > 0) items.push({ id: "video-appointments", title: `${videoAppointments.length} תורי וידאו להיום`, detail: "בדוק קישור לפני התור", icon: Video, tone: "blue", path: "/digital-care?filter=video", action: "פתח", priority: 2 });
  if (missingVet.length > 0) items.push({ id: "missing-vet", title: `${missingVet.length} תורים בלי רופא`, detail: "להשלים שיבוץ", icon: CalendarCheck, tone: "amber", path: "/appointments", action: "פתח", priority: 3 });
  if (missingRoom.length > 0) items.push({ id: "missing-room", title: `${missingRoom.length} תורים בלי חדר`, detail: "להשלים מיקום", icon: LayoutDashboard, tone: "amber", path: "/appointments", action: "פתח", priority: 4 });
  if ((isVet || isNurse) && urgentLabs.length > 0) items.push({
    id: "urgent-labs",
    title: `${urgentLabs.length} בדיקות דחופות`,
    detail: "בדוק תוצאות",
    icon: FlaskConical,
    tone: "red",
    path: "/lab-orders?filter=urgent",
    action: "פתח",
    priority: 5,
  });
  const criticalHospitalizations = data.hospitalizations.filter((item) => item.severity === "critical" || item.severity === "serious");
  const expectedDischarges = data.hospitalizations.filter((item) => Boolean(item.expected_discharge_at));

  if ((isVet || isNurse) && criticalHospitalizations.length > 0) items.push({
    id: "critical-hospitalizations",
    title: `${criticalHospitalizations.length} אשפוזים חמורים`,
    detail: "בדוק סטטוס",
    icon: Bed,
    tone: "red",
    path: "/hospitalizations?filter=critical",
    action: "פתח",
    priority: 6,
  });
  if ((isVet || isNurse) && expectedDischarges.length > 0) items.push({
    id: "expected-discharges",
    title: `${expectedDischarges.length} שחרורים צפויים`,
    detail: "הכן שחרור",
    icon: Bed,
    tone: "emerald",
    path: "/hospitalizations?filter=discharge",
    action: "פתח",
    priority: 7,
  });
  if (isSecretary && openPayments.length > 0) items.push({ id: "payments", title: `${openPayments.length} תשלומים למעקב`, detail: "בדוק חיובים", icon: WalletCards, tone: "emerald", path: "/reports", action: "פתח", priority: 7 });
  if (lowInventory.length > 0) items.push({ id: "inventory", title: `${lowInventory.length} פריטי מלאי נמוכים`, detail: "בדוק הזמנה", icon: Package, tone: "slate", path: "/inventory?filter=low-stock", action: "פתח", priority: 8 });

  return items.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

function dashboardTitle(staffType: string) {
  
  return "מרכז המידע";
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
  const [treatmentPatient, setTreatmentPatient] = useState<{ id: number; petName: string; petSpecies: string; ownerName: string } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData>({ appointments: [], conversations: [], labs: [], hospitalizations: [], payments: [], inventory: [] });
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  const navigate = useNavigate();
  const { refreshAppointments } = useAppointmentStore();
  const staffType = getStaffType();
  const isSecretary = staffType === "secretary";
  const canTreat = canEditMedicalRecords();
  const walkInButtonLabel = staffType === "nurse" ? "קליטת מטופל" : "טיפול ללא תור";

  const filteredPatients = useMemo(() => patients.filter((patient) => matchesPatient(patient, walkInSearch)).slice(0, 50), [patients, walkInSearch]);
  const workItems = useMemo(() => buildWorkItems(dashboardData, staffType), [dashboardData, staffType]);

  const todaysAppointments = useMemo(() => dashboardData.appointments.slice(0, 7), [dashboardData.appointments]);
  const nowTime = useMemo(() => new Date(), [lastUpdated, dashboardData.appointments.length]);
  const nextAppointment = useMemo(() => {
    const nowMs = nowTime.getTime();
    return dashboardData.appointments.find((appointment) => {
      const value = new Date(appointment.startTime).getTime();
      return !Number.isNaN(value) && value >= nowMs;
    }) || null;
  }, [dashboardData.appointments, nowTime]);
  const remainingAppointmentsCount = useMemo(() => {
    const nowMs = nowTime.getTime();
    return dashboardData.appointments.filter((appointment) => {
      const value = new Date(appointment.startTime).getTime();
      return !Number.isNaN(value) && value >= nowMs;
    }).length;
  }, [dashboardData.appointments, nowTime]);
  const videoAppointmentsCount = useMemo(() => dashboardData.appointments.filter((appointment) => appointment.mode === "video").length, [dashboardData.appointments]);
  const physicalAppointmentsCount = dashboardData.appointments.length - videoAppointmentsCount;
  const expectedDischarges = useMemo(() => dashboardData.hospitalizations.filter((item) => Boolean(item.expected_discharge_at)), [dashboardData.hospitalizations]);

  const statusTiles = useMemo(() => [
    { label: "תורים להיום", value: dashboardData.appointments.length, icon: CalendarCheck, tone: "bg-blue-50 text-blue-700", path: "/appointments" },
    { label: "פניות פתוחות", value: dashboardData.conversations.length, icon: MessageCircle, tone: "bg-rose-50 text-rose-700", path: "/digital-care?filter=open" },
    { label: isSecretary ? "גבייה למעקב" : "בדיקות ממתינות", value: isSecretary ? dashboardData.payments.length : dashboardData.labs.length, icon: isSecretary ? WalletCards : FlaskConical, tone: "bg-amber-50 text-amber-700", path: isSecretary ? "/reports" : "/lab-orders?filter=open" },
    { label: "אשפוזים פעילים", value: dashboardData.hospitalizations.length, icon: Bed, tone: "bg-emerald-50 text-emerald-700", path: "/hospitalizations?filter=active" },
    { label: "מלאי נמוך", value: dashboardData.inventory.length, icon: Package, tone: "bg-slate-50 text-slate-700", path: "/inventory?filter=low-stock" },
  ], [dashboardData, isSecretary]);

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
        supabase.from("appointments").select("appointment_id, pet_id, start_time, appointment_type, department, vet_name, room, notes, appointment_mode").gte("start_time", start.toISOString()).lt("start_time", end.toISOString()).order("start_time", { ascending: true }),
        supabase.from("conversations").select("conversation_id, subject, status, priority, last_message_at").in("status", ["open", "waiting_staff", "waiting_owner"]),
        supabase.from("lab_orders").select("lab_order_id, test_name, status, is_urgent, ordered_date, test_date, pet_id").neq("status", "completed"),
        supabase.from("hospitalizations").select("hospitalization_id, pet_id, department, status, severity, admitted_at, expected_discharge_at").eq("status", "active"),
        supabase.from("payments").select("payment_id, amount, status, due_date, owner_id, pet_id").in("status", ["unpaid", "partial"]),
        supabase.from("inventory").select("item_id, item_name, category, stock_quantity, low_stock_threshold, price"),
      ]);

      const rawAppointments = appointmentsResult.status === "fulfilled" && !appointmentsResult.value.error ? (appointmentsResult.value.data || []) as any[] : [];
      const petIds = Array.from(new Set(rawAppointments.map((item) => item.pet_id).filter(Boolean).map((item) => Number(item))));
      const petMap = new Map<number, { petName: string; ownerName: string; ownerPhone: string }>();

      if (petIds.length > 0) {
        const { data: patientRows } = await supabase.from("patients").select("pet_id, pet_name, owner_id").in("pet_id", petIds);
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
        } as AppointmentItem;
      });

      setDashboardData({
        appointments,
        conversations: conversationsResult.status === "fulfilled" && !conversationsResult.value.error ? conversationsResult.value.data || [] : [],
        labs: labsResult.status === "fulfilled" && !labsResult.value.error ? labsResult.value.data || [] : [],
        hospitalizations: hospitalizationsResult.status === "fulfilled" && !hospitalizationsResult.value.error ? hospitalizationsResult.value.data || [] : [],
        payments: paymentsResult.status === "fulfilled" && !paymentsResult.value.error ? paymentsResult.value.data || [] : [],
        inventory: inventoryResult.status === "fulfilled" && !inventoryResult.value.error ? ((inventoryResult.value.data || []) as any[]).filter(isLowInventoryItem) : [],
      });
      setLastUpdated(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      console.error("Failed to load dashboard data", error);
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
    return () => {
      window.removeEventListener("focus", syncDashboard);
      document.removeEventListener("visibilitychange", syncDashboard);
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
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
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
      const { error: ownerError } = await supabase.from("owners").upsert(ownerPayload, { onConflict: "owner_id" });
      if (ownerError) throw ownerError;
      const specOpt = speciesOptions.find((s) => s.value === newForm.speciesType);
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .insert([{ pet_name: newForm.petName.trim(), species: specOpt?.species || newForm.speciesType, breed: newForm.breed.trim(), gender: newForm.gender, birth_date: newForm.birthDate || null, microchip: newForm.microchip.trim() || null, allergies: newForm.allergies.trim() || null, weight: newForm.weight ? Number(newForm.weight) : null, neutered_status: newForm.neuteredStatus, owner_id: ownerId }])
        .select("pet_id, pet_name, species, breed, microchip, owner_id")
        .single();
      if (patientError) throw patientError;
      await loadPatients();
      const newPatient: PatientListItem = { id: Number(patientData.pet_id), petName: patientData.pet_name || newForm.petName, petSpecies: normalizeSpecies(patientData.species), speciesLabel: speciesLabel(patientData.species), breed: patientData.breed || newForm.breed, microchip: patientData.microchip || "", ownerId, ownerName: fullName(ownerPayload.owner_first_name, ownerPayload.owner_last_name) || ownerPayload.owner_first_name, ownerPhone: ownerPayload.phone, ownerEmail: ownerPayload.email || "" };
      handleSelectPatient(newPatient);
    } catch (error) {
      console.error("Failed to create walk-in patient", error);
      setLoadError("לא הצלחנו לשמור את המטופל החדש. בדוק שהפרטים מלאים ונסה שוב.");
    } finally {
      setIsSavingPatient(false);
    }
  };

  const inputClass = (field: keyof NewPatientForm) => `w-full px-3.5 py-2.5 border rounded-xl text-[14px] focus:outline-none focus:ring-2 transition-all ${formErrors[field] ? "border-red-300 bg-red-50/50 focus:ring-red-500/20" : "border-gray-200 bg-white focus:ring-orange-500/20"}`;
  const renderError = (field: keyof NewPatientForm) => formErrors[field] ? <p className="mt-1 text-[12px] text-red-500 font-medium">{formErrors[field]}</p> : null;
  const renderInput = (label: string, field: keyof NewPatientForm, placeholder: string, required = false, type = "text") => (
    <div>
      <label className="block text-gray-600 text-[12px] mb-1.5 font-medium">{label} {required && <span className="text-red-400">*</span>}</label>
      <input type={type} placeholder={placeholder} value={newForm[field]} onChange={(e) => updateField(field, e.target.value)} className={inputClass(field)} />
      {renderError(field)}
    </div>
  );


  const handleStatusTileClick = (label: string) => {
    if (label === "וידאו" || label === "פניות") {
      navigate("/digital-care?filter=open");
      return;
    }
    if (label === "מעבדה") {
      navigate("/lab-orders");
      return;
    }
    if (label === "גבייה") {
      navigate("/reports");
      return;
    }
    if (label === "אשפוזים") {
      navigate("/hospitalizations");
      return;
    }
    navigate("/appointments");
  };

  const openLabTarget = () => navigate("/lab-orders?filter=open");

  const openHospitalizationTarget = () => navigate("/hospitalizations?filter=discharge");

  const openConversationTarget = () => navigate("/digital-care?filter=open");

  return (
    <main className="max-w-7xl mx-auto px-4 py-5 min-h-[calc(100vh-84px)] relative" dir="rtl">
      {showSuccessToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-emerald-500" />
          <span className="font-bold text-[15px]">הפעולה עודכנה בהצלחה</span>
        </div>
      )}

      <div className="space-y-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-gray-500 text-[13px] font-medium">ברוך הבא, {getStaffName()}</p>
            <h1 className="text-gray-950 text-[28px] font-extrabold leading-tight">{dashboardTitle(staffType)}</h1>
            <p className="text-gray-500 text-[13px] mt-1">תצוגה יומית רגועה: קודם חריגים, אחר כך תורים, ואז כניסה למסכי העבודה.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-gray-400 text-[12px] px-2">עודכן {lastUpdated || "--:--"}</span>
            <button type="button" onClick={() => loadDashboardData(false)} className="h-10 px-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-semibold flex items-center gap-2 cursor-pointer transition-colors">
              <RefreshCw className={`w-4 h-4 ${isDashboardLoading ? "animate-spin" : ""}`} /> רענן
            </button>
            <DashboardAssistant />
            {isSecretary ? (
              <button type="button" onClick={() => navigate("/appointments/new")} className="h-10 px-4 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[13px] font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors">
                <CalendarPlus className="w-4 h-4" /> קבע תור
              </button>
            ) : (
              <button type="button" onClick={() => { setShowWalkInPicker(true); loadPatients(); }} className="h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors">
                <Zap className="w-4 h-4" /> {walkInButtonLabel}
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {statusTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <button key={tile.label} type="button" onClick={() => navigate(tile.path)} className="group bg-white border border-gray-100 rounded-2xl px-4 py-3 text-right hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-gray-500 text-[12px] font-semibold truncate">{tile.label}</p>
                    <p className="text-gray-950 text-[24px] font-extrabold leading-none mt-1">{tile.value}</p>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-gray-50 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-700 flex items-center justify-center transition-colors">
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <div className="xl:col-span-7 space-y-4">
            <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-950 text-[18px] font-extrabold">מה דורש טיפול עכשיו</h2>
                  <p className="text-gray-500 text-[12px] mt-1">רשימה אחת מסודרת לפי דחיפות, בלי כרטיסים צועקים.</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>

              <div className="p-3">
                {workItems.length === 0 ? (
                  <div className="min-h-[170px] flex flex-col items-center justify-center text-center text-gray-500">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                      <Check className="w-5 h-5" />
                    </div>
                    <p className="text-[15px] font-bold text-gray-800">אין חריגים פתוחים כרגע</p>
                    <p className="text-[13px] mt-1">אפשר להמשיך לתורים או לפתוח מסכי עבודה לפי צורך.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {workItems.map((item) => {
                      const Icon = item.icon;
                      const accent = item.tone === "red" ? "bg-red-500" : item.tone === "amber" ? "bg-amber-500" : item.tone === "blue" ? "bg-blue-500" : item.tone === "emerald" ? "bg-emerald-500" : item.tone === "purple" ? "bg-purple-500" : "bg-slate-400";
                      const soft = item.tone === "red" ? "bg-red-50 text-red-700" : item.tone === "amber" ? "bg-amber-50 text-amber-700" : item.tone === "blue" ? "bg-blue-50 text-blue-700" : item.tone === "emerald" ? "bg-emerald-50 text-emerald-700" : item.tone === "purple" ? "bg-purple-50 text-purple-700" : "bg-slate-50 text-slate-700";
                      return (
                        <button key={item.id} type="button" onClick={() => navigate(item.path)} className="w-full px-2 py-3.5 text-right hover:bg-gray-50 rounded-2xl transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <span className={`w-1.5 h-10 rounded-full ${accent}`} />
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${soft}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-gray-950 text-[14px] font-extrabold truncate">{item.title}</p>
                              <p className="text-gray-500 text-[12px] mt-0.5 truncate">{item.detail}</p>
                            </div>
                            <div className="hidden sm:flex items-center gap-1 text-blue-700 text-[12px] font-bold shrink-0">
                              {item.action} <ArrowLeft className="w-4 h-4" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-950 text-[18px] font-extrabold">מעקב מרפאה</h2>
                  <p className="text-gray-500 text-[12px] mt-1">אותו מידע, אבל במצב סיכום. פירוט מלא נמצא במסך העבודה.</p>
                </div>
                <LayoutDashboard className="w-5 h-5 text-gray-400" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
                <button type="button" onClick={openConversationTarget} className="rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-right transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-gray-950 text-[15px] font-extrabold">פניות פתוחות</p>
                      <p className="text-gray-500 text-[12px] mt-1">{dashboardData.conversations.length === 0 ? "אין פניות פתוחות" : `${dashboardData.conversations.length} פניות מחכות לטיפול`}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center"><MessageCircle className="w-5 h-5" /></div>
                  </div>
                  {dashboardData.conversations[0] && <p className="mt-3 text-[12px] text-gray-600 truncate">אחרונה: {dashboardData.conversations[0].subject || "פנייה פתוחה"}</p>}
                </button>

                <button type="button" onClick={openLabTarget} className="rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-right transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-gray-950 text-[15px] font-extrabold">מעבדה</p>
                      <p className="text-gray-500 text-[12px] mt-1">{dashboardData.labs.length === 0 ? "אין בדיקות פתוחות" : `${dashboardData.labs.length} בדיקות ממתינות`}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><FlaskConical className="w-5 h-5" /></div>
                  </div>
                  {dashboardData.labs[0] && <p className="mt-3 text-[12px] text-gray-600 truncate">אחרונה: {dashboardData.labs[0].test_name || "בדיקה"}</p>}
                </button>

                <button type="button" onClick={openHospitalizationTarget} className="rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-right transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-gray-950 text-[15px] font-extrabold">אשפוזים</p>
                      <p className="text-gray-500 text-[12px] mt-1">{expectedDischarges.length === 0 ? `${dashboardData.hospitalizations.length} פעילים` : `${expectedDischarges.length} שחרורים צפויים`}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Bed className="w-5 h-5" /></div>
                  </div>
                  {expectedDischarges[0] && <p className="mt-3 text-[12px] text-gray-600 truncate">לשחרור: {expectedDischarges[0].department || "אשפוז"}</p>}
                </button>

                <button type="button" onClick={() => navigate("/inventory?filter=low-stock")} className="rounded-2xl border border-gray-100 bg-white hover:bg-gray-50 p-4 text-right transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-gray-950 text-[15px] font-extrabold">מלאי נמוך</p>
                      <p className="text-gray-500 text-[12px] mt-1">{dashboardData.inventory.length === 0 ? "אין חריגות מלאי" : `${dashboardData.inventory.length} פריטים לבדיקה`}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center"><Package className="w-5 h-5" /></div>
                  </div>
                  {dashboardData.inventory[0] && <p className="mt-3 text-[12px] text-gray-600 truncate">נמוך: {dashboardData.inventory[0].item_name || "פריט"}</p>}
                </button>
              </div>
            </section>
          </div>

          <aside className="xl:col-span-5 space-y-4">
            <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-950 text-[18px] font-extrabold">תורים להיום</h2>
                  <p className="text-gray-500 text-[12px] mt-1">{dashboardData.appointments.length} תורים · {remainingAppointmentsCount} נותרו להיום</p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              <div className="p-4 bg-gray-50/70 border-b border-gray-100">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white border border-gray-100 p-3">
                    <p className="text-gray-500 text-[11px] font-bold">התור הבא</p>
                    <p className="text-gray-950 text-[14px] font-extrabold mt-1 truncate">{nextAppointment ? nextAppointment.timeLabel : "אין"}</p>
                  </div>
                  <button type="button" onClick={() => navigate("/digital-care?filter=video")} className="rounded-2xl bg-white border border-gray-100 p-3 text-right hover:border-blue-200 transition-colors cursor-pointer">
                    <p className="text-gray-500 text-[11px] font-bold">וידאו</p>
                    <p className="text-gray-950 text-[14px] font-extrabold mt-1">{videoAppointmentsCount}</p>
                  </button>
                  <button type="button" onClick={() => navigate("/appointments")} className="rounded-2xl bg-white border border-gray-100 p-3 text-right hover:border-blue-200 transition-colors cursor-pointer">
                    <p className="text-gray-500 text-[11px] font-bold">במרפאה</p>
                    <p className="text-gray-950 text-[14px] font-extrabold mt-1">{physicalAppointmentsCount}</p>
                  </button>
                </div>
              </div>

              <div className="p-3">
                {todaysAppointments.length === 0 ? (
                  <div className="min-h-[220px] flex flex-col items-center justify-center text-center text-gray-500">
                    <CalendarCheck className="w-9 h-9 text-gray-300 mb-2" />
                    <p className="text-[14px] font-bold text-gray-700">אין תורים להיום</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {todaysAppointments.map((appointment) => {
                      const appointmentTime = new Date(appointment.startTime).getTime();
                      const isPast = !Number.isNaN(appointmentTime) && appointmentTime < nowTime.getTime();
                      const isNext = nextAppointment?.id === appointment.id;
                      return (
                        <button key={appointment.id} type="button" onClick={() => appointment.mode === "video" ? navigate("/digital-care?filter=video") : navigate("/appointments")} className={`w-full rounded-2xl px-3 py-3 text-right cursor-pointer transition-colors ${isNext ? "bg-blue-50 border border-blue-100" : "hover:bg-gray-50 border border-transparent"}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-14 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 ${isNext ? "bg-blue-600 text-white" : isPast ? "bg-gray-100 text-gray-500" : "bg-gray-50 text-gray-900"}`}>
                              <span className="text-[14px] font-extrabold leading-none">{appointment.timeLabel}</span>
                              <span className="text-[10px] opacity-75 mt-1">{isNext ? "הבא" : isPast ? "עבר" : "היום"}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-gray-950 text-[14px] font-extrabold truncate">{appointment.type || "ביקור"}</p>
                                {appointment.mode === "video" && <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold">וידאו</span>}
                              </div>
                              <p className="text-gray-600 text-[12px] truncate mt-0.5">{appointment.petName} · {appointment.ownerName}</p>
                              <p className="text-gray-400 text-[11px] truncate">{appointment.vetName || "רופא לא שובץ"}{appointment.room ? ` · ${appointment.room}` : appointment.mode === "video" ? " · דיגיטל" : ""}</p>
                            </div>
                            <ArrowLeft className="w-4 h-4 text-gray-400 shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-gray-100 flex items-center gap-2">
                <button type="button" onClick={() => navigate("/appointments")} className="flex-1 h-10 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  פתח יומן <ArrowLeft className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => navigate("/appointments/new")} className="flex-1 h-10 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  קבע תור <CalendarPlus className="w-4 h-4" />
                </button>
              </div>
            </section>
          </aside>
        </section>
      </div>

      {showWalkInPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-l from-orange-500 to-amber-500 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {modalView === "new-patient" ? <button onClick={() => { setModalView("list"); setNewForm(emptyForm); setFormErrors({}); }} className="text-white/70 hover:text-white cursor-pointer p-1"><ArrowRight className="w-5 h-5" /></button> : <Zap className="w-5 h-5 text-white/80" />}
                <div>
                  <h3 className="text-white text-[17px] font-semibold">{modalView === "list" ? walkInButtonLabel : "רישום מטופל חדש"}</h3>
                  <p className="text-white/70 text-[12px]">{modalView === "list" ? "בחרו מטופל קיים או הוסיפו מטופל חדש" : "מלאו את הפרטים לפתיחת טיפול"}</p>
                </div>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white cursor-pointer p-1"><X className="w-5 h-5" /></button>
            </div>

            {modalView === "list" && (
              <div className="flex flex-col overflow-hidden">
                <div className="px-5 pt-5 pb-3 space-y-3 shrink-0">
                  <div className="relative">
                    <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500 pointer-events-none" />
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
                          <p className="text-gray-400 text-[12px] flex items-center gap-1"><Phone className="w-3 h-3" /> {patient.ownerPhone || "אין טלפון"}</p>
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
                  <div className="grid grid-cols-2 gap-3">
                    {renderInput("שם חיה", "petName", "למשל: לונה", true)}
                    <div><label className="block text-gray-600 text-[12px] mb-1.5 font-medium">סוג חיה</label><select value={newForm.speciesType} onChange={(e) => updateField("speciesType", e.target.value)} className={inputClass("speciesType")}>{speciesOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{renderError("speciesType")}</div>
                    <div><label className="block text-gray-600 text-[12px] mb-1.5 font-medium">מין</label><select value={newForm.gender} onChange={(e) => updateField("gender", e.target.value)} className={inputClass("gender")}>{genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    {renderInput("גזע", "breed", "למשל: לברדור", true)}
                    {renderInput("תאריך לידה", "birthDate", "", false, "date")}
                    {renderInput("משקל", "weight", "ק״ג", false, "number")}
                    {renderInput("שבב", "microchip", "מספר שבב")}
                    <div><label className="block text-gray-600 text-[12px] mb-1.5 font-medium">מסורס / מעוקרת</label><select value={newForm.neuteredStatus} onChange={(e) => updateField("neuteredStatus", e.target.value)} className={inputClass("neuteredStatus")}>{neuteredOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    <div className="col-span-2">{renderInput("אלרגיות", "allergies", "אם אין — להשאיר ריק")}</div>
                  </div>
                </section>
                <section className="space-y-3">
                  <h4 className="text-gray-800 text-[14px] font-bold">פרטי בעלים</h4>
                  <div className="grid grid-cols-2 gap-3">
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
        <TreatmentModal isOpen={Boolean(treatmentPatient)} onClose={() => setTreatmentPatient(null)} patientId={treatmentPatient.id} petName={treatmentPatient.petName} petSpecies={treatmentPatient.petSpecies} ownerName={treatmentPatient.ownerName} onSave={() => { setTreatmentPatient(null); setShowSuccessToast(true); setTimeout(() => setShowSuccessToast(false), 3000); }} />
      )}
    </main>
  );
}
