import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  Loader2,
  MessageCircle,
  RefreshCw,
  Stethoscope,
  Video,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { getStaffType } from "../data/staffAuth";
import { useAppointmentStore, type CalendarAppointment } from "../data/AppointmentStore";

type StaffType = "vet" | "nurse" | "secretary";
type FlowItemTone = "blue" | "emerald" | "amber" | "rose" | "purple" | "gray";

type ConversationRow = {
  conversation_id: number | string;
  subject: string | null;
  status: string | null;
  priority: string | null;
  last_message_at: string | null;
};

type LabRow = {
  lab_order_id: number | string;
  test_name: string | null;
  status: string | null;
  is_urgent: boolean | null;
  result_status: string | null;
  ordered_date: string | null;
  test_date: string | null;
};

type HospitalizationRow = {
  hospitalization_id: number | string;
  department: string | null;
  cage_or_room: string | null;
  reason: string | null;
  severity: string | null;
  expected_discharge_at: string | null;
};

type PaymentRow = {
  payment_id: number | string;
  amount: number | string | null;
  status: string | null;
  due_date: string | null;
};

type FlowItem = {
  id: string;
  title: string;
  subtitle: string;
  tone?: FlowItemTone;
};

type FlowColumn = {
  id: string;
  title: string;
  description?: string;
  count: number;
  icon: typeof CalendarClock;
  tone: FlowItemTone;
  actionLabel: string;
  onOpen: () => void;
  items: FlowItem[];
  emptyText: string;
};

const toneClasses: Record<FlowItemTone, { card: string; icon: string; badge: string; item: string }> = {
  blue: {
    card: "border-blue-100 bg-blue-50/35",
    icon: "bg-blue-100 text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    item: "border-blue-100 bg-white",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50/35",
    icon: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    item: "border-emerald-100 bg-white",
  },
  amber: {
    card: "border-amber-100 bg-amber-50/45",
    icon: "bg-amber-100 text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    item: "border-amber-100 bg-white",
  },
  rose: {
    card: "border-rose-100 bg-rose-50/35",
    icon: "bg-rose-100 text-rose-700",
    badge: "bg-rose-100 text-rose-700",
    item: "border-rose-100 bg-white",
  },
  purple: {
    card: "border-purple-100 bg-purple-50/35",
    icon: "bg-purple-100 text-purple-700",
    badge: "bg-purple-100 text-purple-700",
    item: "border-purple-100 bg-white",
  },
  gray: {
    card: "border-gray-100 bg-gray-50/60",
    icon: "bg-gray-100 text-gray-700",
    badge: "bg-gray-100 text-gray-700",
    item: "border-gray-100 bg-white",
  },
};

function isSameDay(appt: CalendarAppointment, date: Date) {
  return appt.day === date.getDate() && appt.month === date.getMonth() && appt.year === date.getFullYear();
}

function appointmentDate(appt: CalendarAppointment) {
  const [hours, minutes] = appt.time.split(":").map(Number);
  return new Date(appt.year, appt.month, appt.day, hours || 0, minutes || 0, 0, 0);
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function formatMoney(value: PaymentRow["amount"]) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "סכום לא צוין";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(num);
}

function priorityWeight(priority?: string | null) {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
}

function severityTone(severity?: string | null): FlowItemTone {
  if (severity === "critical") return "rose";
  if (severity === "serious") return "amber";
  return "blue";
}

function statusLabel(status?: string | null) {
  if (status === "waiting_owner") return "ממתין ללקוח";
  if (status === "waiting_staff") return "ממתין לצוות";
  if (status === "open") return "פתוח";
  if (status === "partial") return "שולם חלקית";
  if (status === "unpaid") return "פתוח לתשלום";
  return status || "לטיפול";
}

function isEmptyValue(value?: string | null) {
  const clean = String(value || "").trim();
  return !clean || clean === "—" || clean === "-" || clean === "לא שובץ" || clean === "טרם שובץ";
}

function isUrgentAppointment(appt: CalendarAppointment) {
  const text = `${appt.type || ""} ${appt.notes || ""}`.toLowerCase();
  return text.includes("דחוף") || text.includes("חירום") || text.includes("urgent");
}

