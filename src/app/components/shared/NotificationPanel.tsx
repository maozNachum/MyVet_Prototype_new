import { useState } from "react";
import { Bell, X, Trash2, CalendarClock, Pencil } from "lucide-react";
import type { AppNotification } from "../../data/AppointmentStore";

const NOTIF_STYLE: Record<string, { bg: string; icon: typeof Trash2; iconColor: string }> = {
  cancelled:   { bg: "bg-red-50 border-red-200",    icon: Trash2,        iconColor: "text-red-500" },
  rescheduled: { bg: "bg-blue-50 border-blue-200",   icon: CalendarClock, iconColor: "text-blue-500" },
  edited:      { bg: "bg-amber-50 border-amber-200", icon: Pencil,        iconColor: "text-amber-500" },
  created:     { bg: "bg-amber-50 border-amber-200", icon: Pencil,        iconColor: "text-amber-500" },
};

interface NotificationPanelProps {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onDismiss: (id: number) => void;
  title: string;
  emptyText: string;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  onMarkAllRead,
  onDismiss,
  title,
  emptyText,
}: NotificationPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) onMarkAllRead(); }}
        className="relative w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5 text-gray-500" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white"
            style={{ fontWeight: 700 }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-12 w-[360px] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden" dir="rtl">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#1e40af]" />
              <h4 className="text-gray-900 text-[15px]" style={{ fontWeight: 600 }}>{title}</h4>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-[350px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-[13px]">{emptyText}</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {notifications.map((n) => {
                  const style = NOTIF_STYLE[n.type] || NOTIF_STYLE.edited;
                  const Icon = style.icon;
                  return (
                    <div
                      key={n.id}
                      className={`rounded-xl border p-3.5 transition-all ${style.bg} ${!n.read ? "ring-2 ring-blue-300/30" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          <Icon className={`w-4 h-4 ${style.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-[13px] mb-0.5" style={{ fontWeight: 600 }}>{n.message}</p>
                          <p className="text-gray-600 text-[12px]" style={{ lineHeight: 1.5 }}>{n.detail}</p>
                          <p className="text-gray-400 text-[11px] mt-1">
                            {n.timestamp.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                            {" · "}
                            {n.timestamp.toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                        <button onClick={() => onDismiss(n.id)} className="text-gray-300 hover:text-gray-500 cursor-pointer p-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
