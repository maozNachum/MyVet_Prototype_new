import { useState, useRef, useCallback, useEffect, type ComponentType } from "react";
import {
  LogOut, Dog, Cat, Calendar, Menu, Home,
  AlertTriangle, Info, FileText, ChevronLeft, ChevronDown,
  Syringe, Stethoscope, Heart, User,
  CalendarPlus, Clock, MapPin, Trash2, CalendarClock, Bell, X,
  Download, Paperclip, Eye,
  Receipt, CheckCircle2, CreditCard, AlertCircle,
  MessageCircle, Send, Video, ExternalLink, ShieldCheck, PlusCircle, Loader2,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Footer } from "../components/Footer";
import { OwnerBookAppointment } from "../components/OwnerBookAppointment";
import { SuccessMessage } from "../components/shared/SuccessMessage";
import { PillPicker } from "../components/shared/PillPicker";
import { ModalOverlay, ModalHeader } from "../components/shared/ModalOverlay";
import { AVAILABLE_DATE_STRINGS, AVAILABLE_TIMES } from "../data/calendar-constants";
import { exportOwnerMedicalRecord } from "../hooks/useExportOwnerRecord";
import { MyVetLogo } from "../components/MyVetLogo";
import { ClientPortalAssistant } from "../components/ai/PageAssistants";
import { ClientMedicalReports } from "../components/ClientMedicalReports";
import { VaccinationBook } from "../components/VaccinationBook";
import { supabase } from "../../services/supabaseClient";
import { clearStaffSession } from "../data/staffAuth";
import { ensureNoAppointmentConflict } from "../data/AppointmentStore";
import { toast } from "sonner";
import {
  defaultActionViewForType,
  extractViewFromActionUrl,
  markAllPortalNotificationsRead,
  markPortalNotificationRead,
  portalActionLabelForType,
} from "../../services/portalNotifications";

// ─── Assets ──────────────────────────────────────────────────────────
const dogImg = "https://images.unsplash.com/photo-1609348490161-a879e4327ae9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb2xkZW4lMjByZXRyaWV2ZXIlMjBkb2clMjBoYXBweSUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MjM3NDQxMXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";
const catImg = "https://images.unsplash.com/photo-1767446516607-02cb627b342f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjdXRlJTIwY2F0JTIwcG9ydHJhaXQlMjBjbG9zZSUyMHVwfGVufDF8fHx8MTc3MjM5MzMzMHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

// ─── Types ───────────────────────────────────────────────────────────
interface PortalNotification {
  id: number;
  source: "notification" | "reminder";
  sourceId: number;
  petName: string;
  petType: "dog" | "cat" | "other";
  petImage: string;
  title: string;
  text: string;
  type: "warning" | "info" | "success" | "payment" | "appointment" | "medical" | "lab" | "document" | "digital";
  date: string;
  isRead?: boolean;
  actionUrl?: string | null;
  createdAt?: string | null;
}

interface Pet {
  id: number; name: string; type: "dog" | "cat" | "other"; image: string;
  breed: string; age: string | number; gender: string; weight: string;
  lastVisit: string; nextVaccine: string;
  medicalHistory: { id: number; date: string; title: string; vet: string; icon: typeof Syringe; color: string }[];
}

interface FutureAppointment {
  id: number; petName: string; petType: "dog" | "cat" | "other"; petImage: string;
  date: string; time: string; type: string; vet: string; room: string; notes: string;
}

interface DigitalConversation {
  id: number;
  ownerId: string;
  petId: number | null;
  petName: string;
  subject: string;
  status: "open" | "waiting_owner" | "waiting_staff" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  lastMessageAt: string;
  createdAt: string;
  unreadForOwner: number;
}

interface DigitalMessage {
  id: number;
  conversationId: number;
  senderType: "owner" | "staff" | "system";
  senderName: string;
  text: string;
  messageType: "text" | "file" | "image" | "video_link" | "system";
  createdAt: string;
}

interface ChatAttachmentSummary {
  id: number;
  messageId: number | null;
  conversationId: number;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  fileSize: number | null;
  uploadedAt: string;
}

const DIGITAL_STATUS_LABELS: Record<DigitalConversation["status"], string> = {
  open: "פתוחה",
  waiting_owner: "ממתין לתגובה שלכם",
  waiting_staff: "ממתין לצוות",
  closed: "נסגרה",
};

const DIGITAL_PRIORITY_LABELS: Record<DigitalConversation["priority"], string> = {
  low: "רגילה",
  normal: "רגילה",
  high: "דחופה",
  urgent: "דחופה",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getSafeFileExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "bin";
  const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 10);
  return safeExt || "bin";
}

function sanitizeStorageFileName(fileName: string) {
  const ext = getSafeFileExtension(fileName);
  const baseName = fileName.includes(".")
    ? fileName.split(".").slice(0, -1).join(".")
    : fileName;

  const safeBaseName = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "document";

  return `${safeBaseName}.${ext}`;
}

function getStorageContentType(file: File) {
  return file.type || "application/octet-stream";
}

interface OwnerProfile {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

function getOwnerDisplayName(owner: OwnerProfile | null) {
  if (!owner) return "בעלים";
  const fullName = `${owner.owner_first_name || ""} ${owner.owner_last_name || ""}`.trim();
  return fullName || owner.owner_id || "בעלים";
}

function getSpeciesType(species?: string | null): "dog" | "cat" | "other" {
  if (species === "dog" || species === "כלב") return "dog";
  if (species === "cat" || species === "חתול") return "cat";
  return "other";
}

function getSpeciesImage(type: "dog" | "cat" | "other") {
  if (type === "cat") return catImg;
  return dogImg;
}

function calculateAgeFromBirthDate(birthDate?: string | null) {
  if (!birthDate) return "לא מוגדר";

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "לא מוגדר";

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  if (age <= 0) return "פחות משנה";
  return age;
}

function formatPortalDate(value?: string | null) {
  if (!value) return "טרם נקבע";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "טרם נקבע";
  return date.toLocaleDateString("he-IL");
}

function formatPortalTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function extractFirstUrl(text?: string | null) {
  return text?.match(/https?:\/\/\S+/)?.[0]?.replace(/[)\]}>.,;]+$/, "") || null;
}

function findLatestMeetUrl(messages: DigitalMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const url = extractFirstUrl(messages[i].text);
    if (url && /^https:\/\/meet\.google\.com\//i.test(url)) return url;
  }
  return null;
}

// ─── Visit Summaries per pet ──────────────────────────────────────────
interface VisitSummary {
  id: number;
  date: string;
  title: string;
  status: "paid" | "unpaid";
  amount: number;
  paymentId?: number;
}

interface PaymentSummary {
  id: number;
  petId: number | null;
  visitId: number | null;
  appointmentId: number | null;
  title: string;
  amount: number;
  status: "unpaid" | "paid" | "partial" | "cancelled" | "refunded";
  method?: string | null;
  date: string;
  dueDate?: string;
  notes?: string | null;
}

function getPaymentStatusLabel(status: PaymentSummary["status"]) {
  if (status === "paid") return "שולם";
  if (status === "partial") return "שולם חלקית";
  if (status === "cancelled") return "בוטל";
  if (status === "refunded") return "זוכה";
  return "לתשלום";
}

function isOpenPayment(status: PaymentSummary["status"]) {
  return status === "unpaid" || status === "partial";
}

// Visit summaries are loaded from Supabase medical_visits.

// ─── Notification style mapping ──────────────────────────────────────
const NOTIF_STYLE = {
  warning: { border: "border-r-orange-400", bg: "bg-orange-50", iconColor: "text-orange-500", Icon: AlertTriangle },
  info:    { border: "border-r-blue-400",   bg: "bg-blue-50",   iconColor: "text-blue-500",   Icon: Info },
  success: { border: "border-r-emerald-400", bg: "bg-emerald-50", iconColor: "text-emerald-500", Icon: FileText },
  payment: { border: "border-r-emerald-400", bg: "bg-emerald-50", iconColor: "text-emerald-600", Icon: CreditCard },
  appointment: { border: "border-r-indigo-400", bg: "bg-indigo-50", iconColor: "text-indigo-500", Icon: CalendarClock },
  medical: { border: "border-r-blue-400", bg: "bg-blue-50", iconColor: "text-blue-500", Icon: Stethoscope },
  lab: { border: "border-r-purple-400", bg: "bg-purple-50", iconColor: "text-purple-500", Icon: FileText },
  document: { border: "border-r-violet-400", bg: "bg-violet-50", iconColor: "text-violet-600", Icon: Paperclip },
  digital: { border: "border-r-blue-400", bg: "bg-blue-50", iconColor: "text-[#1e40af]", Icon: MessageCircle },
} as const;

// ─── PillPicker data ─────────────────────────────────────────────────
const datePills = AVAILABLE_DATE_STRINGS.map((d) => ({ key: d.value, label: d.label }));
const timePills = AVAILABLE_TIMES.map((t) => ({ key: t, label: t }));

type PortalView = "home" | "appointments" | "digital" | "pets" | "payments" | "notifications" | "profile";

const PORTAL_NAV_ITEMS: Array<{ key: PortalView; label: string; description: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "home", label: "בית", description: "מה חשוב עכשיו", icon: Home },
  { key: "appointments", label: "תורים", description: "קביעה, הזזה וביטול", icon: CalendarClock },
  { key: "digital", label: "מרפאה דיגיטלית", description: "פניות, הודעות ווידאו", icon: MessageCircle },
  { key: "pets", label: "החיות שלי", description: "תיקים רפואיים וסיכומי ביקור", icon: Heart },
  { key: "payments", label: "תשלומים", description: "חיובים פתוחים והיסטוריה", icon: Receipt },
  { key: "notifications", label: "עדכונים", description: "התראות ותזכורות", icon: Bell },
  { key: "profile", label: "תיק אישי", description: "פרטים אישיים", icon: User },
];

const PORTAL_MOBILE_NAV_KEYS: PortalView[] = ["home", "appointments", "digital", "pets", "payments"];

function portalViewLabel(view: PortalView) {
  return PORTAL_NAV_ITEMS.find((item) => item.key === view)?.label || "בית";
}

function isPortalView(value: string | null): value is PortalView {
  return Boolean(value) && ["home", "appointments", "digital", "pets", "payments", "notifications", "profile"].includes(value as PortalView);
}

function portalViewFromUrl(value: string | null): PortalView {
  if (value === "documents") return "digital";
  return isPortalView(value) ? value : "home";
}

