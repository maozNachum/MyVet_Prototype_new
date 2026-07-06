import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock, CreditCard, FlaskConical, HeartPulse,
  Package, PawPrint, Users, WalletCards, AlertCircle,
} from "lucide-react";
import {
  DateRangeKey,
  fetchReportDataset,
  getInventoryStatus,
  formatCurrency,
  getFilteredDataset,
  getDateRangeLabel,
  isFuture,
} from "../../data/reportMetrics";

interface BiOverviewProps {
  dateRange: DateRangeKey;
}

interface KpiCard {
  title: string;
  value: string;
  subText: string;
  icon: typeof Users;
  color: string;
}

export function BiOverview({ dateRange }: BiOverviewProps) {
  const [cards, setCards] = useState<KpiCard[]>([]);
  const [urgentActions, setUrgentActions] = useState<{ title: string; desc: string; type: string }[]>([]);
  const [doctorStats, setDoctorStats] = useState<{ name: string; visits: number; appointments: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      const filtered = getFilteredDataset(dataset, dateRange);

      const openPayments = filtered.payments.filter((p) => p.status === "unpaid" || p.status === "partial");
      const openDebt = openPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const paidRevenue = filtered.payments
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const pendingLabs = filtered.labOrders.filter((l) => ["pending", "ordered", "in_progress"].includes(String(l.status || "")));
      const lowStock = dataset.inventory.filter((item) => getInventoryStatus(item) !== "healthy");
      const futureAppointments = filtered.appointments.filter((a) => isFuture(a.start_time));

      const vetMap = new Map<string, { name: string; visits: number; appointments: number }>();
      filtered.medicalVisits.forEach((visit) => {
        const name = visit.vet_name || "לא משויך";
        const row = vetMap.get(name) || { name, visits: 0, appointments: 0 };
        row.visits += 1;
        vetMap.set(name, row);
      });
      filtered.appointments.forEach((appointment) => {
        const name = appointment.vet_name || "לא משויך";
        const row = vetMap.get(name) || { name, visits: 0, appointments: 0 };
        row.appointments += 1;
        vetMap.set(name, row);
      });

      const nextCards: KpiCard[] = [
        {
          title: dateRange === "custom" ? "לקוחות פעילים" : "לקוחות חדשים",
          value: (dateRange === "custom" ? dataset.owners.length : filtered.owners.length).toLocaleString("he-IL"),
          subText: dateRange === "custom" ? `${dataset.patients.length.toLocaleString("he-IL")} חיות רשומות` : `${filtered.patients.length.toLocaleString("he-IL")} חיות חדשות בטווח ${getDateRangeLabel(dateRange)}`,
          icon: Users,
          color: "bg-blue-50 text-blue-600",
        },
        {
          title: "תורים עתידיים",
          value: futureAppointments.length.toLocaleString("he-IL"),
          subText: `${filtered.appointments.length.toLocaleString("he-IL")} תורים בטווח הנבחר`,
          icon: CalendarClock,
          color: "bg-indigo-50 text-indigo-600",
        },
        {
          title: "הכנסות ששולמו",
          value: formatCurrency(paidRevenue),
          subText: `${formatCurrency(openDebt)} חיובים פתוחים בטווח`,
          icon: CreditCard,
          color: "bg-emerald-50 text-emerald-600",
        },
        {
          title: "ביקורים רפואיים",
          value: filtered.medicalVisits.length.toLocaleString("he-IL"),
          subText: "תיעודי טיפול בטווח הנבחר",
          icon: HeartPulse,
          color: "bg-rose-50 text-rose-600",
        },
        {
          title: "בדיקות ממתינות",
          value: pendingLabs.length.toLocaleString("he-IL"),
          subText: "בדיקות מעבדה בטווח שעדיין לא נסגרו",
          icon: FlaskConical,
          color: "bg-cyan-50 text-cyan-600",
        },
        {
          title: "מלאי נמוך",
          value: lowStock.length.toLocaleString("he-IL"),
          subText: "תמונת מצב נוכחית · לפי סף אישי לכל פריט",
          icon: Package,
          color: "bg-amber-50 text-amber-600",
        },
      ];

      const actions: { title: string; desc: string; type: string }[] = [];
      if (openDebt > 0) actions.push({ title: "לטפל בגבייה", desc: `${formatCurrency(openDebt)} עדיין פתוחים לתשלום`, type: "payments" });
      if (pendingLabs.length > 0) actions.push({ title: "בדיקות מעבדה ממתינות", desc: `${pendingLabs.length} בדיקות דורשות מעקב`, type: "labs" });
      if (lowStock.length > 0) actions.push({ title: "בדיקת מלאי", desc: `${lowStock.length} פריטים מתחת לסף`, type: "inventory" });

      if (mounted) {
        setCards(nextCards);
        setUrgentActions(actions);
        setDoctorStats([...vetMap.values()].sort((a, b) => (b.visits + b.appointments) - (a.visits + a.appointments)).slice(0, 6));
        setIsLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [dateRange]);

  const maxDoctorActivity = useMemo(() => Math.max(...doctorStats.map((d) => d.visits + d.appointments), 1), [doctorStats]);

  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500 font-medium">טוען סקירה כללית...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {cards.map((card) => (
          <div key={card.title} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
              <PawPrint className="w-5 h-5 text-gray-200" />
            </div>
            <h3 className="text-gray-500 text-[14px] font-medium mb-1">{card.title}</h3>
            <p className="text-2xl font-bold text-gray-900 mb-1">{card.value}</p>
            <p className="text-gray-500 font-medium text-[13px]">{card.subText}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-7">
            <h3 className="text-gray-900 font-bold flex items-center gap-2">
              <WalletCards className="w-5 h-5 text-blue-600" />
              פעילות לפי רופא/ה
            </h3>
            <span className="text-[12px] text-gray-500 font-medium">תורים + ביקורים בטווח הדוח</span>
          </div>

          <div className="space-y-5">
            {doctorStats.length === 0 ? (
              <p className="text-gray-500 text-center py-8 font-medium">אין פעילות צוות בטווח הנבחר</p>
            ) : doctorStats.map((doc) => {
              const total = doc.visits + doc.appointments;
              return (
                <div key={doc.name} className="space-y-2">
                  <div className="flex justify-between text-[13px]">
                    <span className="font-bold text-gray-700">{doc.name}</span>
                    <span className="text-blue-600 font-bold">{total} פעולות</span>
                  </div>
                  <div className="h-4 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <div className="h-full bg-gradient-to-l from-blue-600 to-blue-400 rounded-full" style={{ width: `${Math.max((total / maxDoctorActivity) * 100, 5)}%` }} />
                  </div>
                  <div className="flex gap-4 text-[12px] text-gray-500 font-medium">
                    <span>{doc.appointments} תורים</span>
                    <span>{doc.visits} ביקורים רפואיים</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-gray-900 font-bold mb-6 flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            פעולות לטיפול
          </h3>
          <div className="space-y-4">
            {urgentActions.length === 0 ? (
              <p className="text-gray-500 font-medium text-[13px] text-center py-4">אין פעולות דחופות כרגע ✓</p>
            ) : urgentActions.map((action) => (
              <div key={action.title} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-gray-900 text-[14px] font-bold mb-1">{action.title}</p>
                <p className="text-gray-500 text-[12px]">{action.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
