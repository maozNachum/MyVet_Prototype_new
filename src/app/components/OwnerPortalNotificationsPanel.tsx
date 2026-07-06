import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Loader2, Megaphone, Plus, Send, X } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { toast } from "sonner";
import {
  createOwnerNotification,
  portalActionLabelForType,
  type PortalActionView,
  type PortalNotificationType,
} from "../../services/portalNotifications";

type OwnerPortalNotificationsPanelProps = {
  ownerId: string;
  ownerName: string;
};

type ExistingNotification = {
  notification_id: number;
  title: string | null;
  message: string | null;
  type: string | null;
  is_read: boolean | null;
  created_at: string | null;
};

const NOTIFICATION_TYPES: Array<{ key: PortalNotificationType; label: string; view: PortalActionView }> = [
  { key: "info", label: "עדכון כללי", view: "notifications" },
  { key: "appointment", label: "תור", view: "appointments" },
  { key: "payment", label: "תשלום", view: "payments" },
  { key: "medical", label: "תיק רפואי", view: "pets" },
  { key: "lab", label: "בדיקות", view: "pets" },
  { key: "document", label: "מסמכים", view: "documents" },
  { key: "digital", label: "מרפאה דיגיטלית", view: "digital" },
];

function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

export function OwnerPortalNotificationsPanel({ ownerId, ownerName }: OwnerPortalNotificationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notifications, setNotifications] = useState<ExistingNotification[]>([]);
  const [title, setTitle] = useState("עדכון מהמרפאה");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<PortalNotificationType>("info");

  const selectedType = useMemo(() => NOTIFICATION_TYPES.find((item) => item.key === type) || NOTIFICATION_TYPES[0], [type]);
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const loadNotifications = async () => {
    if (!ownerId) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("notifications")
        .select("notification_id, title, message, type, is_read, created_at")
        .eq("owner_id", ownerId)
        .in("target", ["owner", "both"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setNotifications((data || []) as ExistingNotification[]);
    } catch (error) {
      console.error("Failed loading owner notifications", error);
      toast.error("לא הצלחנו לטעון עדכוני פורטל ללקוח");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [ownerId]);

  const sendNotification = async () => {
    if (!title.trim()) {
      toast.error("כתבו כותרת קצרה לעדכון");
      return;
    }

    if (!message.trim()) {
      toast.error("כתבו את תוכן ההודעה ללקוח");
      return;
    }

    try {
      setIsSending(true);
      await createOwnerNotification({
        ownerId,
        title,
        message,
        type,
        actionView: selectedType.view,
        createdByRole: "staff",
      });

      setMessage("");
      setTitle("עדכון מהמרפאה");
      toast.success("העדכון נשלח לפורטל הלקוח");
      await loadNotifications();
    } catch (error) {
      console.error("Failed sending owner portal notification", error);
      toast.error("לא הצלחנו לשלוח את העדכון לפורטל");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" dir="rtl">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 text-right">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 text-[#1e40af] flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-gray-900 text-[16px] font-bold">עדכוני פורטל ללקוח</h3>
            <p className="text-gray-500 text-[13px] font-medium">
              {unreadCount > 0 ? `${unreadCount} עדכונים שעדיין לא נקראו` : "אפשר לשלוח עדכון שיופיע באזור האישי"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <span className="bg-blue-50 text-[#1e40af] border border-blue-100 text-[12px] font-bold px-3 py-1 rounded-full">
              {notifications.length} אחרונים
            </span>
          )}
          {isExpanded ? <X className="w-5 h-5 text-gray-400" /> : <Plus className="w-5 h-5 text-gray-400" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 p-5 space-y-5">
          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <p className="text-[#1e40af] text-[13px] font-bold mb-1">נשלח אל {ownerName}</p>
            <p className="text-blue-700 text-[12px] leading-5 font-medium">
              העדכון יופיע בפעמון ובמרכז העדכונים של פורטל הלקוח, עם פעולה מתאימה לפי סוג ההודעה.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-3">
            <div>
              <label className="block text-gray-700 text-[13px] font-bold mb-2">סוג עדכון</label>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as PortalNotificationType)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-400"
              >
                {NOTIFICATION_TYPES.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-[13px] font-bold mb-2">כותרת</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-400"
                placeholder="לדוגמה: סיכום ביקור חדש זמין"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-700 text-[13px] font-bold mb-2">הודעה ללקוח</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-blue-400 resize-none"
              placeholder="כתבו הודעה קצרה וברורה. לדוגמה: הסיכום מהביקור האחרון זמין כעת בתיק הרפואי."
            />
            <p className="text-gray-400 text-[12px] font-medium mt-2">
              פעולה בפורטל: {portalActionLabelForType(type)}
            </p>
          </div>

          <button
            type="button"
            onClick={sendNotification}
            disabled={isSending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-gray-300 text-white rounded-xl px-5 py-3 text-[13px] font-bold transition-colors cursor-pointer"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            שלח לפורטל
          </button>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-gray-900 text-[14px] font-bold">עדכונים אחרונים</h4>
              <button type="button" onClick={loadNotifications} className="text-[#1e40af] text-[12px] font-bold hover:underline cursor-pointer">
                רענון
              </button>
            </div>

            {isLoading ? (
              <div className="py-5 text-center text-gray-400 text-[13px] font-medium">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> טוען עדכונים...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-5 text-center text-gray-400 text-[13px] font-medium">
                עדיין לא נשלחו עדכונים לפורטל הלקוח.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((item) => (
                  <div key={item.notification_id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-gray-900 text-[13px] font-bold truncate">{item.title || "עדכון"}</p>
                      <p className="text-gray-500 text-[12px] mt-1 line-clamp-2">{item.message || ""}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-gray-400 text-[11px] font-semibold">{formatShortDate(item.created_at)}</span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${item.is_read ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                        {item.is_read ? <CheckCircle2 className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                        {item.is_read ? "נקרא" : "חדש"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