// ─── Component ───────────────────────────────────────────────────────
export function ClientPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const ownerIdFromUrl = searchParams.get("owner_id") || searchParams.get("ownerId") || "";
  const isStaffPreview = location.pathname === "/owner-preview";

  const [expandedPet, setExpandedPet] = useState<number | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [activePortalView, setActivePortalView] = useState<PortalView>(() => {
    return portalViewFromUrl(searchParams.get("view"));
  });
  const [isPortalMenuOpen, setIsPortalMenuOpen] = useState(false);

  // Section accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    appointments: true, // שיניתי לברירת מחדל פתוח שיהיה קל לראות את התורים מה-Store
    pets: true,
    digital: true,
  });
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const goToPortalView = useCallback((view: PortalView) => {
    setActivePortalView(view);
    setIsPortalMenuOpen(false);
    setOpenSections((prev) => ({
      ...prev,
      appointments: view === "home" || view === "appointments" ? true : prev.appointments,
      digital: view === "digital" ? true : prev.digital,
      pets: view === "pets" ? true : prev.pets,
    }));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const handlePortalLogout = useCallback(async () => {
    if (isStaffPreview) {
      navigate("/clients", { replace: true });
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Failed to sign out from owner portal", error);
      toast.error("לא הצלחנו להתנתק כרגע. נסו שוב.");
      return;
    }

    clearStaffSession();
    navigate("/login", { replace: true });
  }, [isStaffPreview, navigate]);

  const blockStaffPreviewMutation = useCallback(() => {
    if (!isStaffPreview) return false;
    toast.info("תצוגת הצוות היא לקריאה בלבד. לביצוע פעולה חזרו למערכת המרפאה.");
    return true;
  }, [isStaffPreview]);

  const openOwnerBooking = useCallback(() => {
    if (blockStaffPreviewMutation()) return;
    setIsBookingOpen(true);
  }, [blockStaffPreviewMutation]);

  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointments, setAppointments] = useState<FutureAppointment[]>([]);
  const [portalNotifications, setPortalNotifications] = useState<PortalNotification[]>([]);
  const [visitSummariesByPet, setVisitSummariesByPet] = useState<Record<number, VisitSummary[]>>({});
  const [paymentsByPet, setPaymentsByPet] = useState<Record<number, PaymentSummary[]>>({});
  const [payingPaymentId, setPayingPaymentId] = useState<number | null>(null);
  const [paymentToPay, setPaymentToPay] = useState<PaymentSummary | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(true);
  const [portalError, setPortalError] = useState<string | null>(null);
  const ownerDisplayName = getOwnerDisplayName(ownerProfile);

  useEffect(() => {
    const viewFromUrl = searchParams.get("view");
    setActivePortalView(portalViewFromUrl(viewFromUrl));
  }, [searchParams]);

  const [rescheduleAppt, setRescheduleAppt] = useState<FutureAppointment | null>(null);
  const [cancelAppt, setCancelAppt] = useState<FutureAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  // Digital clinic / owner communication state
  const [digitalConversations, setDigitalConversations] = useState<DigitalConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [digitalMessages, setDigitalMessages] = useState<DigitalMessage[]>([]);
  const [digitalAttachments, setDigitalAttachments] = useState<ChatAttachmentSummary[]>([]);
  const [digitalLoading, setDigitalLoading] = useState(false);
  const [digitalError, setDigitalError] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [newConversationSubject, setNewConversationSubject] = useState("");
  const [newConversationText, setNewConversationText] = useState("");
  const [selectedDigitalPetId, setSelectedDigitalPetId] = useState<number | "">("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  const [startingVideo, setStartingVideo] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const refreshPortalData = useCallback(async (ownerIdOverride?: string | null) => {
    setIsPortalLoading(true);
    setPortalError(null);

    const clearPortalData = () => {
      setOwnerProfile(null);
      setPets([]);
      setAppointments([]);
      setPortalNotifications([]);
      setVisitSummariesByPet({});
      setPaymentsByPet({});
      setDigitalConversations([]);
      setDigitalMessages([]);
      setDigitalAttachments([]);
      setSelectedConversationId(null);
    };

    try {
      const requestedOwnerId = (ownerIdOverride ?? ownerIdFromUrl).trim();
      const ownerSelect = "owner_id, owner_first_name, owner_last_name, phone, email, address, auth_user_id";
      let ownerData: (OwnerProfile & { auth_user_id?: string | null }) | null = null;

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const authUser = authData.user;
      if (!authUser) {
        clearPortalData();
        setPortalError("לא זוהה משתמש מחובר. התחברו מחדש כדי לפתוח את האזור האישי.");
        return;
      }

      // תצוגת צוות היא נתיב נפרד: רק עובד פעיל יכול לפתוח כרטיס בעלים לפי מזהה.
      if (isStaffPreview) {
        if (!requestedOwnerId) {
          clearPortalData();
          setPortalError("לא נבחר לקוח לתצוגה מקדימה.");
          return;
        }

        const { data: staffData, error: staffError } = await supabase
          .from("staff")
          .select("staff_id")
          .eq("auth_user_id", authUser.id)
          .eq("is_active", true)
          .maybeSingle();

        if (staffError) throw staffError;
        if (!staffData) {
          clearPortalData();
          setPortalError("אין לחשבון הזה הרשאת צוות לפתיחת תצוגת לקוח.");
          return;
        }

        const { data, error } = await supabase
          .from("owners")
          .select(ownerSelect)
          .eq("owner_id", requestedOwnerId)
          .maybeSingle();

        if (error) throw error;
        ownerData = data;

        if (!ownerData) {
          clearPortalData();
          setPortalError("כרטיס הלקוח שביקשתם אינו קיים.");
          return;
        }
      // owner_id בפורטל הלקוח הוא רק קיצור ניווט, ולעולם אינו עוקף את זהות המשתמש המחובר.
      } else if (requestedOwnerId) {
        const { data, error } = await supabase
          .from("owners")
          .select(ownerSelect)
          .eq("owner_id", requestedOwnerId)
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (error) throw error;
        ownerData = data;

        if (!ownerData) {
          clearPortalData();
          setPortalError("הקישור לאזור האישי אינו שייך לחשבון המחובר. התחברו לחשבון המתאים או פנו למרפאה.");
          return;
        }
      } else {
        const { data: ownerByAuth, error: ownerByAuthError } = await supabase
          .from("owners")
          .select(ownerSelect)
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (ownerByAuthError) throw ownerByAuthError;
        ownerData = ownerByAuth;

        // קישור מאובטח מתבצע בשרת לפי האימייל המאומת שב-JWT. הדפדפן אינו
        // מקבל הרשאה לחפש רשומות לקוח לפי כתובת אימייל.
        if (!ownerData && authUser.email) {
          const { data: claimedOwnerId, error: claimOwnerError } = await supabase.rpc("claim_owner_profile");
          if (claimOwnerError) {
            console.warn("Owner profile could not be linked securely:", claimOwnerError.code);
          } else if (claimedOwnerId) {
            const { data: claimedOwner, error: claimedOwnerError } = await supabase
              .from("owners")
              .select(ownerSelect)
              .eq("auth_user_id", authUser.id)
              .maybeSingle();
            if (claimedOwnerError) throw claimedOwnerError;
            ownerData = claimedOwner;
          }
        }

        if (!ownerData) {
          clearPortalData();
          setPortalError("התחברת בהצלחה, אבל לא נמצא כרטיס בעלים שמחובר לחשבון הזה. בדקו שבטבלת owners קיימת שורה עם אותו אימייל או עם auth_user_id מתאים.");
          return;
        }
      }

      setOwnerProfile(ownerData);

      const { data: patientRows, error: patientError } = await supabase
        .from("patients")
        .select("pet_id, pet_name, species, breed, gender, birth_date, microchip, allergies, weight, owner_id, created_at")
        .eq("owner_id", ownerData.owner_id)
        .order("created_at", { ascending: false });

      if (patientError) throw patientError;

      const mappedPetsBase: Pet[] = (patientRows || []).map((row: any) => {
        const petType = getSpeciesType(row.species);

        return {
          id: row.pet_id,
          name: row.pet_name || "ללא שם",
          type: petType,
          image: getSpeciesImage(petType),
          breed: row.breed || "לא מוגדר",
          age: calculateAgeFromBirthDate(row.birth_date),
          gender: row.gender || "לא ידוע",
          weight: row.weight !== null && row.weight !== undefined ? `${row.weight} ק״ג` : "לא נשקל",
          lastVisit: "טרם נקבע",
          nextVaccine: "טרם נקבע",
          medicalHistory: [],
        };
      });

      const petIds = mappedPetsBase.map((pet) => pet.id);

      let visitRows: any[] = [];
      if (petIds.length > 0) {
        const { data, error: visitsError } = await supabase
          .from("medical_visits")
          .select("visit_id, pet_id, visit_date, vet_name, reason, diagnosis, treatment, notes")
          .in("pet_id", petIds)
          .order("visit_date", { ascending: false });

        if (visitsError) throw visitsError;
        visitRows = data || [];
      }

      let paymentRows: any[] = [];
      if (petIds.length > 0) {
        const { data, error: paymentsError } = await supabase
          .from("payments")
          .select("payment_id, owner_id, pet_id, visit_id, appointment_id, amount, status, payment_method, paid_at, due_date, notes, created_at")
          .eq("owner_id", ownerData.owner_id)
          .order("created_at", { ascending: false });

        if (paymentsError) throw paymentsError;
        paymentRows = data || [];
      }

      const visitPetById = new Map<number, number>();
      visitRows.forEach((row: any) => {
        if (row.visit_id !== null && row.visit_id !== undefined && row.pet_id !== null && row.pet_id !== undefined) {
          visitPetById.set(Number(row.visit_id), Number(row.pet_id));
        }
      });

      const paymentsByVisitId = new Map<number, any>();
      paymentRows.forEach((row: any) => {
        if (row.visit_id !== null && row.visit_id !== undefined) {
          paymentsByVisitId.set(Number(row.visit_id), row);
        }
      });

      const paymentSummariesByPet: Record<number, PaymentSummary[]> = Object.fromEntries(
        petIds.map((petId) => [petId, []])
      );

      paymentRows.forEach((row: any) => {
        const petId = row.pet_id !== null && row.pet_id !== undefined
          ? Number(row.pet_id)
          : row.visit_id !== null && row.visit_id !== undefined
            ? visitPetById.get(Number(row.visit_id)) || null
            : null;

        if (!petId || !petIds.includes(petId)) return;

        paymentSummariesByPet[petId] = [
          ...(paymentSummariesByPet[petId] || []),
          {
            id: Number(row.payment_id),
            petId,
            visitId: row.visit_id !== null && row.visit_id !== undefined ? Number(row.visit_id) : null,
            appointmentId: row.appointment_id !== null && row.appointment_id !== undefined ? Number(row.appointment_id) : null,
            title: row.notes || `חיוב #${row.payment_id}`,
            amount: Number(row.amount || 0),
            status: (row.status || "unpaid") as PaymentSummary["status"],
            method: row.payment_method || null,
            date: formatPortalDate(row.paid_at || row.created_at),
            dueDate: row.due_date ? formatPortalDate(row.due_date) : undefined,
            notes: row.notes || null,
          },
        ];
      });

      const summariesByPet: Record<number, VisitSummary[]> = Object.fromEntries(
        petIds.map((petId) => [petId, []])
      );

      const historyByPet = new Map<number, Pet["medicalHistory"]>();
      petIds.forEach((petId) => historyByPet.set(petId, []));

      visitRows.forEach((row: any) => {
        const petId = Number(row.pet_id);
        const title = row.reason || row.diagnosis || row.treatment || "ביקור רפואי";
        const date = formatPortalDate(row.visit_date);
        const vet = row.vet_name || "לא צוין רופא";

        const payment = paymentsByVisitId.get(Number(row.visit_id));
        const paymentStatus = payment && payment.status !== "paid" ? "unpaid" : "paid";

        summariesByPet[petId] = [
          ...(summariesByPet[petId] || []),
          {
            id: row.visit_id,
            date,
            title,
            status: paymentStatus,
            amount: payment ? Number(payment.amount || 0) : 0,
            paymentId: payment ? Number(payment.payment_id) : undefined,
          },
        ];

        historyByPet.set(petId, [
          ...(historyByPet.get(petId) || []),
          {
            id: row.visit_id,
            date,
            title,
            vet,
            icon: Stethoscope,
            color: "bg-blue-50 text-blue-600 border-blue-200",
          },
        ]);
      });

      const mappedPets = mappedPetsBase.map((pet) => ({
        ...pet,
        lastVisit: summariesByPet[pet.id]?.[0]?.date || "טרם נקבע",
        medicalHistory: historyByPet.get(pet.id) || [],
      }));

      setVisitSummariesByPet(summariesByPet);
      setPaymentsByPet(paymentSummariesByPet);
      setPets(mappedPets);
      let mappedAppointments: FutureAppointment[] = [];
      const petById = new Map(mappedPets.map((pet) => [pet.id, pet]));

      if (petIds.length > 0) {
        const { data: appointmentRows, error: appointmentsError } = await supabase
          .from("appointments")
          .select("appointment_id, pet_id, start_time, end_time, department, vet_name, room, appointment_type, color, notes")
          .in("pet_id", petIds)
          .gte("start_time", new Date().toISOString())
          .order("start_time", { ascending: true });

        if (appointmentsError) throw appointmentsError;

        mappedAppointments = (appointmentRows || []).map((row: any) => {
          const pet = petById.get(row.pet_id);
          const petType = pet?.type || "other";

          return {
            id: row.appointment_id,
            petName: pet?.name || "חיה לא מזוהה",
            petType,
            petImage: getSpeciesImage(petType),
            date: formatPortalDate(row.start_time),
            time: formatPortalTime(row.start_time),
            type: row.appointment_type || "ביקור",
            vet: row.vet_name || "טרם שובץ",
            room: row.room || "—",
            notes: row.notes || "",
          };
        });
      }

      setAppointments(mappedAppointments);

      const { data: notificationRows, error: notificationsError } = await supabase
        .from("notifications")
        .select("notification_id, owner_id, pet_id, title, message, type, is_read, read_at, action_url, created_at")
        .eq("owner_id", ownerData.owner_id)
        .in("target", ["owner", "both"])
        .order("created_at", { ascending: false });

      if (notificationsError) throw notificationsError;

      const { data: reminderRows, error: remindersError } = await supabase
        .from("reminders")
        .select("reminder_id, owner_id, pet_id, title, message, reminder_type, due_at, status, is_read, read_at, action_url")
        .eq("owner_id", ownerData.owner_id)
        .in("status", ["open", "sent", "pending"])
        .order("due_at", { ascending: true });

      if (remindersError) throw remindersError;

      const mappedNotifications: PortalNotification[] = (notificationRows || []).map((row: any) => {
        const pet = row.pet_id ? petById.get(Number(row.pet_id)) : undefined;
        const petType = pet?.type || "other";
        return {
          id: Number(row.notification_id),
          source: "notification",
          sourceId: Number(row.notification_id),
          petName: pet?.name || "כללי",
          petType,
          petImage: getSpeciesImage(petType),
          title: row.title || "התראה",
          text: row.message || "",
          type: (row.type === "medical_summary" ? "medical" : row.type || "info") as PortalNotification["type"],
          date: formatPortalDate(row.created_at),
          isRead: Boolean(row.is_read || row.read_at),
          actionUrl: row.action_url || null,
          createdAt: row.created_at || null,
        };
      });

      const mappedReminders: PortalNotification[] = (reminderRows || []).map((row: any) => {
        const pet = row.pet_id ? petById.get(Number(row.pet_id)) : undefined;
        const petType = pet?.type || "other";
        return {
          id: Number(row.reminder_id) + 1000000,
          source: "reminder",
          sourceId: Number(row.reminder_id),
          petName: pet?.name || "כללי",
          petType,
          petImage: getSpeciesImage(petType),
          title: row.title || "תזכורת",
          text: row.message || "",
          type: (row.reminder_type === "payment" ? "payment" : row.reminder_type === "appointment" ? "appointment" : row.reminder_type === "lab_result" ? "lab" : row.reminder_type === "follow_up" ? "medical" : "warning") as PortalNotification["type"],
          date: formatPortalDate(row.due_at),
          isRead: Boolean(row.is_read || row.read_at || row.status === "sent"),
          actionUrl: row.action_url || null,
          createdAt: row.due_at || null,
        };
      });

      setPortalNotifications(
        [...mappedNotifications, ...mappedReminders].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })
      );
    } catch (error) {
      console.error("Error loading owner portal from Supabase:", error);
      setOwnerProfile(null);
      setPets([]);
      setAppointments([]);
      setPortalNotifications([]);
      setVisitSummariesByPet({});
      setPaymentsByPet({});
      setDigitalConversations([]);
      setDigitalMessages([]);
      setDigitalAttachments([]);
      setSelectedConversationId(null);
      setPortalError("לא הצלחנו לטעון את האזור האישי. נסה לרענן את הדף או פנה למרפאה.");
    } finally {
      setIsPortalLoading(false);
    }
  }, [isStaffPreview, ownerIdFromUrl]);

  useEffect(() => {
    refreshPortalData(ownerIdFromUrl);
  }, [ownerIdFromUrl, refreshPortalData]);

  const selectedDigitalConversation = digitalConversations.find((conv) => conv.id === selectedConversationId) || null;

  const loadDigitalConversations = useCallback(async (ownerId: string) => {
    if (!ownerId) return;

    try {
      setDigitalLoading(true);
      setDigitalError(null);

      const { data: conversationRows, error: conversationError } = await supabase
        .from("conversations")
        .select("conversation_id, owner_id, pet_id, subject, status, priority, last_message_at, created_at, updated_at")
        .eq("owner_id", ownerId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (conversationError) throw conversationError;

      const ids = (conversationRows || []).map((row: any) => Number(row.conversation_id));
      let unreadByConversation = new Map<number, number>();

      if (ids.length > 0) {
        const { data: messageRows, error: messageError } = await supabase
          .from("messages")
          .select("conversation_id, is_read_by_owner, sender_type")
          .in("conversation_id", ids)
          .eq("is_read_by_owner", false);

        if (messageError) throw messageError;

        (messageRows || []).forEach((row: any) => {
          if (row.sender_type === "owner") return;
          const conversationId = Number(row.conversation_id);
          unreadByConversation.set(conversationId, (unreadByConversation.get(conversationId) || 0) + 1);
        });
      }

      const petNameById = new Map(pets.map((pet) => [pet.id, pet.name]));
      const mapped: DigitalConversation[] = (conversationRows || []).map((row: any) => {
        const petId = row.pet_id !== null && row.pet_id !== undefined ? Number(row.pet_id) : null;
        return {
          id: Number(row.conversation_id),
          ownerId: row.owner_id,
          petId,
          petName: petId ? petNameById.get(petId) || "חיה לא מזוהה" : "כללי",
          subject: row.subject || "פנייה כללית",
          status: (row.status || "open") as DigitalConversation["status"],
          priority: (row.priority || "normal") as DigitalConversation["priority"],
          lastMessageAt: row.last_message_at || row.updated_at || row.created_at,
          createdAt: row.created_at,
          unreadForOwner: unreadByConversation.get(Number(row.conversation_id)) || 0,
        };
      });

      setDigitalConversations(mapped);
      setSelectedConversationId((current) => {
        if (current && mapped.some((conv) => conv.id === current)) return current;
        return mapped[0]?.id || null;
      });
    } catch (error) {
      console.error("Failed to load digital conversations", error);
      setDigitalError("לא הצלחנו לטעון את השיחות הדיגיטליות. נסה שוב בעוד רגע.");
    } finally {
      setDigitalLoading(false);
    }
  }, [pets]);

  const loadDigitalMessages = useCallback(async (conversationId: number | null) => {
    if (!conversationId) {
      setDigitalMessages([]);
      setDigitalAttachments([]);
      return;
    }

    try {
      setDigitalError(null);

      const { data: rows, error } = await supabase
        .from("messages")
        .select("message_id, conversation_id, sender_type, sender_name, message_text, message_type, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const messages: DigitalMessage[] = (rows || []).map((row: any) => ({
        id: Number(row.message_id),
        conversationId: Number(row.conversation_id),
        senderType: (row.sender_type || "system") as DigitalMessage["senderType"],
        senderName: row.sender_name || (row.sender_type === "owner" ? ownerDisplayName : "צוות המרפאה"),
        text: row.message_text || "",
        messageType: (row.message_type || "text") as DigitalMessage["messageType"],
        createdAt: row.created_at,
      }));

      setDigitalMessages(messages);

      const { data: attachmentRows, error: attachmentError } = await supabase
        .from("message_attachments")
        .select("attachment_id, message_id, conversation_id, file_name, file_path, mime_type, file_size, uploaded_at")
        .eq("conversation_id", conversationId)
        .order("uploaded_at", { ascending: true });

      if (attachmentError) throw attachmentError;

      setDigitalAttachments((attachmentRows || []).map((row: any) => ({
        id: Number(row.attachment_id),
        messageId: row.message_id !== null && row.message_id !== undefined ? Number(row.message_id) : null,
        conversationId: Number(row.conversation_id),
        fileName: row.file_name || "קובץ",
        filePath: row.file_path,
        mimeType: row.mime_type || null,
        fileSize: row.file_size !== null && row.file_size !== undefined ? Number(row.file_size) : null,
        uploadedAt: row.uploaded_at,
      })));

      if (!isStaffPreview) {
        const { error: markOwnerReadError } = await supabase
          .from("messages")
          .update({ is_read_by_owner: true })
          .eq("conversation_id", conversationId)
          .neq("sender_type", "owner");
        if (markOwnerReadError) console.error("Failed marking owner messages as read", markOwnerReadError);
      }
    } catch (error) {
      console.error("Failed to load digital messages", error);
      setDigitalError("לא הצלחנו לטעון את הודעות השיחה.");
    }
  }, [isStaffPreview, ownerDisplayName]);

  useEffect(() => {
    if (ownerProfile?.owner_id) {
      void loadDigitalConversations(ownerProfile.owner_id);
    }
  }, [ownerProfile?.owner_id, pets, loadDigitalConversations]);

  useEffect(() => {
    void loadDigitalMessages(selectedConversationId);
  }, [selectedConversationId, loadDigitalMessages]);

  useEffect(() => {
    const container = chatMessagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [digitalMessages.length, selectedConversationId]);

  const handleCreateConversation = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!ownerProfile?.owner_id) return;
    if (!newConversationSubject.trim()) {
      toast.error("כתבו נושא קצר לפנייה.");
      return;
    }

    let createdConversationId: number | null = null;
    try {
      setCreatingConversation(true);
      const now = new Date().toISOString();
      const petId = selectedDigitalPetId === "" ? null : Number(selectedDigitalPetId);

      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          owner_id: ownerProfile.owner_id,
          pet_id: petId,
          subject: newConversationSubject.trim(),
          status: "waiting_staff",
          priority: "normal",
          last_message_at: now,
          updated_at: now,
        })
        .select("conversation_id")
        .single();

      if (error) throw error;

      const conversationId = Number(conversation.conversation_id);
      createdConversationId = conversationId;
      const openingText = newConversationText.trim() || `שלום, אשמח להתייעץ לגבי: ${newConversationSubject.trim()}`;

      const { error: messageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_type: "owner",
          sender_owner_id: ownerProfile.owner_id,
          sender_name: ownerDisplayName,
          message_text: openingText,
          message_type: "text",
          is_read_by_owner: true,
          is_read_by_staff: false,
        });

      if (messageError) throw messageError;

      setNewConversationSubject("");
      setNewConversationText("");
      setSelectedDigitalPetId("");
      setSelectedConversationId(conversationId);
      await loadDigitalConversations(ownerProfile.owner_id);
      await loadDigitalMessages(conversationId);
    } catch (error) {
      if (createdConversationId) {
        await supabase.from("messages").delete().eq("conversation_id", createdConversationId);
        await supabase.from("conversations").delete().eq("conversation_id", createdConversationId);
      }
      console.error("Failed to create conversation", error);
      toast.error("לא הצלחנו לפתוח פנייה חדשה. נסה שוב בעוד רגע.");
    } finally {
      setCreatingConversation(false);
    }
  };

  const handleSendOwnerMessage = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!ownerProfile?.owner_id || !selectedConversationId) return;
    if (!messageInput.trim()) {
      toast.error("כתבו הודעה לפני השליחה.");
      return;
    }

    let createdMessageId: number | null = null;
    try {
      setSendingMessage(true);
      const now = new Date().toISOString();

      const { data: createdMessage, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversationId,
          sender_type: "owner",
          sender_owner_id: ownerProfile.owner_id,
          sender_name: ownerDisplayName,
          message_text: messageInput.trim(),
          message_type: "text",
          is_read_by_owner: true,
          is_read_by_staff: false,
        })
        .select("message_id")
        .single();

      if (error) throw error;
      createdMessageId = Number(createdMessage.message_id);

      const { error: conversationUpdateError } = await supabase
        .from("conversations")
        .update({ status: "waiting_staff", closed_at: null, last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversationId);
      if (conversationUpdateError) throw conversationUpdateError;

      setMessageInput("");
      await loadDigitalMessages(selectedConversationId);
      if (ownerProfile?.owner_id) await loadDigitalConversations(ownerProfile.owner_id);
    } catch (error) {
      if (createdMessageId) await supabase.from("messages").delete().eq("message_id", createdMessageId);
      console.error("Failed to send message", error);
      toast.error("לא הצלחנו לשלוח את ההודעה.");
    } finally {
      setSendingMessage(false);
    }
  };

  const buildSafeChatAttachmentPath = (conversationId: number, file: File) => {
    const safeName = sanitizeStorageFileName(file.name);
    const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${ownerProfile?.owner_id || "owner"}/${conversationId}/${Date.now()}-${unique}-${safeName}`;
  };

  const handleChatFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (blockStaffPreviewMutation()) return;
    if (!file || !ownerProfile?.owner_id || !selectedConversationId) return;

    let uploadedFilePath: string | null = null;
    let createdAttachmentMessageId: number | null = null;
    try {
      setUploadingChatFile(true);
      const now = new Date().toISOString();
      const filePath = buildSafeChatAttachmentPath(selectedConversationId, file);

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(filePath, file, { contentType: getStorageContentType(file), upsert: false });

      if (uploadError) throw uploadError;
      uploadedFilePath = filePath;

      const isImage = file.type.startsWith("image/");
      const { data: messageData, error: messageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversationId,
          sender_type: "owner",
          sender_owner_id: ownerProfile.owner_id,
          sender_name: ownerDisplayName,
          message_text: `צורף קובץ: ${file.name}`,
          message_type: isImage ? "image" : "file",
          is_read_by_owner: true,
          is_read_by_staff: false,
        })
        .select("message_id")
        .single();

      if (messageError) throw messageError;
      createdAttachmentMessageId = Number(messageData.message_id);

      const { error: attachmentError } = await supabase
        .from("message_attachments")
        .insert({
          message_id: Number(messageData.message_id),
          conversation_id: selectedConversationId,
          owner_id: ownerProfile.owner_id,
          pet_id: selectedDigitalConversation?.petId || null,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          uploaded_by_type: "owner",
        });

      if (attachmentError) throw attachmentError;

      const { error: conversationUpdateError } = await supabase
        .from("conversations")
        .update({ status: "waiting_staff", closed_at: null, last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversationId);
      if (conversationUpdateError) throw conversationUpdateError;

      await loadDigitalMessages(selectedConversationId);
      await loadDigitalConversations(ownerProfile.owner_id);
    } catch (error) {
      if (createdAttachmentMessageId) {
        await supabase.from("message_attachments").delete().eq("message_id", createdAttachmentMessageId);
        await supabase.from("messages").delete().eq("message_id", createdAttachmentMessageId);
      }
      if (uploadedFilePath) await supabase.storage.from("chat-attachments").remove([uploadedFilePath]);
      console.error("Failed to upload chat attachment", error);
      toast.error("לא הצלחנו להעלות את הקובץ לשיחה. נסה שוב בעוד רגע.");
    } finally {
      setUploadingChatFile(false);
    }
  };

  const openChatAttachment = async (attachment: ChatAttachmentSummary) => {
    const popup = window.open("", "_blank");
    try {
      const { data, error } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(attachment.filePath, 60 * 10);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("SIGNED_URL_MISSING");
      if (popup) {
        popup.opener = null;
        popup.location.href = data.signedUrl;
      } else {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      popup?.close();
      console.error("Failed to open chat attachment", error);
      toast.error("לא הצלחנו לפתוח את הקובץ.");
    }
  };

  const handleStartVideoSession = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!ownerProfile?.owner_id || !selectedConversationId) return;

    const existingMeetUrl = findLatestMeetUrl(digitalMessages);
    if (existingMeetUrl) {
      window.open(existingMeetUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const popup = window.open("", "_blank");

    try {
      setStartingVideo(true);
      const now = new Date().toISOString();

      const { data: existingSessions, error: existingError } = await supabase
        .from("video_sessions")
        .select("session_id, meeting_url, status")
        .eq("conversation_id", selectedConversationId)
        .not("status", "in", '(completed,cancelled)')
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingError) throw existingError;

      const existingSession = existingSessions?.[0];
      if (existingSession?.meeting_url) {
        if (popup) {
          popup.opener = null;
          popup.location.href = existingSession.meeting_url;
        } else {
          window.open(existingSession.meeting_url, "_blank", "noopener,noreferrer");
        }
        return;
      }

      if (!existingSession) {
        const { error: sessionError } = await supabase
          .from("video_sessions")
          .insert({
            conversation_id: selectedConversationId,
            owner_id: ownerProfile.owner_id,
            pet_id: selectedDigitalConversation?.petId || null,
            meeting_url: null,
            status: "scheduled",
            scheduled_at: now,
            notes: "בקשת שיחת Google Meet מפורטל הלקוח",
          });

        if (sessionError) throw sessionError;
      }

      const { error: messageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversationId,
          sender_type: "owner",
          sender_owner_id: ownerProfile.owner_id,
          sender_name: ownerDisplayName,
          message_text: "בעל החיה ביקש שיחת וידאו. צוות המרפאה ייצור קישור Google Meet וישלח אותו כאן.",
          message_type: "system",
          is_read_by_owner: true,
          is_read_by_staff: false,
        });

      if (messageError) throw messageError;

      const { error: conversationUpdateError } = await supabase
        .from("conversations")
        .update({ status: "waiting_staff", closed_at: null, last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversationId);
      if (conversationUpdateError) throw conversationUpdateError;

      await loadDigitalMessages(selectedConversationId);
      await loadDigitalConversations(ownerProfile.owner_id);
      popup?.close();
      toast.success("הבקשה לשיחת וידאו נשלחה לצוות המרפאה.");
    } catch (error) {
      popup?.close();
      console.error("Failed to request video session", error);
      toast.error("לא הצלחנו לשלוח בקשה לשיחת וידאו.");
    } finally {
      setStartingVideo(false);
    }
  };

  // 2. עדכון להזזת תור מול Supabase
  const handleReschedule = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!rescheduleAppt) return;
    if (!rescheduleDate || !rescheduleTime) {
      toast.error("בחרו תאריך ושעה חדשים לפני אישור הזזת התור.");
      return;
    }
    
    // מפענח את התאריך החדש
    const [dayStr, monthStr, yearStr] = rescheduleDate.split("/");
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    try {
      const startTime = new Date(year, month - 1, day, Number(rescheduleTime.split(":")[0]), Number(rescheduleTime.split(":")[1] || 0));
      if (Number.isNaN(startTime.getTime()) || startTime.getTime() <= Date.now()) {
        toast.error("בחרו מועד עתידי ותקין להזזת התור.");
        return;
      }
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);
      await ensureNoAppointmentConflict({
        startDate: startTime,
        endDate: endTime,
        vet: rescheduleAppt.vet,
        room: rescheduleAppt.room,
        mode: rescheduleAppt.room === "דיגיטל" ? "video" : "physical",
        excludeId: rescheduleAppt.id,
      });

      const { error } = await supabase
        .from("appointments")
        .update({
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
        })
        .eq("appointment_id", rescheduleAppt.id);

      if (error) throw error;

      await refreshPortalData();
      setRescheduleSuccess(true);
      setTimeout(() => { 
        setRescheduleSuccess(false); 
        setRescheduleAppt(null); 
        setRescheduleDate(""); 
        setRescheduleTime(""); 
      }, 1800);
    } catch (e) {
      console.error("Failed to reschedule", e);
      toast.error("לא הצלחנו להזיז את התור. נסו שוב או פנו למרפאה.");
    }
  };

  // 3. עדכון לביטול תור מול ה-Store
  const handleCancel = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!cancelAppt) return;
    try {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("appointment_id", cancelAppt.id);

      if (error) throw error;

      await refreshPortalData();
      setCancelSuccess(true);
      setTimeout(() => { 
        setCancelSuccess(false); 
        setCancelAppt(null); 
      }, 1800);
    } catch (e) {
      console.error("Failed to cancel", e);
      toast.error("לא הצלחנו לבטל את התור. נסו שוב או פנו למרפאה.");
    }
  };

  const openDemoPayment = (payment: PaymentSummary) => {
    if (blockStaffPreviewMutation()) return;
    setPaymentSuccess(false);
    setPaymentToPay(payment);
  };

  const openDemoPaymentById = (paymentId?: number) => {
    if (!paymentId) return;

    const payment = Object.values(paymentsByPet)
      .flat()
      .find((item) => item.id === paymentId);

    if (payment) {
      openDemoPayment(payment);
    } else {
      toast.error("לא נמצא חיוב מתאים לתשלום.");
    }
  };

  const handleDemoPaymentConfirm = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!paymentToPay) return;

    setPayingPaymentId(paymentToPay.id);
    // מסך הדגמה בלבד: סטטוס תשלום אמיתי חייב להתעדכן מ-webhook
    // מאומת של ספק סליקה, ולעולם לא ישירות מדפדפן הלקוח.
    setPaymentSuccess(true);
    toast.success("סימולציית התשלום הושלמה. לא בוצע חיוב אמיתי.");
    window.setTimeout(() => {
      setPaymentSuccess(false);
      setPaymentToPay(null);
      setPayingPaymentId(null);
    }, 1800);
  };

  const allPayments = Object.values(paymentsByPet).flat() as PaymentSummary[];
  const openPayments = allPayments.filter((payment) => isOpenPayment(payment.status));
  const openPaymentsTotal = openPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const unreadNotificationsCount = portalNotifications.filter((notification) => !notification.isRead).length;
  const nextAppointment = appointments[0] || null;
  const activeDigitalCount = digitalConversations.filter((conversation) => conversation.status !== "closed").length;
  const latestNotifications = portalNotifications.slice(0, 3);
  const upcomingAppointmentsPreview = appointments.slice(0, 2);
  const latestOpenConversation = digitalConversations.find((conversation) => conversation.status !== "closed") || null;
  const mainPet = pets[0] || null;

  const getNotificationTargetView = (notification: PortalNotification): PortalView => {
    const viewFromUrlRaw = extractViewFromActionUrl(notification.actionUrl);
    if (isPortalView(viewFromUrlRaw)) return viewFromUrlRaw;

    const inferredViewRaw = defaultActionViewForType(notification.type);
    if (isPortalView(inferredViewRaw)) return inferredViewRaw;

    if (notification.type === "document") return "digital";

    return "notifications";
  };

  const markNotificationLocallyRead = (notification: PortalNotification) => {
    setPortalNotifications((current) => current.map((item) => (
      item.source === notification.source && item.sourceId === notification.sourceId
        ? { ...item, isRead: true }
        : item
    )));
  };

  const handleNotificationClick = async (notification: PortalNotification) => {
    try {
      if (!isStaffPreview && !notification.isRead) {
        markNotificationLocallyRead(notification);
        await markPortalNotificationRead(notification.source, notification.sourceId);
      }
    } catch (error) {
      console.error("Failed marking portal notification as read", error);
    }

    goToPortalView(getNotificationTargetView(notification));
  };

  const handleMarkAllNotificationsRead = async () => {
    if (blockStaffPreviewMutation()) return;
    if (!ownerProfile?.owner_id || unreadNotificationsCount === 0) return;

    const previous = portalNotifications;
    setPortalNotifications((current) => current.map((item) => ({ ...item, isRead: true })));

    try {
      await markAllPortalNotificationsRead(ownerProfile.owner_id);
      toast.success("כל העדכונים סומנו כנקראו");
    } catch (error) {
      console.error("Failed marking all portal notifications as read", error);
      setPortalNotifications(previous);
      toast.error("לא הצלחנו לסמן את כל העדכונים כנקראו");
    }
  };

  return (
    <div dir="rtl" className="client-portal min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef4ff_0%,#f7f9fc_42%,#ffffff_100%)] flex flex-col" style={{ fontFamily: "'Heebo', sans-serif" }}>
      
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white/92 backdrop-blur-xl border-b border-blue-100/70 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full max-w-[560px] mx-auto px-4 h-16 grid grid-cols-[48px_1fr_48px] items-center gap-2">
          <button
            onClick={() => setIsPortalMenuOpen(true)}
            className="w-11 h-11 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center cursor-pointer shadow-sm justify-self-start"
            aria-label="פתיחת תפריט"
          >
            <Menu className="w-5 h-5 text-gray-700" />
          </button>

          <button
            type="button"
            onClick={() => goToPortalView("home")}
            className="flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity justify-self-center"
            title="חזרה לבית"
          >
            <MyVetLogo color="#1e40af" showTagline={false} className="h-11 w-auto" />
          </button>

          <button
            onClick={() => goToPortalView("notifications")}
            className="relative w-11 h-11 rounded-2xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer shadow-sm justify-self-end"
            title="עדכונים והתראות"
          >
            <Bell className="w-5 h-5 text-gray-500" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {isStaffPreview && (
        <div className="w-full border-b border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950" role="status">
          <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[13px] font-bold">
              <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" />
              <span>תצוגת צוות לקריאה בלבד — פעולות בשם הלקוח חסומות.</span>
            </div>
            <button type="button" onClick={() => navigate("/clients")} className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-[13px] font-black hover:bg-amber-100">
              חזרה
            </button>
          </div>
        </div>
      )}

      {isPortalMenuOpen && (
        <div className="fixed inset-0 z-[900] bg-black/35" onClick={() => setIsPortalMenuOpen(false)}>
          <aside
            onClick={(event) => event.stopPropagation()}
            className="absolute top-0 right-0 h-full w-[88vw] max-w-[360px] bg-white shadow-2xl border-l border-gray-100 flex flex-col"
          >
            <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <p className="text-gray-900 text-[17px] font-bold">האזור האישי</p>
                <p className="text-gray-500 text-[13px] mt-0.5">{ownerDisplayName}</p>
              </div>
              <button
                onClick={() => setIsPortalMenuOpen(false)}
                className="w-10 h-10 rounded-2xl hover:bg-gray-100 flex items-center justify-center cursor-pointer"
                aria-label="סגירת תפריט"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {PORTAL_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePortalView === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => goToPortalView(item.key)}
                    className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-right transition-all cursor-pointer border ${
                      isActive
                        ? "bg-blue-50 border-blue-200 text-[#1e40af]"
                        : "bg-white border-transparent hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${isActive ? "bg-white text-[#1e40af]" : "bg-gray-50 text-gray-500"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold">{item.label}</p>
                      <p className="text-[13px] opacity-70 truncate">{item.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100">
              <button
                onClick={handlePortalLogout}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 px-4 py-3 text-[14px] font-bold cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> {isStaffPreview ? "חזרה למערכת" : "התנתקות"}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className={`flex-1 mx-auto w-full px-3 pb-28 pt-4 transition-[max-width] sm:px-4 sm:pb-24 sm:pt-7 ${activePortalView === "home" ? "max-w-[560px]" : "max-w-[1040px]"}`}>
        <div className="mb-6 sm:mb-8 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-[#1e40af] px-3 py-1 rounded-full text-[13px] font-bold mb-3">
                <Home className="w-3.5 h-3.5" /> {portalViewLabel(activePortalView)}
              </div>
              <h1 className="text-gray-900 text-[25px] sm:text-[28px] mb-1" style={{ fontWeight: 900 }}>
                שלום, {ownerDisplayName.split(" ")[0] || ownerDisplayName}<span className="inline-block mr-2">👋</span>
              </h1>
              <p className="text-gray-500 font-medium text-[13px] sm:text-[14px] leading-6">
                {activePortalView === "home"
                  ? "כל מה שחשוב עכשיו במקום אחד, בלי עומס."
                  : "בחרו פעולה מהתפריט או חזרו לבית לצפייה מהירה."}
              </p>
            </div>


          </div>

        </div>

        {isPortalLoading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5 text-center text-gray-500 font-medium">
            טוען את האזור האישי...
          </div>
        )}

        {!isPortalLoading && portalError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5 mb-5 text-[14px] font-medium">
            {portalError}
          </div>
        )}


        {activePortalView === "home" && (
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-[32px] border border-blue-100 bg-gradient-to-br from-[#1e40af] via-[#2563eb] to-[#60a5fa] text-white shadow-xl shadow-blue-500/20">
              <div className="absolute -top-16 -left-16 w-44 h-44 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -bottom-20 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <div className="relative p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <p className="text-blue-100 text-[13px] font-bold mb-1">האזור האישי שלכם</p>
                    <h2 className="text-[25px] leading-tight font-black">ברוך הבא</h2>
                    <p className="text-blue-50/90 text-[13px] leading-6 mt-2">
                      {nextAppointment
                        ? `התור הקרוב: ${nextAppointment.petName} · ${nextAppointment.date}`
                        : openPayments.length > 0
                          ? `יש יתרה פתוחה לתשלום: ₪${openPaymentsTotal.toLocaleString()}`
                          : "אין תור קרוב. אפשר לקבוע תור חדש במהירות."}
                    </p>
                  </div>
                  <div className="w-14 h-14 rounded-[22px] bg-white/18 border border-white/20 flex items-center justify-center shrink-0">
                    {nextAppointment ? <CalendarClock className="w-7 h-7" /> : openPayments.length > 0 ? <AlertCircle className="w-7 h-7" /> : <Heart className="w-7 h-7" />}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 mb-5">
                  <button
                    onClick={openOwnerBooking}
                    className="min-h-[58px] rounded-2xl bg-white text-[#1e40af] px-4 py-3 flex items-center justify-center gap-2 text-[14px] font-black shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <CalendarPlus className="w-4 h-4" /> קביעת תור
                  </button>
                  <button
                    onClick={() => goToPortalView(openPayments.length > 0 ? "payments" : "digital")}
                    className="min-h-[58px] rounded-2xl bg-white/15 hover:bg-white/20 border border-white/20 px-4 py-3 flex items-center justify-center gap-2 text-[14px] font-black cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    {openPayments.length > 0 ? <CreditCard className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                    {openPayments.length > 0 ? "לתשלום" : "פנייה למרפאה"}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <button onClick={() => goToPortalView("appointments")} className="rounded-2xl bg-white/12 border border-white/15 px-2 py-3 cursor-pointer">
                    <p className="text-[20px] font-black leading-none">{appointments.length}</p>
                    <p className="text-[12px] text-blue-50 mt-1 font-bold">תורים</p>
                  </button>
                  <button onClick={() => goToPortalView("notifications")} className="rounded-2xl bg-white/12 border border-white/15 px-2 py-3 cursor-pointer">
                    <p className="text-[20px] font-black leading-none">{unreadNotificationsCount}</p>
                    <p className="text-[12px] text-blue-50 mt-1 font-bold">חדשות</p>
                  </button>
                  <button onClick={() => goToPortalView("digital")} className="rounded-2xl bg-white/12 border border-white/15 px-2 py-3 cursor-pointer">
                    <p className="text-[20px] font-black leading-none">{activeDigitalCount}</p>
                    <p className="text-[12px] text-blue-50 mt-1 font-bold">שיחות</p>
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[30px] bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-blue-100/70 bg-gradient-to-l from-blue-50/90 via-indigo-50/40 to-white p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                    <CalendarClock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-gray-900 text-[16px] font-black">תורים עתידיים</h3>
                    <p className="text-gray-500 text-[13px] font-semibold">{appointments.length} תורים קבועים</p>
                  </div>
                </div>
                <button onClick={() => goToPortalView("appointments")} className="text-[#1e40af] text-[13px] font-black rounded-full bg-blue-50 px-3 py-1.5 border border-blue-100 cursor-pointer">
                  הכל
                </button>
              </div>

              {upcomingAppointmentsPreview.length === 0 ? (
                <div className="p-5">
                  <div className="rounded-[24px] bg-gray-50 border border-gray-100 p-5 text-center">
                    <Calendar className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-900 text-[14px] font-black">אין תור קרוב</p>
                    <p className="text-gray-500 text-[13px] leading-5 mt-1">אפשר לקבוע תור חדש בלחיצה אחת.</p>
                    <button onClick={openOwnerBooking} className="mt-4 w-full rounded-2xl bg-[#1e40af] text-white py-3 text-[13px] font-black cursor-pointer">
                      קביעת תור
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {upcomingAppointmentsPreview.map((appt) => (
                    <div key={appt.id} className="p-4 flex items-center gap-3">
                      <img src={appt.petImage} alt={appt.petName} className="w-12 h-12 rounded-2xl object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 text-[14px] font-black truncate">{appt.petName} · {appt.type}</p>
                        <p className="text-gray-500 text-[13px] font-semibold mt-1">{appt.date} · {appt.time}</p>
                      </div>
                      <button onClick={() => goToPortalView("appointments")} className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 cursor-pointer">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>


            <section className="grid grid-cols-2 gap-3">
              <button onClick={() => goToPortalView("pets")} className="rounded-[26px] bg-white border border-gray-100 p-4 text-right shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                  <Heart className="w-5 h-5" />
                </div>
                <p className="text-gray-900 text-[14px] font-black">החיות שלי</p>
                <p className="text-gray-500 text-[13px] font-semibold mt-1">{pets.length} חיות רשומות</p>
              </button>
              <button onClick={() => goToPortalView("digital")} className="rounded-[26px] bg-white border border-gray-100 p-4 text-right shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#1e40af] mb-3">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <p className="text-gray-900 text-[14px] font-black">מרפאה דיגיטלית</p>
                <p className="text-gray-500 text-[13px] font-semibold mt-1">{activeDigitalCount} שיחות פעילות</p>
              </button>
            </section>

            <section className="rounded-[30px] bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-orange-100/70 bg-gradient-to-l from-orange-50/90 via-amber-50/40 to-white p-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 text-orange-500 flex items-center justify-center">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-gray-900 text-[16px] font-black">מרכז עדכונים</h3>
                    <p className="text-gray-500 text-[13px] font-semibold">{unreadNotificationsCount > 0 ? `${unreadNotificationsCount} חדשים` : "הכול מעודכן"}</p>
                  </div>
                </div>
                <button onClick={() => goToPortalView("notifications")} className="text-[#1e40af] text-[13px] font-black rounded-full bg-blue-50 px-3 py-1.5 border border-blue-100 cursor-pointer">
                  הכל
                </button>
              </div>

              {latestNotifications.length === 0 ? (
                <div className="p-5 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-gray-900 text-[14px] font-black">הכול מעודכן</p>
                  <p className="text-gray-500 text-[13px] leading-5 mt-1">אין כרגע עדכונים חדשים.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {latestNotifications.map((notif) => {
                    const s = NOTIF_STYLE[notif.type];
                    return (
                      <button key={notif.id} onClick={() => handleNotificationClick(notif)} className={`w-full p-4 flex items-start gap-3 text-right transition-colors cursor-pointer ${notif.isRead ? "hover:bg-gray-50" : "bg-blue-50/35 hover:bg-blue-50/60"}`}>
                        <div className={`w-11 h-11 rounded-2xl ${s.bg} flex items-center justify-center shrink-0 border border-gray-100`}>
                          <s.Icon className={`w-5 h-5 ${s.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-gray-900 text-[14px] font-black truncate">{notif.title}</p>
                            {!notif.isRead && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                          </div>
                          <p className="text-gray-500 text-[13px] font-semibold">{notif.petName} · {notif.date}</p>
                          <p className="text-gray-600 text-[13px] leading-5 mt-1 line-clamp-2">{notif.text}</p>
                          <span className="inline-flex items-center gap-1 text-[#1e40af] text-[13px] font-black mt-2">
                            {portalActionLabelForType(notif.type)} <ChevronLeft className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {(openPayments.length > 0 || latestOpenConversation || mainPet) && (
              <section className="rounded-[30px] border border-gray-100 bg-white shadow-sm p-4 space-y-2">
                <p className="text-gray-900 text-[15px] font-black px-1">פעולות מהירות</p>
                {openPayments.length > 0 && (
                  <button onClick={() => goToPortalView("payments")} className="w-full rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer">
                    <span className="flex items-center gap-2 text-amber-800 text-[13px] font-black"><Receipt className="w-4 h-4" /> יתרה לתשלום</span>
                    <span className="text-amber-900 text-[14px] font-black">₪{openPaymentsTotal.toLocaleString()}</span>
                  </button>
                )}
                {latestOpenConversation && (
                  <button onClick={() => goToPortalView("digital")} className="w-full rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer">
                    <span className="flex items-center gap-2 text-[#1e40af] text-[13px] font-black"><MessageCircle className="w-4 h-4" /> המשך שיחה</span>
                    <ChevronLeft className="w-4 h-4 text-[#1e40af]" />
                  </button>
                )}
                {mainPet && (
                  <button onClick={() => { setExpandedPet(mainPet.id); goToPortalView("pets"); }} className="w-full rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer">
                    <span className="flex items-center gap-2 text-emerald-800 text-[13px] font-black"><Heart className="w-4 h-4" /> תיק רפואי</span>
                    <span className="text-emerald-900 text-[13px] font-black truncate max-w-[130px]">{mainPet.name}</span>
                  </button>
                )}
              </section>
            )}
          </div>
        )}

        {activePortalView === "notifications" && (
          <section className="rounded-[30px] bg-white border border-gray-100 shadow-sm overflow-hidden mb-5">
            <div className="flex items-center justify-between gap-3 border-b border-orange-100/70 bg-gradient-to-l from-orange-50/90 via-amber-50/40 to-white p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 text-orange-500 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-gray-900 text-[17px] font-black">מרכז עדכונים</h2>
                  <p className="text-gray-500 text-[13px] font-semibold">
                    {portalNotifications.length} עדכונים · {unreadNotificationsCount} חדשים
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleMarkAllNotificationsRead}
                disabled={unreadNotificationsCount === 0}
                className="rounded-full bg-blue-50 disabled:bg-gray-50 text-[#1e40af] disabled:text-gray-400 border border-blue-100 disabled:border-gray-100 px-3 py-1.5 text-[13px] font-black cursor-pointer disabled:cursor-not-allowed"
              >
                סמן הכל כנקרא
              </button>
            </div>

            {portalNotifications.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <p className="text-gray-900 text-[15px] font-black">הכול מעודכן</p>
                <p className="text-gray-500 text-[13px] leading-6 mt-1">כאן יופיעו עדכונים מהמרפאה, תזכורות, תשלומים וסיכומי ביקור.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {portalNotifications.map((notif) => {
                  const s = NOTIF_STYLE[notif.type];
                  return (
                    <button
                      key={`${notif.source}-${notif.sourceId}`}
                      type="button"
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full p-4 flex items-start gap-3 text-right transition-colors cursor-pointer ${notif.isRead ? "hover:bg-gray-50" : "bg-blue-50/30 hover:bg-blue-50/50"}`}
                    >
                      <div className={`w-12 h-12 rounded-2xl ${s.bg} flex items-center justify-center shrink-0 border border-gray-100`}>
                        <s.Icon className={`w-5 h-5 ${s.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-gray-900 text-[14px] font-black truncate">{notif.title}</p>
                          {!notif.isRead && <span className="bg-red-500 text-white text-[10px] font-black rounded-full px-2 py-0.5 shrink-0">חדש</span>}
                        </div>
                        <p className="text-gray-500 text-[12px] font-semibold">{notif.petName} · {notif.date}</p>
                        <p className="text-gray-600 text-[13px] leading-6 mt-1">{notif.text}</p>
                        <span className="inline-flex items-center gap-1 text-[#1e40af] text-[12px] font-black mt-3">
                          {portalActionLabelForType(notif.type)} <ChevronLeft className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Portal Sections ── */}
        <div className="space-y-5">

{activePortalView === "digital" && (
          <>
          {/* ═══ 2. Digital Clinic ═══ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection("digital")}
              className="w-full px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 rounded-xl p-2.5 relative">
                  <MessageCircle className="w-5 h-5 text-[#1e40af]" />
                  {digitalConversations.some((conv) => conv.unreadForOwner > 0) && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                      {digitalConversations.reduce((sum, conv) => sum + conv.unreadForOwner, 0)}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <h2 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>מרפאה דיגיטלית</h2>
                  <p className="text-gray-500 font-medium text-[12px]">
                    {digitalConversations.length} שיחות · צ׳אט, קבצים ושיחת וידאו
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenSections((prev) => ({ ...prev, digital: true }));
                    setNewConversationSubject("התייעצות חדשה");
                  }}
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-50 px-2.5 text-[#1e40af] text-[12px] hover:text-[#1e3a8a] cursor-pointer transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <PlusCircle className="w-3.5 h-3.5" /> פנייה חדשה
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.digital ? "rotate-180" : ""}`} />
              </div>
            </button>

            {(activePortalView === "digital" || openSections.digital) && (
              <div className="border-t border-gray-100 bg-gradient-to-b from-blue-50/40 to-white p-4">
                {digitalError && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-[13px] font-medium">
                    {digitalError}
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
                  {/* Owner conversation sidebar */}
                  <div className={`space-y-4 ${selectedDigitalConversation ? "hidden xl:block" : "block"}`}>
                    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-gray-900 text-[15px]" style={{ fontWeight: 800 }}>פתיחת פנייה לצוות</h3>
                          <p className="text-gray-500 text-[12px] mt-1 leading-5">בחרו חיה, כתבו נושא קצר וצוות המרפאה יענה לכם כאן.</p>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-[#1e40af] text-white flex items-center justify-center shrink-0 shadow-sm">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <select
                          value={selectedDigitalPetId}
                          onChange={(e) => setSelectedDigitalPetId(e.target.value ? Number(e.target.value) : "")}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 focus:outline-none focus:border-[#1e40af] bg-white"
                        >
                          <option value="">פנייה כללית</option>
                          {pets.map((pet) => (
                            <option key={pet.id} value={pet.id}>{pet.name}</option>
                          ))}
                        </select>

                        <input
                          value={newConversationSubject}
                          onChange={(e) => setNewConversationSubject(e.target.value)}
                          placeholder="נושא הפנייה לדוגמה: התייעצות לגבי אלרגיה"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#1e40af]"
                        />

                        <textarea
                          value={newConversationText}
                          onChange={(e) => setNewConversationText(e.target.value)}
                          placeholder="כתבו לצוות מה קרה, ממתי זה התחיל ומה תרצו לבדוק..."
                          rows={3}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#1e40af] resize-none"
                        />

                        <button
                          onClick={handleCreateConversation}
                          disabled={creatingConversation || !ownerProfile}
                          className={`w-full rounded-xl py-3 text-[13px] flex items-center justify-center gap-2 transition-colors shadow-sm ${creatingConversation ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer"}`}
                          style={{ fontWeight: 800 }}
                        >
                          {creatingConversation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                          פתיחת פנייה
                        </button>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-gray-900 text-[14px]" style={{ fontWeight: 800 }}>השיחות שלי</span>
                        <button onClick={() => ownerProfile?.owner_id && void loadDigitalConversations(ownerProfile.owner_id)} className="text-[#1e40af] text-[12px] hover:underline font-semibold">
                          רענון
                        </button>
                      </div>

                      <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
                        {digitalLoading && digitalConversations.length === 0 ? (
                          <div className="p-5 text-center text-gray-500 text-[13px] font-medium">טוען שיחות...</div>
                        ) : digitalConversations.length === 0 ? (
                          <div className="p-5 text-center text-gray-500 text-[13px] font-medium leading-6">
                            עדיין אין פניות דיגיטליות. פתחו פנייה חדשה כדי להתחיל צ׳אט עם הצוות.
                          </div>
                        ) : (
                          digitalConversations.map((conv) => (
                            <button
                              key={conv.id}
                              onClick={() => setSelectedConversationId(conv.id)}
                              className={`w-full text-right p-4 transition-colors cursor-pointer ${selectedConversationId === conv.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0">
                                  <p className="text-gray-900 text-[13px] truncate" style={{ fontWeight: 800 }}>{conv.subject}</p>
                                  <p className="text-gray-500 text-[12px] mt-1">{conv.petName} · {formatPortalDate(conv.lastMessageAt)}</p>
                                </div>
                                {conv.unreadForOwner > 0 && (
                                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center font-bold">
                                    {conv.unreadForOwner}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full font-semibold">{DIGITAL_STATUS_LABELS[conv.status]}</span>
                                <span className="bg-blue-50 text-[#1e40af] text-[11px] px-2 py-0.5 rounded-full font-semibold">{DIGITAL_PRIORITY_LABELS[conv.priority]}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Chat area */}
                  <div className={`${selectedDigitalConversation ? "flex" : "hidden xl:flex"} min-h-[min(660px,calc(100dvh-190px))] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm xl:min-h-[560px]`}>
                    {selectedDigitalConversation ? (
                      <>
                        <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedConversationId(null)}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 xl:hidden"
                              aria-label="חזרה לרשימת השיחות"
                            >
                              <ChevronLeft className="h-5 w-5 rotate-180" />
                            </button>
                            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100">
                              <MessageCircle className="w-5 h-5 text-[#1e40af]" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-gray-900 text-[15px] sm:text-[16px]" style={{ fontWeight: 800 }}>{selectedDigitalConversation.subject}</h3>
                              <p className="text-gray-500 text-[12px] mt-0.5">
                                {selectedDigitalConversation.petName} · {DIGITAL_STATUS_LABELS[selectedDigitalConversation.status]}
                              </p>
                            </div>
                          </div>

                          <div className="flex w-full items-center gap-2 sm:w-auto">
                            <button
                              onClick={() => chatFileInputRef.current?.click()}
                              disabled={uploadingChatFile}
                              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 border border-gray-200 hover:border-blue-200 hover:bg-blue-50 text-gray-600 hover:text-[#1e40af] rounded-xl px-3 py-2 text-[12px] transition-colors cursor-pointer disabled:opacity-60 sm:flex-none"
                              style={{ fontWeight: 700 }}
                            >
                              <Paperclip className="w-4 h-4" /> {uploadingChatFile ? "מעלה..." : "צירוף קובץ"}
                            </button>
                            <button
                              onClick={handleStartVideoSession}
                              disabled={startingVideo}
                              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2 text-[12px] transition-colors cursor-pointer disabled:opacity-60 sm:flex-none"
                              style={{ fontWeight: 700 }}
                            >
                              {startingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} {findLatestMeetUrl(digitalMessages) ? "הצטרף ל-Google Meet" : "בקש שיחת וידאו"}
                            </button>
                          </div>
                        </div>

                        <div ref={chatMessagesContainerRef} className="flex-1 bg-[#f8fafc] p-3 sm:p-4 overflow-y-auto max-h-[calc(100dvh-390px)] xl:max-h-[430px] space-y-3">
                          {digitalMessages.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-center text-gray-500 text-[13px] font-medium">
                              אין עדיין הודעות בשיחה הזאת.
                            </div>
                          ) : (
                            digitalMessages.map((message) => {
                              const isOwner = message.senderType === "owner";
                              const messageAttachments = digitalAttachments.filter((att) => att.messageId === message.id);
                              const videoUrl = message.messageType === "video_link" ? extractFirstUrl(message.text) : null;

                              return (
                                <div key={message.id} className={`flex ${isOwner ? "justify-end" : "justify-start"}`}>
                                  <div className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-3 shadow-sm border ${isOwner ? "bg-[#1e40af] text-white border-[#1e40af] rounded-br-md" : "bg-white text-gray-700 border-gray-100 rounded-bl-md"}`}>
                                    <div className="flex items-center justify-between gap-4 mb-1.5">
                                      <span className={`text-[11px] ${isOwner ? "text-blue-100" : "text-gray-400"}`} style={{ fontWeight: 700 }}>
                                        {isOwner ? "אתם" : message.senderName}
                                      </span>
                                      <span className={`text-[10px] ${isOwner ? "text-blue-100" : "text-gray-400"}`}>
                                        {formatPortalTime(message.createdAt)}
                                      </span>
                                    </div>
                                    <p className="text-[13px] leading-6 whitespace-pre-wrap">{message.text}</p>
                                    {videoUrl && (
                                      <button
                                        onClick={() => window.open(videoUrl, "_blank")}
                                        className="mt-3 bg-white/15 hover:bg-white/25 text-inherit border border-white/20 rounded-xl px-3 py-2 text-[12px] flex items-center gap-2 transition-colors"
                                        style={{ fontWeight: 700 }}
                                      >
                                        <ExternalLink className="w-4 h-4" /> הצטרפות ל-Google Meet
                                      </button>
                                    )}
                                    {messageAttachments.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        {messageAttachments.map((attachment) => (
                                          <button
                                            key={attachment.id}
                                            onClick={() => void openChatAttachment(attachment)}
                                            className={`w-full rounded-xl px-3 py-2 text-[12px] flex items-center justify-between gap-3 transition-colors ${isOwner ? "bg-white/10 hover:bg-white/20 text-white" : "bg-gray-50 hover:bg-gray-100 text-gray-700"}`}
                                          >
                                            <span className="flex items-center gap-2 min-w-0">
                                              <Paperclip className="w-3.5 h-3.5 shrink-0" />
                                              <span className="truncate">{attachment.fileName}</span>
                                            </span>
                                            <span className="opacity-70 shrink-0">{attachment.fileSize ? formatFileSize(attachment.fileSize) : "קובץ"}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={chatEndRef} />
                        </div>

                        <div className="border-t border-gray-100 p-3 sm:p-4 bg-white">
                          <input
                            ref={chatFileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleChatFileSelected}
                            accept="image/*,.pdf,.doc,.docx,.txt"
                          />
                          <div className="flex items-end gap-3">
                            <textarea
                              value={messageInput}
                              onChange={(e) => setMessageInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleSendOwnerMessage();
                                }
                              }}
                              placeholder="כתבו הודעה לצוות המרפאה..."
                              rows={2}
                              className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-[13px] focus:outline-none focus:border-[#1e40af] resize-none"
                            />
                            <button
                              onClick={handleSendOwnerMessage}
                              disabled={sendingMessage}
                              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shrink-0 ${sendingMessage ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer shadow-sm"}`}
                              title="שליחת הודעה"
                            >
                              {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                          </div>
                          <p className="text-gray-400 text-[11px] mt-2 font-medium">
                            ניתן לצרף תמונות, PDF ומסמכים. במקרה חירום רפואי יש לפנות טלפונית למרפאה.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="h-full min-h-[520px] flex flex-col items-center justify-center text-center p-8">
                        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 border border-blue-100">
                          <MessageCircle className="w-8 h-8 text-[#1e40af]" />
                        </div>
                        <h3 className="text-gray-900 text-[18px] mb-2" style={{ fontWeight: 800 }}>עדיין אין שיחה פעילה</h3>
                        <p className="text-gray-500 text-[13px] leading-6 max-w-md">
                          פתחו פנייה חדשה כדי לשוחח עם צוות המרפאה, לשלוח תמונות או מסמכים, ולבקש שיחת וידאו.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>


          </>
          )}

{activePortalView === "appointments" && (
          <>
          {/* ═══ 3. Future Appointments ═══ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection("appointments")}
              className="w-full px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 rounded-xl p-2.5"><CalendarClock className="w-5 h-5 text-indigo-500" /></div>
                <div className="text-right">
                  <h2 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>תורים עתידיים</h2>
                  <p className="text-gray-500 font-medium text-[12px]">{appointments.length} תורים קבועים</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  onClick={(e) => { e.stopPropagation(); openOwnerBooking(); }}
                  className="flex items-center gap-1.5 text-[#1e40af] text-[12px] hover:text-[#1e3a8a] cursor-pointer transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> תור חדש
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.appointments ? "rotate-180" : ""}`} />
              </div>
            </button>

            {activePortalView === "appointments" && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                {appointments.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 font-medium">
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-[14px]">אין תורים עתידיים</p>
                    <button onClick={openOwnerBooking} className="mt-3 text-[#1e40af] text-[13px] hover:text-[#1e3a8a] cursor-pointer transition-colors" style={{ fontWeight: 500 }}>קבעו תור חדש</button>
                  </div>
                ) : (
                  appointments.map((appt) => (
                    <div key={appt.id} className="rounded-xl border border-gray-100 hover:border-indigo-200 p-4 transition-all hover:shadow-sm group">
                      <div className="flex items-start gap-3.5">
                        <div className="relative shrink-0">
                          <img src={appt.petImage} alt={appt.petName} className="w-11 h-11 rounded-xl object-cover" />
                          <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center border-2 border-white">
                            {appt.petType === "dog" ? <Dog className="w-2.5 h-2.5 text-indigo-500" /> : <Cat className="w-2.5 h-2.5 text-indigo-500" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{appt.petName}</span>
                            <span className="bg-indigo-50 text-indigo-600 text-[13px] px-2 py-0.5 rounded-full border border-indigo-200" style={{ fontWeight: 500 }}>{appt.type}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-500 mb-1.5">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-500 font-medium" />{appt.date}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gray-500 font-medium" />{appt.time}</span>
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-500 font-medium" />{appt.room}</span>
                          </div>
                          <p className="text-gray-500 font-medium text-[12px] mb-0.5">{appt.vet}</p>
                          {appt.notes && <p className="text-gray-500 font-medium text-[13px] mt-1" style={{ lineHeight: 1.5 }}>{appt.notes}</p>}
                          <div className="flex items-center gap-2 mt-3">
                            <button onClick={() => { setRescheduleAppt(appt); setRescheduleDate(""); setRescheduleTime(""); }} className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-[13px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-blue-200" style={{ fontWeight: 500 }}>
                              <CalendarClock className="w-3 h-3" /> הזז תור
                            </button>
                            <button onClick={() => setCancelAppt(appt)} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-500 text-[13px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-red-200" style={{ fontWeight: 500 }}>
                              <Trash2 className="w-3 h-3" /> בטל תור
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>


          </>
          )}

{activePortalView === "pets" && (
          <>
          {/* ═══ 3. My Pets – Medical Record ═══ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection("pets")}
              className="w-full px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-green-50 rounded-xl p-2.5"><Heart className="w-5 h-5 text-green-600" /></div>
                <div className="text-right">
                  <h2 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>החיות שלי - תיק רפואי</h2>
                  <p className="text-gray-500 font-medium text-[12px]">{pets.length} חיות רשומות</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.pets ? "rotate-180" : ""}`} />
            </button>

            {(activePortalView === "pets" || openSections.pets) && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {pets.map((pet) => {
                  const isExpanded = expandedPet === pet.id;
                  const PIcon = pet.type === "dog" ? Dog : Cat;
                  return (
                    <div key={pet.id} className="rounded-2xl border border-gray-100 overflow-hidden transition-all hover:shadow-sm">
                      {/* ── Pet Card Header ── */}
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
                        <div className="relative shrink-0">
                          <img src={pet.image} alt={pet.name} className="w-[80px] h-[80px] rounded-2xl object-cover shadow-sm" />
                          <div className="absolute -bottom-1.5 -left-1.5 w-7 h-7 bg-white rounded-lg shadow-sm flex items-center justify-center border border-gray-100">
                            <PIcon className="w-4 h-4 text-[#1e40af]" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5 mb-2">
                            <h3 className="text-gray-900 text-[20px]" style={{ fontWeight: 700 }}>{pet.name}</h3>
                            <span className="bg-gray-100 text-gray-500 text-[12px] px-2.5 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                              {pet.type === "dog" ? "כלב" : "חתול"}, {pet.breed}, בן {pet.age}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-gray-500 mb-4">
                            {[
                              { label: "מין", value: pet.gender },
                              { label: "משקל", value: pet.weight },
                              { label: "ביקור אחרון", value: pet.lastVisit },
                              { label: "חיסון הבא", value: pet.nextVaccine },
                            ].map((f) => (
                              <span key={f.label}><span className="text-gray-600" style={{ fontWeight: 500 }}>{f.label}:</span> {f.value}</span>
                            ))}
                          </div>
                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                            <button
                              onClick={() => setExpandedPet(isExpanded ? null : pet.id)}
                              className="flex min-h-11 w-full items-center justify-center gap-2 bg-gradient-to-l from-[#1e40af] to-[#2563eb] hover:from-[#1e3a8a] hover:to-[#1e40af] text-white text-[13px] px-4 sm:px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/15 sm:w-auto"
                              style={{ fontWeight: 600 }}
                            >
                              <FileText className="w-4 h-4" />
                              צפה בתיק הרפואי המלא
                              <ChevronLeft className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </button>
                            <button
                              onClick={() => exportOwnerMedicalRecord(pet, ownerDisplayName, appointments)}
                              className="flex min-h-11 w-full items-center justify-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer text-[12px] border border-emerald-100 hover:border-emerald-200 sm:w-fit"
                              style={{ fontWeight: 500 }}
                            >
                              <Download className="w-3.5 h-3.5" />
                              ייצוא תיק רפואי לאקסל
                            </button>
                          </div>
                        </div>

                        <div className="hidden flex-col items-end gap-2 shrink-0 sm:flex">
                          <button
                            type="button"
                            onClick={() => exportOwnerMedicalRecord(pet, ownerDisplayName, appointments)}
                            className="flex items-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[12px] px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm shadow-blue-500/20 whitespace-nowrap"
                            style={{ fontWeight: 600 }}
                          >
                            <Download className="w-3.5 h-3.5" />
                            הורדת תיק רפואי
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedPet(pet.id)}
                            className="flex items-center gap-2 border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 text-[12px] px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                            style={{ fontWeight: 500 }}
                            title="פתיחת אזור חיובים ותשלומים"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            חיובים ותשלומים
                          </button>
                        </div>
                      </div>

                      {/* ── Expanded view ── */}
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          <div className="px-4 py-4 sm:px-6 bg-gradient-to-l from-blue-50/60 to-white border-b border-gray-100">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-[#1e40af]" />
                                <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>סיכומי ביקור</h4>
                                <span className="bg-blue-100 text-[#1e40af] text-[13px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                                  {(visitSummariesByPet[pet.id] ?? []).length} ביקורים
                                </span>
                              </div>
                              {(visitSummariesByPet[pet.id] ?? []).some((v) => v.status === "unpaid") && (
                                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                  <span className="text-red-600 text-[12px]" style={{ fontWeight: 600 }}>
                                    חוב פתוח: ₪{(visitSummariesByPet[pet.id] ?? []).filter((v) => v.status === "unpaid").reduce((s, v) => s + v.amount, 0).toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="divide-y divide-gray-100">
                              {(visitSummariesByPet[pet.id] ?? []).map((visit) => (
                                <div
                                  key={visit.id}
                                  className={`flex items-center justify-between py-3.5 gap-4 -mx-6 px-6 transition-colors hover:bg-white/80 ${
                                    visit.status === "unpaid" ? "bg-red-50/30" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${visit.status === "paid" ? "bg-emerald-400" : "bg-red-400"}`} />
                                    <div className="min-w-0">
                                      <p className="text-gray-900 text-[14px] truncate" style={{ fontWeight: 600 }}>{visit.title}</p>
                                      <p className="text-gray-500 font-medium text-[12px] flex items-center gap-1 mt-0.5">
                                        <Calendar className="w-3 h-3" />{visit.date}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    {visit.status === "paid" ? (
                                      <>
                                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] px-3 py-1.5 rounded-full" style={{ fontWeight: 600 }}>
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          שולם ({visit.amount.toLocaleString()} ₪)
                                        </span>
                                        <span className="text-gray-500 text-[12px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                                          <Eye className="w-3.5 h-3.5" />
                                          הסיכום מופיע בתיק
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 text-[12px] px-3 py-1.5 rounded-full" style={{ fontWeight: 700 }}>
                                          <AlertCircle className="w-3.5 h-3.5" />
                                          לתשלום ({visit.amount.toLocaleString()} ₪)
                                        </span>
                                        <button
                                          onClick={() => openDemoPaymentById(visit.paymentId)}
                                          disabled={!visit.paymentId || payingPaymentId === visit.paymentId}
                                          className={`flex items-center gap-1.5 text-white text-[12px] px-4 py-2 rounded-xl transition-all shadow-sm shadow-blue-500/15 ${!visit.paymentId || payingPaymentId === visit.paymentId ? "bg-gray-300 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a] cursor-pointer"}`}
                                          style={{ fontWeight: 600 }}
                                        >
                                          <CreditCard className="w-3.5 h-3.5" />
                                          {payingPaymentId === visit.paymentId ? "מעבד תשלום..." : "שלם עכשיו"}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="px-4 py-4 sm:px-6 bg-white border-t border-gray-100">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-emerald-600" />
                                <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>חיובים ותשלומים</h4>
                                <span className="bg-emerald-50 text-emerald-700 text-[13px] px-2 py-0.5 rounded-full border border-emerald-200" style={{ fontWeight: 600 }}>
                                  {(paymentsByPet[pet.id] ?? []).length} חיובים
                                </span>
                              </div>

                              {(paymentsByPet[pet.id] ?? []).some((payment) => isOpenPayment(payment.status)) && (
                                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                  <span className="text-red-600 text-[12px]" style={{ fontWeight: 600 }}>
                                    יתרה לתשלום: ₪{(paymentsByPet[pet.id] ?? []).filter((payment) => isOpenPayment(payment.status)).reduce((sum, payment) => sum + payment.amount, 0).toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>

                            {(paymentsByPet[pet.id] ?? []).length === 0 ? (
                              <div className="text-center py-6 text-gray-500 font-medium text-[13px]">
                                אין חיובים שמורים במסד הנתונים עבור החיה הזאת
                              </div>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {(paymentsByPet[pet.id] ?? []).map((payment) => (
                                  <div key={payment.id} className={`flex items-center justify-between py-3.5 gap-4 -mx-6 px-6 transition-colors hover:bg-gray-50 ${isOpenPayment(payment.status) ? "bg-red-50/20" : ""}`}>
                                    <div className="min-w-0">
                                      <p className="text-gray-900 text-[14px] truncate" style={{ fontWeight: 600 }}>{payment.title}</p>
                                      <p className="text-gray-500 font-medium text-[12px] mt-0.5">
                                        ₪{payment.amount.toLocaleString()} · {payment.dueDate ? `לתשלום עד ${payment.dueDate}` : payment.date}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className={`inline-flex items-center gap-1.5 border text-[12px] px-3 py-1.5 rounded-full ${isOpenPayment(payment.status) ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} style={{ fontWeight: 700 }}>
                                        {isOpenPayment(payment.status) ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {getPaymentStatusLabel(payment.status)}
                                      </span>

                                      {isOpenPayment(payment.status) && (
                                        <button
                                          onClick={() => openDemoPayment(payment)}
                                          disabled={payingPaymentId === payment.id}
                                          className={`flex items-center gap-1.5 text-white text-[12px] px-4 py-2 rounded-xl transition-all shadow-sm shadow-blue-500/15 ${payingPaymentId === payment.id ? "bg-gray-300 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a] cursor-pointer"}`}
                                          style={{ fontWeight: 600 }}
                                        >
                                          <CreditCard className="w-3.5 h-3.5" />
                                          {payingPaymentId === payment.id ? "מעבד תשלום..." : "שלם עכשיו"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="bg-white px-4 py-5 sm:px-6 border-t border-gray-100">
                            <VaccinationBook
                              patientId={pet.id}
                              petName={pet.name}
                              species={pet.type === "dog" ? "כלב" : pet.type === "cat" ? "חתול" : "אחר"}
                              breed={pet.breed}
                              ownerId={ownerProfile?.owner_id || null}
                              ownerName={ownerDisplayName}
                              ownerPhone={ownerProfile?.phone || null}
                              mode="owner"
                              compact
                            />
                          </div>

                          <div className="bg-gray-50/50 px-4 py-5 sm:px-6">
                            <ClientMedicalReports petId={pet.id} petName={pet.name} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>


          </>
          )}


{activePortalView === "payments" && (
            <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
              <div className="border-b border-emerald-100 bg-gradient-to-l from-emerald-50 via-white to-blue-50/50 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-700 shadow-sm">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-black text-gray-950">תשלומים וחיובים</h2>
                      <p className="mt-0.5 text-[13px] font-semibold text-gray-500">כל החיובים במקום אחד, לפי חיית המחמד</p>
                    </div>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 ${openPayments.length > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                    <p className={`text-[12px] font-bold ${openPayments.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {openPayments.length > 0 ? "יתרה פתוחה" : "הכול שולם"}
                    </p>
                    <p className={`mt-1 text-[22px] font-black leading-none ${openPayments.length > 0 ? "text-amber-950" : "text-emerald-950"}`}>
                      ₪{openPaymentsTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {allPayments.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <p className="text-[15px] font-black text-gray-900">אין חיובים להצגה</p>
                  <p className="mt-1 text-[13px] leading-6 text-gray-500">חיובים חדשים והיסטוריית תשלומים יופיעו כאן.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {allPayments
                    .slice()
                    .sort((a, b) => Number(isOpenPayment(b.status)) - Number(isOpenPayment(a.status)))
                    .map((payment) => {
                      const petName = pets.find((pet) => pet.id === payment.petId)?.name || "חיוב כללי";
                      const isOpen = isOpenPayment(payment.status);
                      return (
                        <article key={payment.id} className={`p-4 sm:p-5 ${isOpen ? "bg-amber-50/25" : "bg-white"}`}>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[14px] font-black text-gray-950">{payment.title}</h3>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${isOpen ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                                  {getPaymentStatusLabel(payment.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-[12px] font-semibold text-gray-500">{petName} · {payment.dueDate || payment.date}</p>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              <p className="text-[19px] font-black text-gray-950">₪{payment.amount.toLocaleString()}</p>
                              {isOpen && (
                                <button
                                  type="button"
                                  onClick={() => openDemoPayment(payment)}
                                  disabled={payingPaymentId === payment.id}
                                  className="min-h-11 rounded-xl bg-[#1e40af] px-4 py-2 text-[13px] font-black text-white shadow-sm transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-gray-300"
                                >
                                  {payingPaymentId === payment.id ? "מעבד..." : "לתשלום"}
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              )}
            </section>
          )}

{activePortalView === "profile" && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
                <div className="bg-blue-50 rounded-xl p-2.5"><User className="w-5 h-5 text-[#1e40af]" /></div>
                <div>
                  <h2 className="text-gray-900 text-[17px]" style={{ fontWeight: 700 }}>תיק אישי</h2>
                  <p className="text-gray-500 font-medium text-[12px]">פרטי בעלים וכניסה מהירה לאזור האישי</p>
                </div>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4">
                  <p className="text-gray-400 text-[12px] font-bold mb-1">שם</p>
                  <p className="text-gray-900 text-[15px] font-bold">{ownerDisplayName}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4">
                  <p className="text-gray-400 text-[12px] font-bold mb-1">טלפון</p>
                  <p className="text-gray-900 text-[15px] font-bold">{ownerProfile?.phone || "לא הוזן"}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4">
                  <p className="text-gray-400 text-[12px] font-bold mb-1">אימייל</p>
                  <p className="text-gray-900 text-[15px] font-bold">{ownerProfile?.email || "לא הוזן"}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4">
                  <p className="text-gray-400 text-[12px] font-bold mb-1">כתובת</p>
                  <p className="text-gray-900 text-[15px] font-bold">{ownerProfile?.address || "לא הוזן"}</p>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={handlePortalLogout}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 px-5 py-3 text-[14px] font-bold cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> {isStaffPreview ? "חזרה למערכת" : "התנתקות"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-[230] border-t border-blue-100 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:hidden" aria-label="ניווט מהיר בפורטל">
        <div className="mx-auto grid max-w-[560px] grid-cols-5 gap-1">
          {PORTAL_NAV_ITEMS.filter((item) => PORTAL_MOBILE_NAV_KEYS.includes(item.key)).map((item) => {
            const Icon = item.icon;
            const isActive = activePortalView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goToPortalView(item.key)}
                className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10.5px] font-black transition-colors ${isActive ? "bg-blue-50 text-[#1e40af]" : "text-gray-500"}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">
                  {item.key === "digital" ? "דיגיטל" : item.key === "pets" ? "חיות" : item.key === "payments" ? "תשלום" : item.label}
                </span>
                {item.key === "digital" && activeDigitalCount > 0 && (
                  <span className="absolute left-2 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Reschedule Modal ── */}
      {rescheduleAppt && (
        <ModalOverlay onClose={() => { setRescheduleAppt(null); setRescheduleSuccess(false); }} maxWidth="max-w-md" zIndex="z-[300]">
          <ModalHeader title="הזזת תור" icon={<CalendarClock className="w-5 h-5 text-white/80" />} onClose={() => { setRescheduleAppt(null); setRescheduleSuccess(false); }} />
          <div className="p-6">
            {rescheduleSuccess ? (
              <SuccessMessage title="התור הוזז בהצלחה!" subtitle={`התור של ${rescheduleAppt.petName} עודכן`} />
            ) : (
              <>
                <div className="bg-gray-50 rounded-xl p-4 mb-5 flex items-center gap-3">
                  <img src={rescheduleAppt.petImage} alt={rescheduleAppt.petName} className="w-12 h-12 rounded-xl object-cover" />
                  <div>
                    <p className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{rescheduleAppt.petName} — {rescheduleAppt.type}</p>
                    <p className="text-gray-500 text-[13px]">תור נוכחי: {rescheduleAppt.date} בשעה {rescheduleAppt.time}</p>
                  </div>
                </div>
                <PillPicker label="בחרו תאריך חדש" items={datePills} selected={rescheduleDate || null} onSelect={setRescheduleDate} />
                <PillPicker label="בחרו שעה חדשה" items={timePills} selected={rescheduleTime || null} onSelect={setRescheduleTime} />
                {(!rescheduleDate || !rescheduleTime) && (
                  <p className="text-blue-600 text-[12px] font-semibold mt-2">בחרו תאריך ושעה חדשים כדי להזיז את התור.</p>
                )}
                <div className="flex gap-3 mt-2">
                  <button onClick={handleReschedule}
                    className="flex-1 py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white"
                    style={{ fontWeight: 600 }}
                  >
                    <CalendarClock className="w-4 h-4" /> אישור הזזת תור
                  </button>
                  <button onClick={() => setRescheduleAppt(null)} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>ביטול</button>
                </div>
              </>
            )}
          </div>
        </ModalOverlay>
      )}

      {/* ── Cancel Modal ── */}
      {cancelAppt && (
        <ModalOverlay onClose={() => { setCancelAppt(null); setCancelSuccess(false); }} maxWidth="max-w-sm" zIndex="z-[300]">
          {cancelSuccess ? (
            <div className="p-8">
              <SuccessMessage title="התור בוטל בהצלחה" subtitle={`התור של ${cancelAppt.petName} הוסר`} />
            </div>
          ) : (
            <>
              <div className="bg-red-50 px-6 py-5 flex flex-col items-center text-center border-b border-red-100">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
                  <Trash2 className="w-7 h-7 text-red-500" />
                </div>
                <h3 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>ביטול תור</h3>
                <p className="text-gray-500 text-[13px]">האם אתם בטוחים שברצונכם לבטל את התור?</p>
              </div>
              <div className="p-6">
                <div className="bg-gray-50 rounded-xl p-4 mb-5 flex items-center gap-3">
                  <img src={cancelAppt.petImage} alt={cancelAppt.petName} className="w-12 h-12 rounded-xl object-cover" />
                  <div>
                    <p className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{cancelAppt.petName} — {cancelAppt.type}</p>
                    <p className="text-gray-500 text-[12px]">{cancelAppt.date} | {cancelAppt.time} | {cancelAppt.vet}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleCancel} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                    <Trash2 className="w-4 h-4" /> כן, בטלו את התור
                  </button>
                  <button onClick={() => setCancelAppt(null)} className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]" style={{ fontWeight: 500 }}>חזרה</button>
                </div>
              </div>
            </>
          )}
        </ModalOverlay>
      )}

      {/* ── Demo Payment Modal ── */}
      {paymentToPay && (
        <ModalOverlay
          onClose={() => {
            if (!payingPaymentId) {
              setPaymentToPay(null);
              setPaymentSuccess(false);
            }
          }}
          maxWidth="max-w-md"
          zIndex="z-[320]"
        >
          <ModalHeader
            title="אישור תשלום לדוגמה"
            icon={<CreditCard className="w-5 h-5 text-white/80" />}
            onClose={() => {
              if (!payingPaymentId) {
                setPaymentToPay(null);
                setPaymentSuccess(false);
              }
            }}
          />

          <div className="p-6">
            {paymentSuccess ? (
              <SuccessMessage
                title="התשלום נקלט בהצלחה"
                subtitle={`חיוב בסך ₪${paymentToPay.amount.toLocaleString()} סומן כשולם`}
              />
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-blue-100">
                      <CreditCard className="w-5 h-5 text-[#1e40af]" />
                    </div>
                    <div>
                      <p className="text-gray-900 text-[15px]" style={{ fontWeight: 700 }}>
                        {paymentToPay.title}
                      </p>
                      <p className="text-gray-500 text-[13px] mt-1">
                        זהו מסך תשלום לדוגמה לצורך הצגת המערכת. אין להזין פרטי אשראי אמיתיים.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3">
                    <span className="text-gray-500 text-[13px] font-medium">סכום לתשלום</span>
                    <span className="text-gray-900 text-[18px]" style={{ fontWeight: 800 }}>
                      ₪{paymentToPay.amount.toLocaleString()}
                    </span>
                  </div>

                  <div className="border border-gray-100 rounded-xl px-4 py-3 bg-gray-50">
                    <label className="block text-gray-500 text-[12px] font-medium mb-1">
                      אמצעי תשלום
                    </label>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-800 text-[14px] font-semibold">כרטיס לדוגמה</span>
                      <span className="text-gray-500 text-[13px]">**** 4242</span>
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-xl px-4 py-3 bg-gray-50">
                    <label className="block text-gray-500 text-[12px] font-medium mb-1">
                      בעל הכרטיס
                    </label>
                    <span className="text-gray-800 text-[14px] font-semibold">{ownerDisplayName}</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
                  <p className="text-amber-700 text-[12px] leading-5 font-medium">
                    בלחיצה על אישור התשלום יסומן כשולם במערכת לצורך הדגמה בלבד.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleDemoPaymentConfirm}
                    disabled={payingPaymentId === paymentToPay.id}
                    className={`flex-1 py-3 rounded-xl transition-colors text-[14px] shadow-sm flex items-center justify-center gap-2 ${
                      payingPaymentId === paymentToPay.id
                        ? "bg-gray-300 text-white cursor-not-allowed"
                        : "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer"
                    }`}
                    style={{ fontWeight: 700 }}
                  >
                    <CreditCard className="w-4 h-4" />
                    {payingPaymentId === paymentToPay.id ? "מעבד תשלום..." : "אישור תשלום"}
                  </button>
                  <button
                    onClick={() => setPaymentToPay(null)}
                    disabled={payingPaymentId === paymentToPay.id}
                    className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ fontWeight: 500 }}
                  >
                    ביטול
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalOverlay>
      )}

      <OwnerBookAppointment
        isOpen={isBookingOpen && !isStaffPreview}
        onClose={() => setIsBookingOpen(false)}
        pets={pets}
        ownerName={ownerDisplayName}
        ownerPhone={ownerProfile?.phone || ""}
        ownerEmail={ownerProfile?.email || ""}
        onAppointmentCreated={refreshPortalData}
      />

      <div className="portal-floating-ai fixed bottom-20 left-3 z-[240] sm:bottom-5 sm:left-4">
        <ClientPortalAssistant
          pets={pets}
          appointments={appointments}
          notifications={portalNotifications}
          digitalConversations={digitalConversations}
          paymentsByPet={paymentsByPet}
        />
      </div>

      <style>{`
        .portal-floating-ai > div > button {
          width: 58px;
          height: 58px;
          border-radius: 22px;
          padding: 0;
          border: 1px solid rgba(191, 219, 254, 0.9);
          background: linear-gradient(135deg, #1e40af 0%, #2563eb 52%, #7c3aed 100%);
          color: white;
          box-shadow: 0 18px 40px rgba(37, 99, 235, 0.28);
        }
        .portal-floating-ai > div > button:hover {
          background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 52%, #6d28d9 100%);
          transform: translateY(-1px);
        }
        .portal-floating-ai > div > button > span:first-of-type {
          width: 30px;
          height: 30px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.18);
          box-shadow: none;
        }
        .portal-floating-ai > div > button > span:first-of-type svg {
          width: 18px;
          height: 18px;
        }
        .portal-floating-ai > div > button > span:nth-of-type(2),
        .portal-floating-ai > div > button > svg {
          display: none;
        }
      `}</style>
      <Footer />
    </div>
  );
}
