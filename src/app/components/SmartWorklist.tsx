import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  Loader2,
  MessageCircle,
  PackageSearch,
  RefreshCw,
  Video,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { getStaffType, type StaffType } from "../data/staffAuth";

type WorklistTone = "blue" | "emerald" | "amber" | "rose" | "purple" | "gray";

type WorklistAction = {
  id: string;
  title: string;
  subtitle: string;
  label: string;
  path: string;
  priority: number;
  tone: WorklistTone;
  icon: typeof CalendarClock;
};

const toneClasses: Record<WorklistTone, { card: string; icon: string; button: string; badge: string }> = {
  blue: {
    card: "border-blue-100 bg-blue-50/40",
    icon: "bg-blue-100 text-blue-700",
    button: "bg-blue-600 hover:bg-blue-700 text-white",
    badge: "bg-blue-100 text-blue-700",
  },
  emerald: {
    card: "border-emerald-100 bg-emerald-50/40",
    icon: "bg-emerald-100 text-emerald-700",
    button: "bg-emerald-600 hover:bg-emerald-700 text-white",
    badge: "bg-emerald-100 text-emerald-700",
  },
  amber: {
    card: "border-amber-100 bg-amber-50/45",
    icon: "bg-amber-100 text-amber-700",
    button: "bg-amber-500 hover:bg-amber-600 text-white",
    badge: "bg-amber-100 text-amber-700",
  },
  rose: {
    card: "border-rose-100 bg-rose-50/45",
    icon: "bg-rose-100 text-rose-700",
    button: "bg-rose-600 hover:bg-rose-700 text-white",
    badge: "bg-rose-100 text-rose-700",
  },
  purple: {
    card: "border-purple-100 bg-purple-50/45",
    icon: "bg-purple-100 text-purple-700",
    button: "bg-purple-600 hover:bg-purple-700 text-white",
    badge: "bg-purple-100 text-purple-700",
  },
  gray: {
    card: "border-gray-100 bg-gray-50/70",
    icon: "bg-gray-100 text-gray-700",
    button: "bg-gray-700 hover:bg-gray-800 text-white",
    badge: "bg-gray-100 text-gray-700",
  },
};

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  return { startIso: start.toISOString(), endIso: end.toISOString(), todayKey: start.toISOString().slice(0, 10) };
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function isOpenStatus(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  return normalized !== "closed" && normalized !== "completed" && normalized !== "done" && normalized !== "paid" && normalized !== "cancelled" && normalized !== "refunded";
}

async function safeSelect<T = any>(query: PromiseLike<{ data: T[] | null; error: any }>, fallback: T[] = []) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return data || fallback;
  } catch (error) {
    console.warn("SmartWorklist query failed", error);
    return fallback;
  }
}

