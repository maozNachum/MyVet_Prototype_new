import { useState } from "react";
import {
  Bell, UserX, Send, Check, Calendar, Phone, Mail,
  ChevronDown, ChevronUp, Dog, Cat, Clock, AlertTriangle,
} from "lucide-react";
import { ReportSearchBar } from "./ReportSearchBar";

// ─── Mock Data ───────────────────────────────────────────────────────
interface MissedReminder {
  id: number;
  petName: string;
  petType: "dog" | "cat";
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  reminderType: string;
  reminderDate: string;
  daysSince: number;
  lastVisit: string;
}

interface InactiveClient {
  id: number;
  petName: string;
  petType: "dog" | "cat";
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  lastVisit: string;
  monthsInactive: number;
  estimatedLifetimeValue: number;
}

const MISSED_REMINDERS: MissedReminder[] = [
  { id: 1, petName: "שוקו", petType: "dog", ownerName: "אלון דוד", ownerPhone: "054-9991122", ownerEmail: "alon@email.com", reminderType: "חיסון כלבת שנתי", reminderDate: "10/01/2026", daysSince: 67, lastVisit: "15/12/2025" },
  { id: 2, petName: "פופי", petType: "cat", ownerName: "נעמה רז", ownerPhone: "052-3334455", ownerEmail: "naama@email.com", reminderType: "בדיקת דם שנתית", reminderDate: "01/02/2026", daysSince: 45, lastVisit: "20/01/2026" },
  { id: 3, petName: "צ׳ארלי", petType: "dog", ownerName: "עמית שלום", ownerPhone: "050-7778899", ownerEmail: "amit@email.com", reminderType: "חיסון משושה DHPP", reminderDate: "15/01/2026", daysSince: 62, lastVisit: "10/01/2026" },
  { id: 4, petName: "קיטי", petType: "cat", ownerName: "ליאת מור", ownerPhone: "053-1112244", ownerEmail: "liat@email.com", reminderType: "ביקורת אחרי ניתוח", reminderDate: "05/02/2026", daysSince: 41, lastVisit: "20/01/2026" },
  { id: 5, petName: "ג׳ק", petType: "dog", ownerName: "רון ברק", ownerPhone: "058-6667788", ownerEmail: "ron@email.com", reminderType: "בדיקת שיניים", reminderDate: "20/01/2026", daysSince: 57, lastVisit: "05/12/2025" },
];

const INACTIVE_CLIENTS: InactiveClient[] = [
  { id: 1, petName: "טופי", petType: "dog", ownerName: "מרים אזולאי", ownerPhone: "054-2223344", ownerEmail: "miriam@email.com", lastVisit: "10/01/2025", monthsInactive: 14, estimatedLifetimeValue: 3200 },
  { id: 2, petName: "סנדי", petType: "cat", ownerName: "אריאל גל", ownerPhone: "052-5556677", ownerEmail: "ariel@email.com", lastVisit: "28/11/2024", monthsInactive: 16, estimatedLifetimeValue: 2100 },
  { id: 3, petName: "בני", petType: "dog", ownerName: "יעל ורד", ownerPhone: "050-8889900", ownerEmail: "yael@email.com", lastVisit: "15/12/2024", monthsInactive: 15, estimatedLifetimeValue: 4500 },
  { id: 4, petName: "קוקו", petType: "cat", ownerName: "שמעון אדרי", ownerPhone: "053-4445566", ownerEmail: "shimon@email.com", lastVisit: "01/10/2024", monthsInactive: 17, estimatedLifetimeValue: 1800 },
];

