import { useEffect, useMemo, useState } from "react";
import { Activity, FlaskConical, HeartPulse, Search, Stethoscope } from "lucide-react";
import { DateRangeKey, fetchReportDataset, formatDate, getFilteredDataset } from "../../data/reportMetrics";
import { HorizontalBarChart, MiniColumnChart } from "./ReportVisuals";

interface EpiRadarProps {
  dateRange: DateRangeKey;
}

function countByText(values: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  values.forEach((value) => {
    const text = (value || "").trim();
    if (!text) return;
    const key = text.length > 45 ? `${text.slice(0, 45)}…` : text;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function EpiRadar({ dateRange }: EpiRadarProps) {
  const [diagnoses, setDiagnoses] = useState<[string, number][]>([]);
  const [reasons, setReasons] = useState<[string, number][]>([]);
  const [treatments, setTreatments] = useState<[string, number][]>([]);
  const [labs, setLabs] = useState<{ id: number; name: string; status: string; ordered: string; urgent: boolean }[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      const filtered = getFilteredDataset(dataset, dateRange);

      if (mounted) {
        setDiagnoses(countByText(filtered.medicalVisits.map((v) => v.diagnosis)).slice(0, 10));
        setReasons(countByText(filtered.medicalVisits.map((v) => v.reason)).slice(0, 10));
        setTreatments(countByText(filtered.medicalVisits.map((v) => v.treatment)).slice(0, 10));
        setLabs(filtered.labOrders.map((lab) => ({
          id: lab.lab_order_id,
          name: lab.test_name || "בדיקת מעבדה",
          status: lab.status || "לא ידוע",
          ordered: formatDate(lab.ordered_date),
          urgent: Boolean(lab.is_urgent),
        })));
        setIsLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [dateRange]);

  const filteredLabs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return labs.filter((lab) => !q || [lab.name, lab.status].join(" ").toLowerCase().includes(q));
  }, [labs, query]);

  const diagnosisChart = useMemo(() => diagnoses.map(([label, value]) => ({ label, value })), [diagnoses]);
  const reasonChart = useMemo(() => reasons.map(([label, value]) => ({ label, value })), [reasons]);
  const pendingLabs = labs.filter((l) => ["pending", "ordered", "in_progress"].includes(l.status)).length;
  const urgentLabs = labs.filter((l) => l.urgent).length;

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-500 font-medium">טוען דוח פעילות רפואית...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Stethoscope className="w-6 h-6 text-blue-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">אבחנות שונות</p>
          <p className="text-2xl font-bold text-gray-900">{diagnoses.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <HeartPulse className="w-6 h-6 text-rose-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">טיפולים מתועדים</p>
          <p className="text-2xl font-bold text-gray-900">{treatments.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <FlaskConical className="w-6 h-6 text-cyan-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">בדיקות ממתינות</p>
          <p className="text-2xl font-bold text-gray-900">{pendingLabs}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Activity className="w-6 h-6 text-red-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">בדיקות דחופות</p>
          <p className="text-2xl font-bold text-gray-900">{urgentLabs}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HorizontalBarChart
          title="אבחנות נפוצות"
          subtitle="מתוך ביקורים רפואיים בטווח הנבחר"
          data={diagnosisChart}
          emptyText="אין אבחנות בטווח הנבחר"
        />
        <MiniColumnChart
          title="סיבות הגעה נפוצות"
          subtitle="התפלגות ביקורים לפי reason"
          data={reasonChart}
          emptyText="אין סיבות הגעה בטווח הנבחר"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px]">מעקב בדיקות מעבדה</h3>
            <p className="text-gray-500 text-[12px] font-medium">מבוסס על lab_orders</p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש בדיקה..." className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
        </div>
        <div className="divide-y divide-gray-100 max-h-[420px] overflow-auto">
          {filteredLabs.length === 0 ? (
            <div className="py-10 text-center text-gray-500 font-medium">אין בדיקות מעבדה בטווח הנבחר</div>
          ) : filteredLabs.map((lab) => (
            <div key={lab.id} className="p-4 hover:bg-gray-50/60 transition-colors flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-gray-900 text-[14px]">{lab.name}</p>
                <p className="text-gray-500 text-[12px] font-medium">הוזמן: {lab.ordered}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${lab.urgent ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                {lab.urgent ? "דחוף" : lab.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