export function SmartWorklist() {
  const navigate = useNavigate();
  const role: StaffType = getStaffType();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [hospitalizations, setHospitalizations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    const { startIso, endIso } = todayRange();

    const [appointmentsData, conversationsData, labData, hospitalizationData, paymentData, inventoryData] = await Promise.all([
      safeSelect(
        supabase
          .from("appointments")
          .select("appointment_id, start_time, appointment_type, appointment_mode, vet_name, room, department, notes, status")
          .neq("status", "cancelled")
          .gte("start_time", startIso)
          .lte("start_time", endIso)
          .order("start_time", { ascending: true })
          .limit(80)
      ),
      safeSelect(
        supabase
          .from("conversations")
          .select("conversation_id, subject, status, priority, last_message_at")
          .neq("status", "closed")
          .order("last_message_at", { ascending: false })
          .limit(40)
      ),
      safeSelect(
        supabase
          .from("lab_orders")
          .select("lab_order_id, test_name, status, is_urgent, result_status, ordered_date, test_date")
          .order("ordered_date", { ascending: true })
          .limit(50)
      ),
      safeSelect(
        supabase
          .from("hospitalizations")
          .select("hospitalization_id, status, severity, department, cage_or_room, expected_discharge_at, reason")
          .eq("status", "active")
          .order("admitted_at", { ascending: true })
          .limit(40)
      ),
      safeSelect(
        supabase
          .from("payments")
          .select("payment_id, status, amount, due_date")
          .in("status", ["unpaid", "partial"])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(40)
      ),
      safeSelect(
        supabase
          .from("inventory")
          .select("item_id, item_name, category, stock_quantity")
          .order("stock_quantity", { ascending: true })
          .limit(50)
      ),
    ]);

    setAppointments(appointmentsData);
    setConversations(conversationsData);
    setLabOrders(labData);
    setHospitalizations(hospitalizationData);
    setPayments(paymentData);
    setInventory(inventoryData);
    setLastUpdated(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const actions = useMemo<WorklistAction[]>(() => {
    const next: WorklistAction[] = [];
    const { todayKey } = todayRange();
    const canSeeMedical = role === "clinic_admin" || role === "vet" || role === "nurse";
    const canSeePayments = role === "clinic_admin" || role === "secretary" || role === "vet";

    const videoAppointments = appointments.filter((appointment) => appointment.appointment_mode === "video");
    const todayVideo = videoAppointments.filter((appointment) => String(appointment.start_time || "").startsWith(todayKey));
    if (todayVideo.length > 0) {
      const first = todayVideo[0];
      next.push({
        id: "video-today",
        title: `${todayVideo.length} תורי וידאו היום`,
        subtitle: `${formatTime(first.start_time) || "היום"} · בדוק שהשיחה מוכנה`,
        label: "פתח דיגיטל",
        path: "/digital-care",
        priority: 95,
        tone: "blue",
        icon: Video,
      });
    }

    const missingVet = appointments.filter((appointment) => !String(appointment.vet_name || "").trim());
    if (missingVet.length > 0) {
      next.push({
        id: "missing-vet",
        title: `${missingVet.length} תורים בלי רופא משויך`,
        subtitle: "שיבוץ רופא יעזור למנוע עומס בזמן קבלת המטופלים",
        label: "פתח יומן",
        path: "/appointments",
        priority: 90,
        tone: "amber",
        icon: CalendarClock,
      });
    }

    const missingRoom = appointments.filter((appointment) => appointment.appointment_mode !== "video" && !String(appointment.room || "").trim());
    if (missingRoom.length > 0) {
      next.push({
        id: "missing-room",
        title: `${missingRoom.length} תורים בלי חדר`,
        subtitle: "כדאי להשלים חדר לפני תחילת המשמרת",
        label: "פתח יומן",
        path: "/appointments",
        priority: 76,
        tone: "amber",
        icon: CalendarClock,
      });
    }

    const urgentConversations = conversations.filter((conversation) => ["urgent", "high"].includes(String(conversation.priority || "").toLowerCase()));
    if (urgentConversations.length > 0) {
      next.push({
        id: "urgent-conversations",
        title: `${urgentConversations.length} פניות בעדיפות גבוהה`,
        subtitle: "מומלץ לבדוק לפני טיפול בפניות רגילות",
        label: "פתח דיגיטל",
        path: "/digital-care",
        priority: 94,
        tone: "rose",
        icon: MessageCircle,
      });
    } else {
      const openConversations = conversations.filter((conversation) => isOpenStatus(conversation.status));
      if (openConversations.length > 0) {
        next.push({
          id: "open-conversations",
          title: `${openConversations.length} פניות פתוחות`,
          subtitle: role === "secretary" ? "בדוק מה דורש מענה או תיאום" : "בדוק מה מחכה לתשובת צוות",
          label: "פתח דיגיטל",
          path: "/digital-care",
          priority: 70,
          tone: "purple",
          icon: MessageCircle,
        });
      }
    }

    if (canSeeMedical) {
      const urgentLabs = labOrders.filter((order) => order.is_urgent || ["abnormal", "critical"].includes(String(order.result_status || "").toLowerCase()));
      const openLabs = labOrders.filter((order) => isOpenStatus(order.status));
      if (urgentLabs.length > 0) {
        next.push({
          id: "urgent-labs",
          title: `${urgentLabs.length} בדיקות מעבדה דחופות`,
          subtitle: "בדוק תוצאות והמשך טיפול",
          label: "פתח דוחות",
          path: "/reports",
          priority: 92,
          tone: "rose",
          icon: FlaskConical,
        });
      } else if (openLabs.length > 0) {
        next.push({
          id: "open-labs",
          title: `${openLabs.length} בדיקות מעבדה פתוחות`,
          subtitle: "בדוק מה ממתין לתוצאה או השלמה",
          label: "פתח דוחות",
          path: "/reports",
          priority: 64,
          tone: "blue",
          icon: FlaskConical,
        });
      }
    }

    const seriousHospitalizations = hospitalizations.filter((item) => ["critical", "serious"].includes(String(item.severity || "").toLowerCase()));
    if (seriousHospitalizations.length > 0) {
      next.push({
        id: "serious-hospitalizations",
        title: `${seriousHospitalizations.length} מאושפזים למעקב צמוד`,
        subtitle: canSeeMedical ? "בדוק סטטוס ועדכון טיפול" : "בדוק אם נדרש עדכון ללקוח",
        label: "פתח מטופלים",
        path: "/patients",
        priority: 91,
        tone: "rose",
        icon: BedDouble,
      });
    } else if (hospitalizations.length > 0 && role === "secretary") {
      next.push({
        id: "active-hospitalizations-secretary",
        title: `${hospitalizations.length} מאושפזים פעילים`,
        subtitle: "בדוק אם יש תיאום או עדכון ללקוח",
        label: "פתח מטופלים",
        path: "/patients",
        priority: 55,
        tone: "emerald",
        icon: BedDouble,
      });
    }

    if (canSeePayments && payments.length > 0) {
      next.push({
        id: "payments",
        title: `${payments.length} תשלומים למעקב`,
        subtitle: "בדוק חיובים פתוחים לפני סוף היום",
        label: "פתח דוחות",
        path: "/reports",
        priority: role === "secretary" ? 88 : 58,
        tone: "emerald",
        icon: CreditCard,
      });
    }

    const lowInventory = inventory.filter((item) => Number(item.stock_quantity ?? 0) <= 5);
    if (lowInventory.length > 0) {
      next.push({
        id: "low-inventory",
        title: `${lowInventory.length} פריטי מלאי נמוכים`,
        subtitle: "בדוק הזמנות לפני שמתחיל חוסר",
        label: "פתח מלאי",
        path: "/inventory",
        priority: 62,
        tone: "gray",
        icon: PackageSearch,
      });
    }

    return next.sort((a, b) => b.priority - a.priority).slice(0, 6);
  }, [appointments, conversations, hospitalizations, inventory, labOrders, payments, role]);

  const headline = role === "clinic_admin" ? "פעולות ניהול להיום" : role === "secretary" ? "פעולות שירות להיום" : role === "nurse" ? "פעולות סיעודיות להיום" : "פעולות מומלצות להיום";

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" dir="rtl">
      <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-gray-900 text-[18px] font-bold">{headline}</h2>
              <p className="text-gray-500 text-[13px] mt-0.5">מה כדאי לסגור עכשיו</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={isLoading}
          aria-busy={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isLoading ? "מרענן..." : "רענן"}
        </button>
      </div>

      <div className="p-6">
        {isLoading && actions.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-[14px]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            טוען פעולות...
          </div>
        ) : actions.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/70">
            <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
            <p className="text-gray-900 text-[15px] font-bold">אין פעולות פתוחות כרגע</p>
            <p className="text-gray-500 text-[13px] mt-1">המשך לעקוב אחרי היומן והפניות במהלך היום</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {actions.map((action, index) => {
              const Icon = action.icon;
              const classes = toneClasses[action.tone];

              return (
                <article key={action.id} className={`rounded-2xl border p-4 ${classes.card}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${classes.icon}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${classes.badge}`}>#{index + 1}</span>
                        {action.priority >= 90 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 text-rose-700 text-[11px] font-bold border border-rose-100">
                            <AlertTriangle className="w-3 h-3" /> דחוף
                          </span>
                        )}
                      </div>
                      <h3 className="text-gray-900 text-[15px] font-bold leading-6">{action.title}</h3>
                      <p className="text-gray-500 text-[13px] mt-1 leading-6">{action.subtitle}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(action.path)}
                    className={`mt-4 w-full rounded-xl px-4 py-2.5 text-[13px] font-bold transition-colors cursor-pointer ${classes.button}`}
                  >
                    {action.label}
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {lastUpdated && <p className="text-gray-400 text-[12px] mt-4 text-left">עודכן {lastUpdated}</p>}
      </div>
    </section>
  );
}
