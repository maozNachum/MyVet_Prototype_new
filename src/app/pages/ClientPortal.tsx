import { useState, useRef, useCallback } from "react";
import {
  LogOut, Dog, Cat, Calendar,
  AlertTriangle, Info, FileText, ChevronLeft, ChevronDown,
  Syringe, Stethoscope, Scissors, Heart, User,
  CalendarPlus, Clock, MapPin, Trash2, CalendarClock, Bell, X,
  Download, Upload, File, Image, Paperclip, Eye,
  Receipt, CheckCircle2, CreditCard, AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ChatWidget } from "../components/ChatWidget";
import { OwnerBookAppointment } from "../components/OwnerBookAppointment";
import { useAppointmentStore } from "../data/AppointmentStore";
import { NotificationPanel } from "../components/shared/NotificationPanel";
import { SuccessMessage } from "../components/shared/SuccessMessage";
import { PillPicker } from "../components/shared/PillPicker";
import { ModalOverlay, ModalHeader } from "../components/shared/ModalOverlay";
import { AVAILABLE_DATE_STRINGS, AVAILABLE_TIMES } from "../data/calendar-constants";
import { exportOwnerMedicalRecord } from "../hooks/useExportOwnerRecord";
import { MyVetLogo } from "../components/MyVetLogo";
import { ClientMedicalReports } from "../components/ClientMedicalReports";

// ─── Assets ──────────────────────────────────────────────────────────
const dogImg = "https://images.unsplash.com/photo-1609348490161-a879e4327ae9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb2xkZW4lMjByZXRyaWV2ZXIlMjBkb2clMjBoYXBweSUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MjM3NDQxMXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";
const catImg = "https://images.unsplash.com/photo-1767446516607-02cb627b342f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjdXRlJTIwY2F0JTIwcG9ydHJhaXQlMjBjbG9zZSUyMHVwfGVufDF8fHx8MTc3MjM5MzMzMHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

// ─── Types ───────────────────────────────────────────────────────────
interface PortalNotification {
  id: number; petName: string; petType: "dog" | "cat"; petImage: string;
  text: string; type: "warning" | "info" | "success"; date: string;
}

interface Pet {
  id: number; name: string; type: "dog" | "cat"; image: string;
  breed: string; age: number; gender: string; weight: string;
  lastVisit: string; nextVaccine: string;
  medicalHistory: { id: number; date: string; title: string; vet: string; icon: typeof Syringe; color: string }[];
}

interface FutureAppointment {
  id: number; petName: string; petType: "dog" | "cat"; petImage: string;
  date: string; time: string; type: string; vet: string; room: string; notes: string;
}

interface UploadedFile {
  id: number;
  name: string;
  size: number;
  type: string;
  petId: number;
  petName: string;
  category: string;
  uploadDate: string;
  previewUrl?: string;
}