function appointmentActionReason(appt: CalendarAppointment) {
  if (appt.appointmentMode === "video") return "חסר קישור וידאו";
  if (isEmptyValue(appt.vet)) return "חסר שיבוץ רופא";
  if (appt.appointmentMode === "physical" && isEmptyValue(appt.room)) return "חסר חדר/מיקום";
  if (isUrgentAppointment(appt)) return "מסומן כדחוף";
  return "דורש בדיקה ביומן";
}

function appointmentActionTone(appt: CalendarAppointment): FlowItemTone {
  if (isUrgentAppointment(appt)) return "rose";
  if (appt.appointmentMode === "video") return "purple";
  if (isEmptyValue(appt.vet) || isEmptyValue(appt.room)) return "amber";
  return "blue";
}

function getWorkloadLabel(totalOpenWork: number) {
  if (totalOpenWork === 0) return "הכול מסודר";
  if (totalOpenWork <= 5) return "בשליטה";
  if (totalOpenWork <= 12) return "דורש מעקב";
  return "עומס גבוה";
}

function getWorkloadTone(totalOpenWork: number) {
  if (totalOpenWork === 0) return "bg-emerald-100 text-emerald-700";
  if (totalOpenWork <= 5) return "bg-blue-100 text-blue-700";
  if (totalOpenWork <= 12) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

async function safeQuery<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    console.warn("Flowboard section could not load", error);
    return [];
  }
  return data || [];
}

function buildAppointmentActionItems(appointments: CalendarAppointment[], staffType: StaffType): FlowItem[] {
  return appointments.slice(0, 4).map((appt) => ({
    id: `appointment-${appt.id}`,
    title: `${appt.time} · ${appt.appointmentMode === "video" ? "תור וידאו" : appt.type || "תור"}`,
    subtitle:
      staffType === "secretary"
        ? `${appointmentActionReason(appt)} · ${appt.petName}`
        : `${appointmentActionReason(appt)} · ${appt.department || "כללי"}`,
    tone: appointmentActionTone(appt),
  }));
}

function buildDigitalItems(conversations: ConversationRow[]): FlowItem[] {
  return conversations.slice(0, 4).map((conversation) => ({
    id: `conversation-${conversation.conversation_id}`,
    title: conversation.subject || "פנייה ללא נושא",
    subtitle: statusLabel(conversation.status),
    tone: conversation.priority === "urgent" || conversation.priority === "high" ? "rose" : "purple",
  }));
}

function buildLabItems(labs: LabRow[]): FlowItem[] {
  return labs.slice(0, 4).map((lab) => ({
    id: `lab-${lab.lab_order_id}`,
    title: lab.test_name || "בדיקת מעבדה",
    subtitle: lab.test_date ? `תאריך בדיקה ${formatDate(lab.test_date)}` : statusLabel(lab.status),
    tone: lab.is_urgent || lab.result_status === "abnormal" ? "rose" : "amber",
  }));
}

function buildHospitalItems(hospitalizations: HospitalizationRow[], staffType: StaffType): FlowItem[] {
  return hospitalizations.slice(0, 4).map((hospitalization) => ({
    id: `hospitalization-${hospitalization.hospitalization_id}`,
    title: hospitalization.department || "אשפוז פעיל",
    subtitle:
      staffType === "secretary"
        ? hospitalization.cage_or_room ? `מיקום: ${hospitalization.cage_or_room}` : "דורש מעקב"
        : hospitalization.expected_discharge_at
          ? `שחרור צפוי ${formatDate(hospitalization.expected_discharge_at)}`
          : hospitalization.reason || "ללא תאריך שחרור צפוי",
    tone: severityTone(hospitalization.severity),
  }));
}

function buildPaymentItems(payments: PaymentRow[]): FlowItem[] {
  return payments.slice(0, 4).map((payment) => ({
    id: `payment-${payment.payment_id}`,
    title: formatMoney(payment.amount),
    subtitle: payment.due_date ? `לתשלום עד ${formatDate(payment.due_date)}` : statusLabel(payment.status),
    tone: payment.status === "partial" ? "amber" : "rose",
  }));
}