// ─── Component ──────────────────────────────────────────────────────
export function ClientCompliance() {
  const [activeList, setActiveList] = useState<"missed" | "inactive">("missed");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const currentList = activeList === "missed"
    ? MISSED_REMINDERS.filter((r) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return r.petName.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q) || r.ownerPhone.includes(q) || r.reminderType.toLowerCase().includes(q);
      })
    : INACTIVE_CLIENTS.filter((c) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return c.petName.toLowerCase().includes(q) || c.ownerName.toLowerCase().includes(q) || c.ownerPhone.includes(q);
      });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === currentList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentList.map((c) => c.id)));
    }
  };

  const handleBulkSend = (channel: "sms" | "email") => {
    selectedIds.forEach((id) => {
      setSentIds((prev) => new Set(prev).add(`${activeList}-${id}-${channel}`));
    });
    setSelectedIds(new Set());
  };

  const totalLTV = INACTIVE_CLIENTS.reduce((s, c) => s + c.estimatedLifetimeValue, 0);

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "תזכורות שלא מומשו", value: String(MISSED_REMINDERS.length), color: "bg-amber-50 text-amber-600", icon: Bell },
          { label: "ממוצע ימים מתזכורת", value: Math.round(MISSED_REMINDERS.reduce((s, r) => s + r.daysSince, 0) / MISSED_REMINDERS.length) + " יום", color: "bg-orange-50 text-orange-600", icon: Clock },
          { label: "לקוחות לא פעילים", value: String(INACTIVE_CLIENTS.length), color: "bg-red-50 text-red-600", icon: UserX },
          { label: "שווי לקוחות בסיכון", value: `₪${totalLTV.toLocaleString()}`, color: "bg-purple-50 text-purple-600", icon: AlertTriangle },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-gray-400 text-[12px]">{kpi.label}</p>
              <p className="text-gray-900 text-[22px]" style={{ fontWeight: 700 }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tab toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setActiveList("missed"); setSelectedIds(new Set()); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
              activeList === "missed" ? "bg-amber-50 text-amber-700 border border-amber-200 shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            style={{ fontWeight: activeList === "missed" ? 600 : 400 }}
          >
            <Bell className="w-4 h-4" />
            תזכורות שלא מומשו ({MISSED_REMINDERS.length})
          </button>
          <button
            onClick={() => { setActiveList("inactive"); setSelectedIds(new Set()); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
              activeList === "inactive" ? "bg-red-50 text-red-700 border border-red-200 shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            style={{ fontWeight: activeList === "inactive" ? 600 : 400 }}
          >
            <UserX className="w-4 h-4" />
            לקוחות לא פעילים ({INACTIVE_CLIENTS.length})
          </button>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-[12px]">{selectedIds.size} נבחרו</span>
            <button
              onClick={() => handleBulkSend("sms")}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-sm"
              style={{ fontWeight: 500 }}
            >
              <Phone className="w-3.5 h-3.5" /> שלח SMS
            </button>
            <button
              onClick={() => handleBulkSend("email")}
              className="flex items-center gap-1.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-[12px] px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-sm"
              style={{ fontWeight: 500 }}
            >
              <Mail className="w-3.5 h-3.5" /> שלח אימייל
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <ReportSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="חיפוש לפי שם חיה, בעלים, טלפון, סוג תזכורת..." />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Select all header */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedIds.size === currentList.length && currentList.length > 0}
            onChange={toggleAll}
            className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#1e40af]"
          />
          <span className="text-gray-500 text-[12px]" style={{ fontWeight: 500 }}>בחר הכל</span>
        </div>

        <div className="divide-y divide-gray-50">
          {activeList === "missed" && (currentList as MissedReminder[]).map((r) => {
            const isExpanded = expandedId === r.id;
            const smsSent = sentIds.has(`missed-${r.id}-sms`);
            const emailSent = sentIds.has(`missed-${r.id}-email`);
            const PIcon = r.petType === "dog" ? Dog : Cat;
            return (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#1e40af]"
                  />
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <PIcon className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{r.petName}</span>
                      <span className="text-gray-400 text-[12px]">({r.ownerName})</span>
                      <span className="bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded-full border border-amber-200" style={{ fontWeight: 600 }}>
                        {r.daysSince} ימים
                      </span>
                    </div>
                    <p className="text-gray-500 text-[12px]">{r.reminderType} · תזכורת נשלחה ב-{r.reminderDate}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {smsSent ? (
                      <span className="text-emerald-600 text-[11px] flex items-center gap-1"><Check className="w-3 h-3" />SMS</span>
                    ) : (
                      <button onClick={() => setSentIds((p) => new Set(p).add(`missed-${r.id}-sms`))} className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer" title="שלח SMS">
                        <Phone className="w-4 h-4" />
                      </button>
                    )}
                    {emailSent ? (
                      <span className="text-blue-600 text-[11px] flex items-center gap-1"><Check className="w-3 h-3" />Email</span>
                    ) : (
                      <button onClick={() => setSentIds((p) => new Set(p).add(`missed-${r.id}-email`))} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer" title="שלח אימייל">
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 mr-16 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400">טלפון</span>
                      <p className="text-gray-700 font-mono" style={{ fontWeight: 500 }}>{r.ownerPhone}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400">אימייל</span>
                      <p className="text-gray-700" style={{ fontWeight: 500 }}>{r.ownerEmail}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400">ביקור אחרון</span>
                      <p className="text-gray-700" style={{ fontWeight: 500 }}>{r.lastVisit}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                      <span className="text-amber-600">פעולה מומלצת</span>
                      <p className="text-amber-700" style={{ fontWeight: 500 }}>לתאם תור {r.reminderType}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {activeList === "inactive" && (currentList as InactiveClient[]).map((c) => {
            const isExpanded = expandedId === c.id;
            const smsSent = sentIds.has(`inactive-${c.id}-sms`);
            const emailSent = sentIds.has(`inactive-${c.id}-email`);
            const PIcon = c.petType === "dog" ? Dog : Cat;
            return (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-[#1e40af]"
                  />
                  <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                    <PIcon className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-900 text-[14px]" style={{ fontWeight: 600 }}>{c.petName}</span>
                      <span className="text-gray-400 text-[12px]">({c.ownerName})</span>
                      <span className="bg-red-50 text-red-600 text-[10px] px-2 py-0.5 rounded-full border border-red-200" style={{ fontWeight: 600 }}>
                        {c.monthsInactive} חודשים
                      </span>
                    </div>
                    <p className="text-gray-500 text-[12px]">ביקור אחרון: {c.lastVisit} · שווי מוערך: ₪{c.estimatedLifetimeValue.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {smsSent ? (
                      <span className="text-emerald-600 text-[11px] flex items-center gap-1"><Check className="w-3 h-3" />SMS</span>
                    ) : (
                      <button onClick={() => setSentIds((p) => new Set(p).add(`inactive-${c.id}-sms`))} className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors cursor-pointer" title="שלח SMS">
                        <Phone className="w-4 h-4" />
                      </button>
                    )}
                    {emailSent ? (
                      <span className="text-blue-600 text-[11px] flex items-center gap-1"><Check className="w-3 h-3" />Email</span>
                    ) : (
                      <button onClick={() => setSentIds((p) => new Set(p).add(`inactive-${c.id}-email`))} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer" title="שלח אימייל">
                        <Mail className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 mr-16 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400">טלפון</span>
                      <p className="text-gray-700 font-mono" style={{ fontWeight: 500 }}>{c.ownerPhone}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400">אימייל</span>
                      <p className="text-gray-700" style={{ fontWeight: 500 }}>{c.ownerEmail}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400">ביקור אחרון</span>
                      <p className="text-gray-700" style={{ fontWeight: 500 }}>{c.lastVisit}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                      <span className="text-red-500">שווי לקוח משוער</span>
                      <p className="text-red-700" style={{ fontWeight: 700 }}>₪{c.estimatedLifetimeValue.toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}