import { useState, useRef, useCallback, useEffect } from "react";
import {
  LogOut, Dog, Cat, Calendar,
  AlertTriangle, Info, FileText, ChevronLeft, ChevronDown,
  Syringe, Stethoscope, Scissors, Heart, User,
  CalendarPlus, Clock, MapPin, Trash2, CalendarClock, Bell, X,
  Download, Upload, File, Image, Paperclip, Eye,
  Receipt, CheckCircle2, CreditCard, AlertCircle,
  MessageCircle, Send, Video, ExternalLink, ShieldCheck, PlusCircle, Loader2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { Footer } from "../components/Footer";
import { OwnerBookAppointment } from "../components/OwnerBookAppointment";
import { SuccessMessage } from "../components/shared/SuccessMessage";
import { PillPicker } from "../components/shared/PillPicker";
import { ModalOverlay, ModalHeader } from "../components/shared/ModalOverlay";
import { AVAILABLE_DATE_STRINGS, AVAILABLE_TIMES } from "../data/calendar-constants";
import { exportOwnerMedicalRecord } from "../hooks/useExportOwnerRecord";
import { MyVetLogo } from "../components/MyVetLogo";
import { ClientMedicalReports } from "../components/ClientMedicalReports";
import { supabase } from "../../services/supabaseClient";

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
  type: "warning" | "info" | "success" | "payment" | "appointment" | "medical" | "lab";
  date: string;
  isRead?: boolean;
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

interface UploadedFile {
  id: number;
  documentId: number;
  name: string;
  size: number;
  type: string;
  petId: number;
  petName: string;
  category: string;
  uploadDate: string;
  filePath: string;
  fileUrl?: string | null;
  previewUrl?: string;
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
  low: "נמוכה",
  normal: "רגילה",
  high: "גבוהה",
  urgent: "דחופה",
};

const FILE_CATEGORIES = [
  { key: "vaccination", label: "תעודת חיסון" },
  { key: "lab", label: "תוצאות מעבדה" },
  { key: "insurance", label: "ביטוח" },
  { key: "prescription", label: "מרשם" },
  { key: "xray", label: "צילום רנטגן" },
  { key: "invoice", label: "חשבונית / קבלה" },
  { key: "medical_summary", label: "סיכום רפואי" },
  { key: "other", label: "אחר" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  FILE_CATEGORIES.map((c) => [c.key, c.label])
);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return Image;
  return File;
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
} as const;

// ─── PillPicker data ─────────────────────────────────────────────────
const datePills = AVAILABLE_DATE_STRINGS.map((d) => ({ key: d.value, label: d.label }));
const timePills = AVAILABLE_TIMES.map((t) => ({ key: t, label: t }));

// ─── Component ───────────────────────────────────────────────────────
export function ClientPortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ownerIdFromUrl = searchParams.get("owner_id") || searchParams.get("ownerId") || "";

  const [expandedPet, setExpandedPet] = useState<number | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Section accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    notifications: true,
    appointments: true, // שיניתי לברירת מחדל פתוח שיהיה קל לראות את התורים מה-Store
    pets: false,
    documents: false,
    digital: true,
  });
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

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
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const refreshPortalData = useCallback(async (ownerIdOverride?: string | null) => {
    setIsPortalLoading(true);
    setPortalError(null);

    try {
      const requestedOwnerId = (ownerIdOverride ?? ownerIdFromUrl).trim();

      if (!requestedOwnerId) {
        setOwnerProfile(null);
        setPets([]);
        setAppointments([]);
        setPortalNotifications([]);
        setVisitSummariesByPet({});
        setPaymentsByPet({});
        setUploadedFiles([]);
        setDigitalConversations([]);
        setDigitalMessages([]);
        setDigitalAttachments([]);
        setSelectedConversationId(null);
        setPortalError("לא נבחר בעלים. היכנסו עם ‎?owner_id=תעודת_זהות של בעלים שקיים במסד.");
        return;
      }

      const { data: ownerData, error: ownerError } = await supabase
        .from("owners")
        .select("owner_id, owner_first_name, owner_last_name, phone, email, address")
        .eq("owner_id", requestedOwnerId)
        .maybeSingle();

      if (ownerError) throw ownerError;

      if (!ownerData) {
        setOwnerProfile(null);
        setPets([]);
        setAppointments([]);
        setPortalNotifications([]);
        setVisitSummariesByPet({});
        setPaymentsByPet({});
        setUploadedFiles([]);
        setDigitalConversations([]);
        setDigitalMessages([]);
        setDigitalAttachments([]);
        setSelectedConversationId(null);
        setPortalError(`לא נמצא בעלים עם owner_id=${requestedOwnerId}. בדקו שהמספר קיים בטבלת owners.`);
        return;
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
      setUploadPetId(mappedPets[0]?.id || 0);

      let mappedAppointments: FutureAppointment[] = [];
      const petById = new Map(mappedPets.map((pet) => [pet.id, pet]));

      const { data: documentRows, error: documentsError } = await supabase
        .from("documents")
        .select("document_id, owner_id, pet_id, visit_id, file_name, file_path, file_url, mime_type, file_size, category, uploaded_at")
        .eq("owner_id", ownerData.owner_id)
        .order("uploaded_at", { ascending: false });

      if (documentsError) throw documentsError;

      const mappedDocuments: UploadedFile[] = await Promise.all((documentRows || []).map(async (row: any) => {
        let signedUrl: string | null = null;

        if (row.file_path) {
          const { data: signedData } = await supabase.storage
            .from("documents")
            .createSignedUrl(row.file_path, 60 * 60);

          signedUrl = signedData?.signedUrl || null;
        }

        const petId = row.pet_id !== null && row.pet_id !== undefined ? Number(row.pet_id) : 0;
        const pet = petById.get(petId);
        const mimeType = row.mime_type || "application/octet-stream";

        return {
          id: Number(row.document_id),
          documentId: Number(row.document_id),
          name: row.file_name || "מסמך",
          size: Number(row.file_size || 0),
          type: mimeType,
          petId,
          petName: pet?.name || "כללי",
          category: row.category || "other",
          uploadDate: formatPortalDate(row.uploaded_at),
          filePath: row.file_path || "",
          fileUrl: row.file_url || signedUrl,
          previewUrl: mimeType.startsWith("image/") ? (signedUrl || row.file_url || undefined) : undefined,
        };
      }));

      setUploadedFiles(mappedDocuments);

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
        .select("notification_id, owner_id, pet_id, title, message, type, is_read, created_at")
        .eq("owner_id", ownerData.owner_id)
        .in("target", ["owner", "both"])
        .order("created_at", { ascending: false });

      if (notificationsError) throw notificationsError;

      const { data: reminderRows, error: remindersError } = await supabase
        .from("reminders")
        .select("reminder_id, owner_id, pet_id, title, message, reminder_type, due_at, status")
        .eq("owner_id", ownerData.owner_id)
        .in("status", ["open", "sent"])
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
          type: (row.type || "info") as PortalNotification["type"],
          date: formatPortalDate(row.created_at),
          isRead: Boolean(row.is_read),
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
          type: (row.reminder_type === "payment" ? "payment" : row.reminder_type === "appointment" ? "appointment" : row.reminder_type === "lab_result" ? "lab" : "warning") as PortalNotification["type"],
          date: formatPortalDate(row.due_at),
          isRead: row.status !== "open",
        };
      });

      setPortalNotifications([...mappedNotifications, ...mappedReminders]);
    } catch (error) {
      console.error("Error loading owner portal from Supabase:", error);
      setOwnerProfile(null);
      setPets([]);
      setAppointments([]);
      setPortalNotifications([]);
      setVisitSummariesByPet({});
      setPaymentsByPet({});
      setUploadedFiles([]);
      setDigitalConversations([]);
      setDigitalMessages([]);
      setDigitalAttachments([]);
      setSelectedConversationId(null);
      setPortalError("שגיאה בטעינת האזור האישי מ-Supabase. בדקו Console / הרשאות RLS / שמות עמודות.");
    } finally {
      setIsPortalLoading(false);
    }
  }, [ownerIdFromUrl]);

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
      setDigitalError("לא הצלחנו לטעון את השיחות הדיגיטליות. בדקו הרשאות לטבלאות conversations/messages.");
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

      await supabase
        .from("messages")
        .update({ is_read_by_owner: true })
        .eq("conversation_id", conversationId)
        .neq("sender_type", "owner");
    } catch (error) {
      console.error("Failed to load digital messages", error);
      setDigitalError("לא הצלחנו לטעון את הודעות השיחה.");
    }
  }, [ownerDisplayName]);

  useEffect(() => {
    if (ownerProfile?.owner_id) {
      void loadDigitalConversations(ownerProfile.owner_id);
    }
  }, [ownerProfile?.owner_id, pets, loadDigitalConversations]);

  useEffect(() => {
    void loadDigitalMessages(selectedConversationId);
  }, [selectedConversationId, loadDigitalMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [digitalMessages.length, selectedConversationId]);

  const refreshDigitalModule = async () => {
    if (!ownerProfile?.owner_id) return;
    await loadDigitalConversations(ownerProfile.owner_id);
    await loadDigitalMessages(selectedConversationId);
  };

  const handleCreateConversation = async () => {
    if (!ownerProfile?.owner_id) return;
    if (!newConversationSubject.trim()) {
      alert("כתבו נושא קצר לפנייה.");
      return;
    }

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
      console.error("Failed to create conversation", error);
      alert("לא הצלחנו לפתוח פנייה חדשה. בדקו הרשאות conversations/messages.");
    } finally {
      setCreatingConversation(false);
    }
  };

  const handleSendOwnerMessage = async () => {
    if (!ownerProfile?.owner_id || !selectedConversationId || !messageInput.trim()) return;

    try {
      setSendingMessage(true);
      const now = new Date().toISOString();

      const { error } = await supabase
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
        });

      if (error) throw error;

      await supabase
        .from("conversations")
        .update({ status: "waiting_staff", last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversationId);

      setMessageInput("");
      await loadDigitalMessages(selectedConversationId);
      if (ownerProfile?.owner_id) await loadDigitalConversations(ownerProfile.owner_id);
    } catch (error) {
      console.error("Failed to send message", error);
      alert("לא הצלחנו לשלוח את ההודעה.");
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

    if (!file || !ownerProfile?.owner_id || !selectedConversationId) return;

    try {
      setUploadingChatFile(true);
      const now = new Date().toISOString();
      const filePath = buildSafeChatAttachmentPath(selectedConversationId, file);

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(filePath, file, { contentType: getStorageContentType(file), upsert: false });

      if (uploadError) throw uploadError;

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

      await supabase
        .from("conversations")
        .update({ status: "waiting_staff", last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversationId);

      await loadDigitalMessages(selectedConversationId);
      await loadDigitalConversations(ownerProfile.owner_id);
    } catch (error) {
      console.error("Failed to upload chat attachment", error);
      alert("לא הצלחנו להעלות את הקובץ לשיחה. בדקו הרשאות Storage עבור chat-attachments.");
    } finally {
      setUploadingChatFile(false);
    }
  };

  const openChatAttachment = async (attachment: ChatAttachmentSummary) => {
    try {
      const { data, error } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(attachment.filePath, 60 * 10);

      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error("Failed to open chat attachment", error);
      alert("לא הצלחנו לפתוח את הקובץ.");
    }
  };

  const handleStartVideoSession = async () => {
    if (!ownerProfile?.owner_id || !selectedConversationId) return;

    const existingMeetUrl = findLatestMeetUrl(digitalMessages);
    if (existingMeetUrl) {
      window.open(existingMeetUrl, "_blank", "noopener,noreferrer");
      return;
    }

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
        window.open(existingSession.meeting_url, "_blank", "noopener,noreferrer");
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
          sender_type: "system",
          sender_name: "מערכת MyVet",
          message_text: "בעל החיה ביקש שיחת וידאו. צוות המרפאה ייצור קישור Google Meet וישלח אותו כאן.",
          message_type: "system",
          is_read_by_owner: true,
          is_read_by_staff: false,
        });

      if (messageError) throw messageError;

      await supabase
        .from("conversations")
        .update({ status: "waiting_staff", last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversationId);

      await loadDigitalMessages(selectedConversationId);
      await loadDigitalConversations(ownerProfile.owner_id);
      alert("הבקשה לשיחת וידאו נשלחה לצוות המרפאה. כשהצוות ייצור קישור Google Meet, הוא יופיע כאן בשיחה.");
    } catch (error) {
      console.error("Failed to request video session", error);
      alert("לא הצלחנו לשלוח בקשה לשיחת וידאו.");
    } finally {
      setStartingVideo(false);
    }
  };

  // 2. עדכון להזזת תור מול Supabase
  const handleReschedule = async () => {
    if (!rescheduleAppt || !rescheduleDate || !rescheduleTime) return;
    
    // מפענח את התאריך החדש
    const [dayStr, monthStr, yearStr] = rescheduleDate.split("/");
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    try {
      const startTime = new Date(year, month - 1, day, Number(rescheduleTime.split(":")[0]), Number(rescheduleTime.split(":")[1] || 0));
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

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
    }
  };

  // 3. עדכון לביטול תור מול ה-Store
  const handleCancel = async () => {
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
    }
  };

  const openDemoPayment = (payment: PaymentSummary) => {
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
      alert("לא נמצא חיוב מתאים במסד הנתונים.");
    }
  };

  const handleDemoPaymentConfirm = async () => {
    if (!paymentToPay) return;

    try {
      setPayingPaymentId(paymentToPay.id);

      const { error } = await supabase
        .from("payments")
        .update({
          status: "paid",
          payment_method: "credit",
          paid_at: new Date().toISOString(),
          notes: paymentToPay.notes
            ? `${paymentToPay.notes} | שולם דרך פורטל בעלים - תשלום דמו`
            : "שולם דרך פורטל בעלים - תשלום דמו",
        })
        .eq("payment_id", paymentToPay.id);

      if (error) throw error;

      await refreshPortalData();
      setPaymentSuccess(true);
      setTimeout(() => {
        setPaymentSuccess(false);
        setPaymentToPay(null);
      }, 1800);
    } catch (error) {
      console.error("Failed to complete demo payment", error);
      alert("לא הצלחנו להשלים את תשלום הדמו. בדקו הרשאות RLS / Console.");
    } finally {
      setPayingPaymentId(null);
    }
  };

  // File upload state connected to Supabase Storage + documents table
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPetId, setUploadPetId] = useState<number>(0);
  const [uploadCategory, setUploadCategory] = useState<string>("other");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<UploadedFile | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);

  const processFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!ownerProfile?.owner_id) {
      alert("לא ניתן להעלות קבצים בלי בעלים מחובר.");
      return;
    }

    if (!uploadPetId) {
      alert("בחרו חיה לפני העלאת קובץ.");
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    const pet = pets.find((p) => p.id === uploadPetId);
    const uploadedEntries: UploadedFile[] = [];

    setIsUploadingFiles(true);

    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        alert(`הקובץ "${file.name}" גדול מדי (מקסימום 10MB)`);
        continue;
      }

      const safeName = sanitizeStorageFileName(file.name);
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
      const filePath = `${ownerProfile.owner_id}/${uploadPetId}/${uniqueName}`;

      try {
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: getStorageContentType(file),
          });

        if (uploadError) throw uploadError;

        const { data: documentData, error: documentError } = await supabase
          .from("documents")
          .insert({
            owner_id: ownerProfile.owner_id,
            pet_id: uploadPetId,
            file_name: file.name,
            file_path: filePath,
            mime_type: getStorageContentType(file),
            file_size: file.size,
            category: uploadCategory,
            uploaded_by_role: "owner",
          })
          .select("document_id, file_name, file_path, file_url, mime_type, file_size, category, uploaded_at")
          .single();

        if (documentError) throw documentError;

        const { data: signedData } = await supabase.storage
          .from("documents")
          .createSignedUrl(filePath, 60 * 60);

        const signedUrl = signedData?.signedUrl || null;
        const mimeType = documentData.mime_type || getStorageContentType(file);

        uploadedEntries.push({
          id: Number(documentData.document_id),
          documentId: Number(documentData.document_id),
          name: documentData.file_name || file.name,
          size: Number(documentData.file_size || file.size),
          type: mimeType,
          petId: uploadPetId,
          petName: pet?.name || "כללי",
          category: documentData.category || uploadCategory,
          uploadDate: formatPortalDate(documentData.uploaded_at),
          filePath: documentData.file_path || filePath,
          fileUrl: documentData.file_url || signedUrl,
          previewUrl: mimeType.startsWith("image/") ? (signedUrl || undefined) : undefined,
        });
      } catch (error) {
        console.error("Failed to upload document", error);
        alert(`לא הצלחנו להעלות את הקובץ "${file.name}". בדקו הרשאות Storage / טבלת documents.`);
      }
    }

    if (uploadedEntries.length > 0) {
      setUploadedFiles((prev) => [...uploadedEntries, ...prev]);
    }

    setIsUploadingFiles(false);
  }, [ownerProfile, uploadPetId, uploadCategory, pets]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    void processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleOpenFile = async (file: UploadedFile) => {
    try {
      let url = file.previewUrl || file.fileUrl || null;

      if (!url && file.filePath) {
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(file.filePath, 60 * 60);

        if (error) throw error;
        url = data?.signedUrl || null;
      }

      if (!url) {
        alert("לא נמצא קישור לקובץ.");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Failed to open document", error);
      alert("לא הצלחנו לפתוח את הקובץ. בדקו הרשאות Storage.");
    }
  };

  const handleDeleteFile = async (fileToDelete: UploadedFile) => {
    try {
      setDeletingDocumentId(fileToDelete.documentId);

      if (fileToDelete.filePath) {
        const { error: storageError } = await supabase.storage
          .from("documents")
          .remove([fileToDelete.filePath]);

        if (storageError) throw storageError;
      }

      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("document_id", fileToDelete.documentId);

      if (dbError) throw dbError;

      setUploadedFiles((prev) => prev.filter((f) => f.documentId !== fileToDelete.documentId));
      setDeleteConfirmFile(null);
    } catch (error) {
      console.error("Failed to delete document", error);
      alert("לא הצלחנו למחוק את הקובץ. בדקו הרשאות Storage / documents.");
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f8f9fb] flex flex-col" style={{ fontFamily: "'Heebo', sans-serif" }}>
      
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full px-6 h-16 flex items-center justify-between">
          
          {/* ─── צד ימין: לוגו ותגית ─── */}
          <div className="flex items-center gap-5">
            <div className="flex items-center shrink-0 mr-2 cursor-pointer hover:opacity-90 transition-opacity">
              {/* הלוגו המקורי בפרופורציה מלאה (סמל + טקסט מובנה), ללא קופסאות או טקסטים כפולים לידו */}
              <MyVetLogo color="#1e40af" className="h-19 w-auto" />
            </div>

            <div className="hidden md:block w-px h-6 bg-gray-200"></div>

            <span className="bg-blue-50 text-[#1e40af] text-[12px] px-3 py-1 rounded-full border border-blue-200 font-medium shadow-sm">
              אזור אישי
            </span>
          </div>

          {/* ─── צד שמאל: התראות, פעולות ומשתמש ─── */}
          <div className="flex items-center gap-4">
            
            <button
              onClick={() => setOpenSections((prev) => ({ ...prev, notifications: true }))}
              className="relative w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
              title="התראות ותזכורות"
            >
              <Bell className="w-5 h-5 text-gray-500" />
              {portalNotifications.filter((n) => !n.isRead).length > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {portalNotifications.filter((n) => !n.isRead).length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setIsBookingOpen(true)} 
              className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl transition-colors cursor-pointer text-[13px] border border-emerald-200 font-medium shadow-sm"
            >
              <CalendarPlus className="w-4 h-4 shrink-0" /> 
              <span className="hidden sm:inline">קביעת תור</span>
            </button>

            <button
              onClick={() => setOpenSections((prev) => ({ ...prev, digital: true }))}
              className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-[#1e40af] px-4 py-2 rounded-xl transition-colors cursor-pointer text-[13px] border border-blue-200 font-medium shadow-sm"
              title="מרפאה דיגיטלית"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">דיגיטל</span>
            </button>

            <div className="hidden lg:block w-px h-6 bg-gray-200"></div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-200 shadow-inner">
                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-[#1e40af]" />
                </div>
                <span className="text-gray-700 text-[13px] font-medium whitespace-nowrap">{ownerDisplayName}</span>
              </div>
              
              <button 
                onClick={() => navigate("/login")} 
                className="flex items-center gap-2 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all px-3 py-2 rounded-xl text-[13px] font-medium cursor-pointer"
              >
                <span className="hidden sm:inline">התנתקות</span>
                <LogOut className="w-4 h-4 shrink-0" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-gray-900 text-[26px] mb-1" style={{ fontWeight: 700 }}>
            שלום, {ownerDisplayName}<span className="inline-block mr-2">👋</span>
          </h1>
          <p className="text-gray-500 font-medium text-[15px]">כאן תוכלו לצפות בחיות שלכם, בתזכורות ובתיקים הרפואיים</p>
        </div>

        {isPortalLoading && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5 text-center text-gray-500 font-medium">
            טוען נתונים מ-Supabase...
          </div>
        )}

        {!isPortalLoading && portalError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-5 mb-5 text-[14px] font-medium">
            {portalError}
          </div>
        )}

        {/* ── Accordion Sections ── */}
        <div className="space-y-5">

          {/* ═══ 1. Notifications ═══ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection("notifications")}
              className="w-full px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-orange-50 rounded-xl p-2.5"><Bell className="w-5 h-5 text-orange-500" /></div>
                <div className="text-right">
                  <h2 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>מרכז התראות ותזכורות</h2>
                  <p className="text-gray-500 font-medium text-[12px]">{portalNotifications.length} התראות / תזכורות</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.notifications ? "rotate-180" : ""}`} />
            </button>

            {openSections.notifications && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                {portalNotifications.length === 0 && (
                  <div className="text-center py-8 text-gray-500 font-medium text-[14px]">אין כרגע התראות או תזכורות במסד הנתונים</div>
                )}
                {portalNotifications.map((notif) => {
                  const s = NOTIF_STYLE[notif.type];
                  return (
                    <div key={notif.id} className={`rounded-xl border border-gray-100 border-r-[3px] ${s.border} p-4 transition-all hover:shadow-sm`}>
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <img src={notif.petImage} alt={notif.petName} className="w-11 h-11 rounded-xl object-cover" />
                          <div className={`absolute -bottom-1 -left-1 w-5 h-5 rounded-md ${s.bg} flex items-center justify-center border-2 border-white`}>
                            <s.Icon className={`w-2.5 h-2.5 ${s.iconColor}`} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-900 text-[13px]" style={{ fontWeight: 700 }}>{notif.title}</span>
                            <span className="text-gray-300 text-[13px]">{notif.date}</span>
                          </div>
                          <p className="text-gray-500 text-[12px] mb-1" style={{ fontWeight: 600 }}>{notif.petName}</p>
                          <p className="text-gray-600 text-[13px] mb-3" style={{ lineHeight: 1.6 }}>{notif.text}</p>
                          <button onClick={() => setIsBookingOpen(true)} className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[12px] px-4 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm" style={{ fontWeight: 500 }}>
                            <Calendar className="w-3 h-3" /> קבע תור
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                  className="flex items-center gap-1.5 text-[#1e40af] text-[12px] hover:text-[#1e3a8a] cursor-pointer transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <PlusCircle className="w-3.5 h-3.5" /> פנייה חדשה
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.digital ? "rotate-180" : ""}`} />
              </div>
            </button>

            {openSections.digital && (
              <div className="border-t border-gray-100 bg-gradient-to-b from-blue-50/40 to-white p-4">
                {digitalError && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-[13px] font-medium">
                    {digitalError}
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
                  {/* Owner conversation sidebar */}
                  <div className="space-y-4">
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
                          disabled={creatingConversation || !ownerProfile || !newConversationSubject.trim()}
                          className={`w-full rounded-xl py-3 text-[13px] flex items-center justify-center gap-2 transition-colors shadow-sm ${creatingConversation || !newConversationSubject.trim() ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer"}`}
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
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[560px] flex flex-col">
                    {selectedDigitalConversation ? (
                      <>
                        <div className="px-5 py-4 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100">
                              <MessageCircle className="w-5 h-5 text-[#1e40af]" />
                            </div>
                            <div>
                              <h3 className="text-gray-900 text-[16px]" style={{ fontWeight: 800 }}>{selectedDigitalConversation.subject}</h3>
                              <p className="text-gray-500 text-[12px] mt-0.5">
                                {selectedDigitalConversation.petName} · {DIGITAL_STATUS_LABELS[selectedDigitalConversation.status]}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => chatFileInputRef.current?.click()}
                              disabled={uploadingChatFile}
                              className="flex items-center gap-1.5 border border-gray-200 hover:border-blue-200 hover:bg-blue-50 text-gray-600 hover:text-[#1e40af] rounded-xl px-3 py-2 text-[12px] transition-colors cursor-pointer disabled:opacity-60"
                              style={{ fontWeight: 700 }}
                            >
                              <Paperclip className="w-4 h-4" /> {uploadingChatFile ? "מעלה..." : "צירוף קובץ"}
                            </button>
                            <button
                              onClick={handleStartVideoSession}
                              disabled={startingVideo}
                              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2 text-[12px] transition-colors cursor-pointer disabled:opacity-60"
                              style={{ fontWeight: 700 }}
                            >
                              {startingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} {findLatestMeetUrl(digitalMessages) ? "הצטרף ל-Google Meet" : "בקש שיחת וידאו"}
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 bg-[#f8fafc] p-4 overflow-y-auto max-h-[430px] space-y-3">
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
                                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm border ${isOwner ? "bg-[#1e40af] text-white border-[#1e40af] rounded-br-md" : "bg-white text-gray-700 border-gray-100 rounded-bl-md"}`}>
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

                        <div className="border-t border-gray-100 p-4 bg-white">
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
                              disabled={!messageInput.trim() || sendingMessage}
                              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shrink-0 ${!messageInput.trim() || sendingMessage ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-[#1e40af] hover:bg-[#1e3a8a] text-white cursor-pointer shadow-sm"}`}
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
                  onClick={(e) => { e.stopPropagation(); setIsBookingOpen(true); }}
                  className="flex items-center gap-1.5 text-[#1e40af] text-[12px] hover:text-[#1e3a8a] cursor-pointer transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> תור חדש
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.appointments ? "rotate-180" : ""}`} />
              </div>
            </button>

            {openSections.appointments && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                {appointments.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 font-medium">
                    <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-[14px]">אין תורים עתידיים</p>
                    <button onClick={() => setIsBookingOpen(true)} className="mt-3 text-[#1e40af] text-[13px] hover:text-[#1e3a8a] cursor-pointer transition-colors" style={{ fontWeight: 500 }}>קבעו תור חדש</button>
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

            {openSections.pets && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {pets.map((pet) => {
                  const isExpanded = expandedPet === pet.id;
                  const PIcon = pet.type === "dog" ? Dog : Cat;
                  return (
                    <div key={pet.id} className="rounded-2xl border border-gray-100 overflow-hidden transition-all hover:shadow-sm">
                      {/* ── Pet Card Header ── */}
                      <div className="p-5 flex items-start gap-5">
                        <div className="relative shrink-0">
                          <img src={pet.image} alt={pet.name} className="w-[80px] h-[80px] rounded-2xl object-cover shadow-sm" />
                          <div className="absolute -bottom-1.5 -left-1.5 w-7 h-7 bg-white rounded-lg shadow-sm flex items-center justify-center border border-gray-100">
                            <PIcon className="w-4 h-4 text-[#1e40af]" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 mb-2">
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
                          <div className="flex items-center gap-2.5">
                            <button
                              onClick={() => setExpandedPet(isExpanded ? null : pet.id)}
                              className="flex items-center gap-2 bg-gradient-to-l from-[#1e40af] to-[#2563eb] hover:from-[#1e3a8a] hover:to-[#1e40af] text-white text-[13px] px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/15"
                              style={{ fontWeight: 600 }}
                            >
                              <FileText className="w-4 h-4" />
                              צפה בתיק הרפואי המלא
                              <ChevronLeft className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </button>
                            <button
                              onClick={() => exportOwnerMedicalRecord(pet, ownerDisplayName, appointments)}
                              className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-[12px] border border-transparent hover:border-emerald-200 w-fit"
                              style={{ fontWeight: 500 }}
                            >
                              <Download className="w-3.5 h-3.5" />
                              ייצוא תיק רפואי לאקסל
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
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
                          <div className="px-6 py-4 bg-gradient-to-l from-blue-50/60 to-white border-b border-gray-100">
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
                                        <button className="text-[#1e40af] text-[12px] hover:text-[#1e3a8a] hover:underline cursor-pointer transition-colors flex items-center gap-1" style={{ fontWeight: 500 }}>
                                          <Eye className="w-3.5 h-3.5" />
                                          צפה בסיכום
                                        </button>
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

                          <div className="px-6 py-4 bg-white border-t border-gray-100">
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

                          <div className="bg-gray-50/50 px-6 py-5">
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

          {/* ═══ 4. Documents & File Upload ═══ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => toggleSection("documents")}
              className="w-full px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-violet-50 rounded-xl p-2.5"><Paperclip className="w-5 h-5 text-violet-500" /></div>
                <div className="text-right">
                  <h2 className="text-gray-900 text-[17px]" style={{ fontWeight: 600 }}>מסמכים וקבצים</h2>
                  <p className="text-gray-500 font-medium text-[12px]">{uploadedFiles.length} קבצים בענן</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.documents ? "rotate-180" : ""}`} />
            </button>

            {openSections.documents && (
              <div className="border-t border-gray-100 p-5">
                {/* Upload controls */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-gray-600 text-[13px]" style={{ fontWeight: 500 }}>חיה:</label>
                    <select
                      value={uploadPetId}
                      onChange={(e) => setUploadPetId(Number(e.target.value))}
                      className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    >
                      {pets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-gray-600 text-[13px]" style={{ fontWeight: 500 }}>קטגוריה:</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    >
                      {FILE_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => { if (!isUploadingFiles && pets.length > 0) fileInputRef.current?.click(); }}
                  className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-5 ${
                    isDragging
                      ? "border-[#1e40af] bg-blue-50/60"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => { void processFiles(e.target.files); e.target.value = ""; }}
                  />
                  <div className={`w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center ${isDragging ? "bg-blue-100" : "bg-gray-100"}`}>
                    <Upload className={`w-7 h-7 ${isDragging ? "text-[#1e40af]" : "text-gray-500 font-medium"}`} />
                  </div>
                  <p className="text-gray-700 text-[15px] mb-1" style={{ fontWeight: 600 }}>
                    {isUploadingFiles ? "מעלה קבצים לענן..." : isDragging ? "שחררו כאן להעלאה" : "גררו קבצים לכאן או לחצו לבחירה"}
                  </p>
                  <p className="text-gray-500 font-medium text-[12px]">
                    תמונות, PDF, Word, Excel — עד 10MB לקובץ. הקבצים נשמרים ב-Supabase Storage
                  </p>
                </div>

                {/* Uploaded files list */}
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 font-medium">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-[14px]">לא נמצאו קבצים בענן</p>
                    <p className="text-[12px] mt-1">העלו תעודות חיסון, תוצאות בדיקות, מרשמים ועוד</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {uploadedFiles.map((file) => {
                      const FIcon = getFileIcon(file.type);
                      const pet = pets.find((p) => p.id === file.petId);
                      const PIcon = pet?.type === "dog" ? Dog : Cat;
                      return (
                        <div key={file.id} className="flex items-center gap-3 rounded-xl border border-gray-100 hover:border-violet-200 p-3.5 transition-all hover:shadow-sm group">
                          {/* Thumbnail / icon */}
                          {file.previewUrl ? (
                            <img src={file.previewUrl} alt={file.name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                              <FIcon className="w-5 h-5 text-violet-500" />
                            </div>
                          )}

                          {/* File info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-gray-900 text-[13px] truncate" style={{ fontWeight: 600 }}>{file.name}</span>
                              <span className="bg-violet-50 text-violet-600 text-[10px] px-2 py-0.5 rounded-full border border-violet-200 shrink-0" style={{ fontWeight: 500 }}>
                                {CATEGORY_LABELS[file.category] || file.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[13px] text-gray-500 font-medium">
                              <span className="flex items-center gap-1"><PIcon className="w-3 h-3" />{file.petName}</span>
                              <span>{formatFileSize(file.size)}</span>
                              <span>{file.uploadDate}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => file.type.startsWith("image/") && file.previewUrl ? setPreviewFile(file) : void handleOpenFile(file)}
                              className="p-2 rounded-lg hover:bg-blue-50 text-gray-500 font-medium hover:text-blue-600 transition-colors cursor-pointer"
                              title="צפייה / פתיחה"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleOpenFile(file)}
                              className="p-2 rounded-lg hover:bg-emerald-50 text-gray-500 font-medium hover:text-emerald-600 transition-colors cursor-pointer"
                              title="פתיחה בחלון חדש"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmFile(file)}
                              className="p-2 rounded-lg hover:bg-red-50 text-gray-500 font-medium hover:text-red-500 transition-colors cursor-pointer"
                              title="מחיקה"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

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
                <div className="flex gap-3 mt-2">
                  <button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime}
                    className={`flex-1 py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 ${rescheduleDate && rescheduleTime ? "bg-[#1e40af] hover:bg-[#1e3a8a] text-white" : "bg-gray-200 text-gray-500 font-medium cursor-not-allowed"}`}
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
            title="תשלום מאובטח - דמו"
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
                        זהו מסך תשלום דמו לפרויקט. אין להזין פרטי אשראי אמיתיים.
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
                      <span className="text-gray-800 text-[14px] font-semibold">כרטיס אשראי דמו</span>
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
                    במערכת אמיתית הכפתור היה מחובר לספק סליקה. בדמו הזה אנחנו מעדכנים את הרשומה בטבלת payments לסטטוס paid.
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
                    {payingPaymentId === paymentToPay.id ? "מעבד תשלום..." : "אישור תשלום דמו"}
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
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        pets={pets}
        ownerName={ownerDisplayName}
        ownerPhone={ownerProfile?.phone || ""}
        ownerEmail={ownerProfile?.email || ""}
        onAppointmentCreated={refreshPortalData}
      />

      {/* ── Image Preview Modal ── */}
      {previewFile && (
        <ModalOverlay onClose={() => setPreviewFile(null)} maxWidth="max-w-2xl" zIndex="z-[300]">
          <div className="relative">
            <button
              onClick={() => setPreviewFile(null)}
              className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewFile.previewUrl}
              alt={previewFile.name}
              className="w-full rounded-2xl object-contain max-h-[70vh]"
            />
            <div className="px-5 py-4 border-t border-gray-100">
              <p className="text-gray-900 text-[14px] truncate" style={{ fontWeight: 600 }}>{previewFile.name}</p>
              <p className="text-gray-500 font-medium text-[12px]">{previewFile.petName} · {CATEGORY_LABELS[previewFile.category]} · {previewFile.uploadDate}</p>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteConfirmFile && (
        <ModalOverlay onClose={() => setDeleteConfirmFile(null)} maxWidth="max-w-sm" zIndex="z-[300]">
          <div className="bg-red-50 px-6 py-5 flex flex-col items-center text-center border-b border-red-100">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>מחיקת קובץ</h3>
            <p className="text-gray-500 text-[13px]">האם למחוק את הקובץ?</p>
          </div>
          <div className="p-6">
            <div className="bg-gray-50 rounded-xl p-4 mb-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <File className="w-5 h-5 text-violet-500" />
              </div>
              <div className="min-w-0">
                <p className="text-gray-900 text-[13px] truncate" style={{ fontWeight: 600 }}>{deleteConfirmFile.name}</p>
                <p className="text-gray-500 font-medium text-[13px]">{deleteConfirmFile.petName} · {formatFileSize(deleteConfirmFile.size)}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => void handleDeleteFile(deleteConfirmFile)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Trash2 className="w-4 h-4" /> {deletingDocumentId === deleteConfirmFile.documentId ? "מוחק..." : "כן, מחקו"}
              </button>
              <button
                onClick={() => setDeleteConfirmFile(null)}
                className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]"
                style={{ fontWeight: 500 }}
              >
                ביטול
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <Footer />
    </div>
  );
}