const FILE_CATEGORIES = [
  { key: "vaccination", label: "תעודת חיסון" },
  { key: "lab", label: "תוצאות מעבדה" },
  { key: "insurance", label: "ביטוח" },
  { key: "prescription", label: "מרשם" },
  { key: "xray", label: "צילום רנטגן" },
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

// ─── Visit Summaries per pet ──────────────────────────────────────────
interface VisitSummary {
  id: number;
  date: string;
  title: string;
  status: "paid" | "unpaid";
  amount: number;
}

const petVisitSummaries: Record<number, VisitSummary[]> = {
  1: [ // רקס
    { id: 1, date: "25/02/2026", title: "חיסון שנתי ובדיקה כללית",  status: "paid",   amount: 320 },
    { id: 2, date: "10/11/2025", title: "בדיקה כללית ובדיקת דם",    status: "paid",   amount: 190 },
    { id: 3, date: "05/06/2025", title: "סירוס וטיפול מונע",         status: "paid",   amount: 650 },
  ],
  2: [ // ניקו
    { id: 1, date: "15/03/2026", title: "חיסון מרובע ובדיקה שגרתית", status: "paid",   amount: 250 },
    { id: 2, date: "01/03/2026", title: "טיפול שיניים וניקוי אבן",   status: "unpaid", amount: 800 },
    { id: 3, date: "10/01/2025", title: "טיפול מונע תולעים",          status: "paid",   amount: 120 },
  ],
};

// ─── Static Data ─────────────────────────────────────────────────────
const portalNotifications: PortalNotification[] = [
  { id: 1, petName: "רקס", petType: "dog", petImage: dogImg, text: "תזכורת: חיסון כלבת בעוד חודש", type: "warning", date: "02/04/2026" },
  { id: 2, petName: "ניקו", petType: "cat", petImage: catImg, text: "ביקורת שגרתית לאחר טיפול תולעים", type: "info", date: "15/03/2026" },
  { id: 3, petName: "רקס", petType: "dog", petImage: dogImg, text: "תוצאות בדיקת דם מוכנות לצפייה", type: "success", date: "01/03/2026" },
];

const pets: Pet[] = [
  {
    id: 1, name: "רקס", type: "dog", image: dogImg, breed: "גולדן רטריבר",
    age: 4, gender: "זכר", weight: "32 ק״ג", lastVisit: "25/02/2026", nextVaccine: "02/04/2026",
    medicalHistory: [
      { id: 1, date: "25/02/2026", title: "חיסון שנתי", vet: 'ד"ר יוסי כהן', icon: Syringe, color: "bg-blue-50 text-blue-600 border-blue-200" },
      { id: 2, date: "10/11/2025", title: "בדיקה כללית", vet: 'ד"ר שרה לוי', icon: Stethoscope, color: "bg-amber-50 text-amber-600 border-amber-200" },
      { id: 3, date: "05/06/2025", title: "סירוס", vet: 'ד"ר דוד מזרחי', icon: Scissors, color: "bg-purple-50 text-purple-600 border-purple-200" },
    ],
  },
  {
    id: 2, name: "ניקו", type: "cat", image: catImg, breed: "מעורב",
    age: 3, gender: "זכר", weight: "4.8 ק״ג", lastVisit: "18/02/2026", nextVaccine: "15/05/2026",
    medicalHistory: [
      { id: 1, date: "18/02/2026", title: "טיפול תולעים", vet: 'ד"ר שרה לוי', icon: Heart, color: "bg-pink-50 text-pink-600 border-pink-200" },
      { id: 2, date: "01/01/2026", title: "חיסון משושה", vet: 'ד"ר יוסי כהן', icon: Syringe, color: "bg-blue-50 text-blue-600 border-blue-200" },
    ],
  },
];

// ─── Notification style mapping ──────────────────────────────────────
const NOTIF_STYLE = {
  warning: { border: "border-r-orange-400", bg: "bg-orange-50", iconColor: "text-orange-500", Icon: AlertTriangle },
  info:    { border: "border-r-blue-400",   bg: "bg-blue-50",   iconColor: "text-blue-500",   Icon: Info },
  success: { border: "border-r-emerald-400", bg: "bg-emerald-50", iconColor: "text-emerald-500", Icon: FileText },
} as const;

// ─── PillPicker data ─────────────────────────────────────────────────
const datePills = AVAILABLE_DATE_STRINGS.map((d) => ({ key: d.value, label: d.label }));
const timePills = AVAILABLE_TIMES.map((t) => ({ key: t, label: t }));

// ─── Component ───────────────────────────────────────────────────────
export function ClientPortal() {
  const navigate = useNavigate();
  const store = useAppointmentStore();
  const ownerNotifs = store.notifications.filter((n) => n.target === "owner");
  const ownerUnread = store.unreadCount("owner");

  const [expandedPet, setExpandedPet] = useState<number | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Section accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    notifications: true,
    appointments: true, // שיניתי לברירת מחדל פתוח שיהיה קל לראות את התורים מה-Store
    pets: false,
    documents: false,
  });
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // 1. מיפוי דינמי של התורים מה-Store במקום State מקומי
  const appointments: FutureAppointment[] = store.calendarAppointments
    .filter((a) => a.ownerName === "יוסי כהן") // סינון לפי משתמש
    .map((a) => ({
      id: a.id,
      petName: a.petName,
      petType: a.petSpecies,
      petImage: a.petSpecies === "dog" ? dogImg : catImg,
      date: `${String(a.day).padStart(2, '0')}/${String(a.month).padStart(2, '0')}/${a.year}`,
      time: a.time,
      type: a.type,
      vet: a.vet,
      room: a.room,
      notes: a.notes,
    }));

  const [rescheduleAppt, setRescheduleAppt] = useState<FutureAppointment | null>(null);
  const [cancelAppt, setCancelAppt] = useState<FutureAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  // 2. עדכון להזזת תור מול ה-Store
  const handleReschedule = async () => {
    if (!rescheduleAppt || !rescheduleDate || !rescheduleTime) return;
    
    // מפענח את התאריך החדש
    const [dayStr, monthStr, yearStr] = rescheduleDate.split("/");
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    try {
      await store.rescheduleAppointment(
        rescheduleAppt.id,
        day, month, year,
        rescheduleTime, rescheduleTime, // (endTime)
        "owner"
      );
      
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
      await store.deleteAppointment(cancelAppt.id, "owner");
      setCancelSuccess(true);
      setTimeout(() => { 
        setCancelSuccess(false); 
        setCancelAppt(null); 
      }, 1800);
    } catch (e) {
      console.error("Failed to cancel", e);
    }
  };

  // File upload state (נשאר ללא שינוי בדיוק כפי שביקשת)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadPetId, setUploadPetId] = useState<number>(pets[0].id);
  const [uploadCategory, setUploadCategory] = useState<string>("other");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<UploadedFile | null>(null);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const maxSize = 10 * 1024 * 1024; // 10 MB
    const pet = pets.find((p) => p.id === uploadPetId);
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const newFiles: UploadedFile[] = [];
    Array.from(files).forEach((file) => {
      if (file.size > maxSize) {
        alert(`הקובץ "${file.name}" גדול מדי (מקסימום 10MB)`);
        return;
      }
      const entry: UploadedFile = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        petId: uploadPetId,
        petName: pet?.name || "",
        category: uploadCategory,
        uploadDate: dateStr,
      };
      if (file.type.startsWith("image/")) {
        entry.previewUrl = URL.createObjectURL(file);
      }
      newFiles.push(entry);
    });
    setUploadedFiles((prev) => [...newFiles, ...prev]);
  }, [uploadPetId, uploadCategory]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDeleteFile = (id: number) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
    setDeleteConfirmFile(null);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f8f9fb]" style={{ fontFamily: "'Heebo', sans-serif" }}>
      
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 w-full">
        <div className="w-full px-6 h-16 flex items-center justify-between">
          
          {/* ─── צד ימין: לוגו ותגית ─── */}
          <div className="flex items-center gap-5">
            <div className="flex items-center shrink-0 mr-2 cursor-pointer hover:opacity-90 transition-opacity">
              {/* הלוגו המקורי בפרופורציה מלאה (סמל + טקסט מובנה), ללא קופסאות או טקסטים כפולים לידו */}
              <MyVetLogo color="#1e40af" className="h-12 w-auto" />
            </div>

            <div className="hidden md:block w-px h-6 bg-gray-200"></div>

            <span className="bg-blue-50 text-[#1e40af] text-[12px] px-3 py-1 rounded-full border border-blue-200 font-medium shadow-sm">
              אזור אישי
            </span>
          </div>

          {/* ─── צד שמאל: התראות, פעולות ומשתמש ─── */}
          <div className="flex items-center gap-4">
            
            <NotificationPanel
              notifications={ownerNotifs}
              unreadCount={ownerUnread}
              onMarkAllRead={() => store.markAllRead("owner")}
              onDismiss={(id) => store.dismissNotification(id)}
              title="עדכונים מהמרפאה"
              emptyText="אין עדכונים מהמרפאה"
            />

            <button 
              onClick={() => setIsBookingOpen(true)} 
              className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl transition-colors cursor-pointer text-[13px] border border-emerald-200 font-medium shadow-sm"
            >
              <CalendarPlus className="w-4 h-4 shrink-0" /> 
              <span className="hidden sm:inline">קביעת תור</span>
            </button>

            <div className="hidden lg:block w-px h-6 bg-gray-200"></div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-200 shadow-inner">
                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-[#1e40af]" />
                </div>
                <span className="text-gray-700 text-[13px] font-medium whitespace-nowrap">משפחת ישראלי</span>
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
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-gray-900 text-[26px] mb-1" style={{ fontWeight: 700 }}>
            שלום, משפחת ישראלי<span className="inline-block mr-2">👋</span>
          </h1>
          <p className="text-gray-500 font-medium text-[15px]">כאן תוכלו לצפות בחיות שלכם, בתזכורות ובתיקים הרפואיים</p>
        </div>

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
                  <p className="text-gray-500 font-medium text-[12px]">{portalNotifications.length} התראות חדשות</p>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-500 font-medium transition-transform duration-200 ${openSections.notifications ? "rotate-180" : ""}`} />
            </button>

            {openSections.notifications && (
              <div className="border-t border-gray-100 p-4 space-y-3">
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
                            <span className="text-gray-900 text-[13px]" style={{ fontWeight: 600 }}>{notif.petName}</span>
                            <span className="text-gray-300 text-[13px]">{notif.date}</span>
                          </div>
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

          {/* ═══ 2. Future Appointments ═══ */}
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
                              onClick={() => exportOwnerMedicalRecord(pet, "משפחת ישראלי", appointments)}
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
                            className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 text-[12px] px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                            style={{ fontWeight: 500 }}
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
                                  {(petVisitSummaries[pet.id] ?? []).length} ביקורים
                                </span>
                              </div>
                              {(petVisitSummaries[pet.id] ?? []).some((v) => v.status === "unpaid") && (
                                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                  <span className="text-red-600 text-[12px]" style={{ fontWeight: 600 }}>
                                    חוב פתוח: ₪{(petVisitSummaries[pet.id] ?? []).filter((v) => v.status === "unpaid").reduce((s, v) => s + v.amount, 0).toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="divide-y divide-gray-100">
                              {(petVisitSummaries[pet.id] ?? []).map((visit) => (
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
                                        <button className="flex items-center gap-1.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[12px] px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm shadow-blue-500/15" style={{ fontWeight: 600 }}>
                                          <CreditCard className="w-3.5 h-3.5" />
                                          שלם עכשיו
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
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
                  <p className="text-gray-500 font-medium text-[12px]">{uploadedFiles.length} קבצים הועלו</p>
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
                  onClick={() => fileInputRef.current?.click()}
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
                    onChange={(e) => { processFiles(e.target.files); e.target.value = ""; }}
                  />
                  <div className={`w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center ${isDragging ? "bg-blue-100" : "bg-gray-100"}`}>
                    <Upload className={`w-7 h-7 ${isDragging ? "text-[#1e40af]" : "text-gray-500 font-medium"}`} />
                  </div>
                  <p className="text-gray-700 text-[15px] mb-1" style={{ fontWeight: 600 }}>
                    {isDragging ? "שחררו כאן להעלאה" : "גררו קבצים לכאן או לחצו לבחירה"}
                  </p>
                  <p className="text-gray-500 font-medium text-[12px]">
                    תמונות, PDF, Word, Excel — עד 10MB לקובץ
                  </p>
                </div>

                {/* Uploaded files list */}
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 font-medium">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-[14px]">לא הועלו קבצים עדיין</p>
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
                            {file.previewUrl && (
                              <button
                                onClick={() => setPreviewFile(file)}
                                className="p-2 rounded-lg hover:bg-blue-50 text-gray-500 font-medium hover:text-blue-600 transition-colors cursor-pointer"
                                title="צפייה"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
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

      <OwnerBookAppointment isOpen={isBookingOpen} onClose={() => setIsBookingOpen(false)} />

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
                onClick={() => handleDeleteFile(deleteConfirmFile.id)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Trash2 className="w-4 h-4" /> כן, מחקו
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

      <ChatWidget mode="owner" />
    </div>
  );
}