export function ClinicFlowboard() {
  const navigate = useNavigate();
  const staffType = getStaffType();
  const { calendarAppointments, isLoading: isLoadingAppointments, refreshAppointments } = useAppointmentStore();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HospitalizationRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadWarning, setHasLoadWarning] = useState(false);

  const appointmentTasks = useMemo(() => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return (calendarAppointments || [])
      .filter((appt) => {
        const date = appointmentDate(appt);
        if (date.getTime() < now.getTime() - 15 * 60 * 1000) return false;
        if (date.getTime() > sevenDaysFromNow.getTime()) return false;

        return (
          appt.appointmentMode === "video" ||
          isEmptyValue(appt.vet) ||
          (appt.appointmentMode === "physical" && isEmptyValue(appt.room)) ||
          isUrgentAppointment(appt)
        );
      })
      .sort((a, b) => appointmentDate(a).getTime() - appointmentDate(b).getTime());
  }, [calendarAppointments]);

  const loadFlowboard = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    setHasLoadWarning(false);

    try {
      const [conversationRows, labRows, hospitalizationRows, paymentRows] = await Promise.all([
        safeQuery<ConversationRow>(
          supabase
            .from("conversations")
            .select("conversation_id, subject, status, priority, last_message_at")
            .neq("status", "closed")
            .order("last_message_at", { ascending: false })
            .limit(30)
        ),
        safeQuery<LabRow>(
          supabase
            .from("lab_orders")
            .select("lab_order_id, test_name, status, is_urgent, result_status, ordered_date, test_date")
            .order("ordered_date", { ascending: false })
            .limit(50)
        ),
        safeQuery<HospitalizationRow>(
          supabase
            .from("hospitalizations")
            .select("hospitalization_id, department, cage_or_room, reason, severity, expected_discharge_at")
            .eq("status", "active")
            .order("admitted_at", { ascending: false })
            .limit(30)
        ),
        safeQuery<PaymentRow>(
          supabase
            .from("payments")
            .select("payment_id, amount, status, due_date")
            .in("status", ["unpaid", "partial"])
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(30)
        ),
      ]);

      setConversations(conversationRows.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority)));
      setLabs(
        labRows
          .filter((lab) => !["completed", "cancelled", "done"].includes(String(lab.status || "").toLowerCase()))
          .sort((a, b) => Number(Boolean(b.is_urgent || b.result_status === "abnormal")) - Number(Boolean(a.is_urgent || a.result_status === "abnormal")))
      );
      setHospitalizations(hospitalizationRows);
      setPayments(paymentRows);
    } catch (error) {
      console.warn("Could not load clinic flowboard", error);
      setHasLoadWarning(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAppointments();
    void loadFlowboard(true);

    const channel = supabase
      .channel("myvet-flowboard-live-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => void refreshAppointments())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => void loadFlowboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => void loadFlowboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => void loadFlowboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "hospitalizations" }, () => void loadFlowboard(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void loadFlowboard(false))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadFlowboard, refreshAppointments]);

  const columns = useMemo<FlowColumn[]>(() => {
    const appointmentColumn: FlowColumn = {
      id: "appointments",
      title: staffType === "secretary" ? "תורים שדורשים תיאום" : "תורים שדורשים תשומת לב",
      description: "",
      count: appointmentTasks.length,
      icon: CalendarClock,
      tone: "blue",
      actionLabel: "פתח יומן",
      onOpen: () => navigate("/appointments"),
      items: buildAppointmentActionItems(appointmentTasks, staffType),
      emptyText: "אין משימות פתוחות כרגע",
    };

    const digitalColumn: FlowColumn = {
      id: "digital",
      title: "פניות דיגיטליות",
      description: "",
      count: conversations.length,
      icon: staffType === "secretary" ? MessageCircle : Video,
      tone: "purple",
      actionLabel: "פתח דיגיטל",
      onOpen: () => navigate("/digital-care"),
      items: buildDigitalItems(conversations),
      emptyText: "אין פניות פתוחות כרגע",
    };

    const hospitalColumn: FlowColumn = {
      id: "hospitalizations",
      title: staffType === "secretary" ? "אשפוזים פעילים" : "מאושפזים למעקב",
      description: "",
      count: hospitalizations.length,
      icon: BedDouble,
      tone: "amber",
      actionLabel: "פתח מטופלים",
      onOpen: () => navigate("/patients"),
      items: buildHospitalItems(hospitalizations, staffType),
      emptyText: "אין מאושפזים פעילים",
    };

    if (staffType === "secretary") {
      return [
        appointmentColumn,
        digitalColumn,
        {
          id: "payments",
          title: "גבייה למעקב",
          description: "",
          count: payments.length,
          icon: CreditCard,
          tone: "rose",
          actionLabel: "פתח דוחות",
          onOpen: () => navigate("/reports"),
          items: buildPaymentItems(payments),
          emptyText: "אין תשלומים פתוחים למעקב",
        },
        hospitalColumn,
      ];
    }

    return [
      appointmentColumn,
      {
        id: "labs",
        title: staffType === "nurse" ? "מעבדה ותוצאות" : "בדיקות שממתינות",
        description: "",
        count: labs.length,
        icon: FlaskConical,
        tone: "amber",
        actionLabel: "פתח דוחות מעבדה",
        onOpen: () => navigate("/reports"),
        items: buildLabItems(labs),
        emptyText: "אין בדיקות פתוחות כרגע",
      },
      hospitalColumn,
      digitalColumn,
    ];
  }, [appointmentTasks, conversations, hospitalizations, labs, navigate, payments, staffType]);

  const totalOpenWork = columns.reduce((sum, column) => sum + column.count, 0);

  return (
    <section className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1e40af]/10 text-[#1e40af] flex items-center justify-center shrink-0">
            <ClipboardIcon />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-gray-900 text-[20px] font-bold">לוח עבודה יומי</h2>
              <span className={`px-2.5 py-1 rounded-full text-[12px] font-bold ${getWorkloadTone(totalOpenWork)}`}>
                {totalOpenWork === 0 ? "אין משימות" : `${getWorkloadLabel(totalOpenWork)} · ${totalOpenWork} משימות`}
              </span>
            </div>
            <p className="text-gray-500 text-[14px] mt-1">משימות פתוחות להיום</p>
          </div>
        </div>
        <div className="self-start lg:self-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshAppointments();
              void loadFlowboard(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-[14px] font-semibold"
          >
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
          <button
            type="button"
            onClick={() => navigate("/appointments")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-[14px] font-semibold"
          >
            פתח יומן תורים <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(isLoading || isLoadingAppointments) ? (
        <div className="px-6 py-10 flex items-center justify-center gap-3 text-gray-500 text-[14px]">
          <Loader2 className="w-5 h-5 animate-spin" /> טוען משימות...
        </div>
      ) : (
        <>
          {hasLoadWarning && (
            <div className="mx-6 mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-700 text-[13px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> לא הצלחנו לטעון את כל הנתונים. אפשר לרענן ולנסות שוב.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-5">
            {columns.map((column) => {
              const Icon = column.icon;
              const classes = toneClasses[column.tone];
              return (
                <article key={column.id} className={`rounded-2xl border ${classes.card} p-4 flex flex-col min-h-[280px]`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl ${classes.icon} flex items-center justify-center shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-gray-900 text-[15px] font-bold truncate">{column.title}</h3>
                        {column.description && (
                          <p className="text-gray-500 text-[12px] leading-relaxed mt-0.5">{column.description}</p>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[12px] font-bold ${classes.badge}`}>{column.count}</span>
                  </div>

                  <div className="mt-4 space-y-2 flex-1">
                    {column.items.length === 0 ? (
                      <div className="h-full min-h-[130px] rounded-2xl border border-dashed border-gray-200 bg-white/70 flex flex-col items-center justify-center text-center px-4">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-2" />
                        <p className="text-gray-500 text-[13px] font-medium">{column.emptyText}</p>
                      </div>
                    ) : (
                      column.items.map((item) => {
                        const itemClasses = toneClasses[item.tone || column.tone];
                        return (
                          <div key={item.id} className={`rounded-xl border ${itemClasses.item} px-3 py-2.5`}>
                            <p className="text-gray-900 text-[13px] font-bold truncate">{item.title}</p>
                            <p className="text-gray-500 text-[12px] mt-0.5 truncate">{item.subtitle}</p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={column.onOpen}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 px-3 py-2.5 text-[13px] font-bold text-gray-700 transition-colors"
                  >
                    {column.actionLabel} <ArrowLeft className="w-4 h-4" />
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ClipboardIcon() {
  return <Stethoscope className="w-6 h-6" />;
}
