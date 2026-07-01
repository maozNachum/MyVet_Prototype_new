import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarClock, CheckCircle2, Search, UserX } from "lucide-react";
import {
  DateRangeKey,
  ReminderRow,
  buildLookups,
  daysBetween,
  fetchReportDataset,
  formatDate,
  getFilteredDataset,
  ownerName,
  petName,
} from "../../data/reportMetrics";
import { DonutMetric, HorizontalBarChart } from "./ReportVisuals";

interface ClientComplianceProps {
  dateRange: DateRangeKey;
}

interface ReminderDisplay extends ReminderRow {
  ownerDisplay: string;
  petDisplay: string;
  daysLate: number;
}

export function ClientCompliance({ dateRange }: ClientComplianceProps) {
  const [reminders, setReminders] = useState<ReminderDisplay[]>([]);
  const [inactivePets, setInactivePets] = useState<{ pet: string; owner: string; lastVisit: string; monthsInactive: number }[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      const filtered = getFilteredDataset(dataset, dateRange);
      const { ownersById, patientsById } = buildLookups(dataset);
      const now = new Date();

      const reminderRows = filtered.reminders.map((reminder) => {
        const patient = reminder.pet_id ? patientsById.get(Number(reminder.pet_id)) : null;
        const owner = reminder.owner_id ? ownersById.get(reminder.owner_id) : patient?.owner_id ? ownersById.get(patient.owner_id) : null;
        const dueDate = reminder.due_at ? new Date(reminder.due_at) : null;
        return {
          ...reminder,
          ownerDisplay: ownerName(owner),
          petDisplay: petName(patient),
          daysLate: dueDate && dueDate < now ? daysBetween(dueDate, now) : 0,
        };
      });

      const visitsByPet = new Map<number, Date>();
      dataset.medicalVisits.forEach((visit) => {
        if (!visit.pet_id || !visit.visit_date) return;
        const date = new Date(visit.visit_date);
        const prev = visitsByPet.get(Number(visit.pet_id));
        if (!prev || date > prev) visitsByPet.set(Number(visit.pet_id), date);
      });

      const inactive = dataset.patients.map((patient) => {
        const owner = ownersById.get(patient.owner_id);
        const lastVisit = visitsByPet.get(Number(patient.pet_id));
        const monthsInactive = lastVisit ? Math.floor(daysBetween(lastVisit, now) / 30) : 999;
        return {
          pet: petName(patient),
          owner: ownerName(owner),
          lastVisit: lastVisit ? lastVisit.toLocaleDateString("he-IL") : "אין ביקור מתועד",
          monthsInactive,
        };
      }).filter((row) => row.monthsInactive >= 12).sort((a, b) => b.monthsInactive - a.monthsInactive);

      if (mounted) {
        setReminders(reminderRows);
        setInactivePets(inactive);
        setIsLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [dateRange]);

  const filteredReminders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reminders.filter((r) => !q || [r.title || "", r.message || "", r.ownerDisplay, r.petDisplay].join(" ").toLowerCase().includes(q));
  }, [reminders, query]);

  const openReminders = reminders.filter((r) => r.status === "open");
  const overdue = openReminders.filter((r) => r.daysLate > 0);
  const reminderSegments = useMemo(() => ([
    { label: "פתוחות", value: openReminders.length, className: "bg-blue-500" },
    { label: "באיחור", value: overdue.length, className: "bg-red-500" },
    { label: "סגורות/אחרות", value: Math.max(reminders.length - openReminders.length, 0), className: "bg-emerald-500" },
  ]), [openReminders.length, overdue.length, reminders.length]);
  const inactiveChart = useMemo(() => inactivePets.slice(0, 6).map((row) => ({
    label: row.pet,
    value: row.monthsInactive === 999 ? 36 : row.monthsInactive,
    hint: `${row.owner} · ביקור אחרון: ${row.lastVisit}`,
  })), [inactivePets]);

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-500 font-medium">טוען דוח מעקב לקוחות...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Bell className="w-6 h-6 text-blue-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">תזכורות פתוחות</p>
          <p className="text-2xl font-bold text-gray-900">{openReminders.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <CalendarClock className="w-6 h-6 text-red-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">עברו תאריך יעד</p>
          <p className="text-2xl font-bold text-gray-900">{overdue.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <UserX className="w-6 h-6 text-amber-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">חיות ללא ביקור שנה+</p>
          <p className="text-2xl font-bold text-gray-900">{inactivePets.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DonutMetric
          title="סטטוס תזכורות"
          subtitle="פתוחות, באיחור וסגורות"
          value={reminders.length}
          label="תזכורות"
          segments={reminderSegments}
        />
        <HorizontalBarChart
          title="חיות ללא ביקור תקופה ארוכה"
          subtitle="מספר חודשים מאז הביקור האחרון"
          data={inactiveChart}
          emptyText="אין חיות לא פעילות לפי הכלל הנוכחי"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-[17px]">תזכורות ומעקב</h3>
                <p className="text-gray-500 text-[12px] font-medium">מבוסס על reminders</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי לקוח, חיה או תזכורת..." className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[520px] overflow-auto">
            {filteredReminders.length === 0 ? (
              <div className="py-10 text-center text-gray-500 font-medium">אין תזכורות בטווח הנבחר</div>
            ) : filteredReminders.map((reminder) => (
              <div key={reminder.reminder_id} className="p-4 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-900 text-[14px]">{reminder.title || "תזכורת"}</p>
                    <p className="text-gray-500 text-[12px] font-medium">{reminder.petDisplay} · {reminder.ownerDisplay}</p>
                    <p className="text-gray-500 text-[12px] mt-1">יעד: {formatDate(reminder.due_at)}</p>
                    {reminder.message && <p className="text-gray-600 text-[13px] mt-2">{reminder.message}</p>}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${reminder.daysLate > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                    {reminder.daysLate > 0 ? `${reminder.daysLate} ימים איחור` : reminder.status || "פתוח"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-[17px]">לקוחות/חיות שדורשים חידוש קשר</h3>
            <p className="text-gray-500 text-[12px] font-medium">חיות שלא תועד להן ביקור במשך שנה ומעלה</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-[520px] overflow-auto">
            {inactivePets.length === 0 ? (
              <div className="py-10 text-center text-gray-500 font-medium">אין חיות לא פעילות לפי הכלל הנוכחי</div>
            ) : inactivePets.map((row) => (
              <div key={`${row.owner}-${row.pet}`} className="p-4 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-900 text-[14px]">{row.pet}</p>
                    <p className="text-gray-500 text-[12px] font-medium">{row.owner}</p>
                    <p className="text-gray-500 text-[12px] mt-1">ביקור אחרון: {row.lastVisit}</p>
                  </div>
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-[11px] font-bold">
                    {row.monthsInactive === 999 ? "אין תיעוד" : `${row.monthsInactive} חודשים`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
