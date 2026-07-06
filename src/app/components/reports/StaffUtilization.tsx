import { useEffect, useMemo, useState } from "react";
import { CalendarClock, HeartPulse, Search, Stethoscope, Users } from "lucide-react";
import { DateRangeKey, fetchReportDataset, getFilteredDataset } from "../../data/reportMetrics";
import { HorizontalBarChart, MiniColumnChart } from "./ReportVisuals";

interface StaffUtilizationProps {
  dateRange: DateRangeKey;
}

interface VetActivity {
  name: string;
  appointments: number;
  visits: number;
  total: number;
  appointmentTypes: Record<string, number>;
}

export function StaffUtilization({ dateRange }: StaffUtilizationProps) {
  const [rows, setRows] = useState<VetActivity[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      const filtered = getFilteredDataset(dataset, dateRange);
      const activity = new Map<string, VetActivity>();

      function getRow(name: string) {
        const key = name || "לא משויך";
        const existing = activity.get(key);
        if (existing) return existing;
        const next = { name: key, appointments: 0, visits: 0, total: 0, appointmentTypes: {} };
        activity.set(key, next);
        return next;
      }

      filtered.appointments.forEach((appointment) => {
        const row = getRow(appointment.vet_name || "לא משויך");
        row.appointments += 1;
        row.total += 1;
        const type = appointment.appointment_type || "לא מוגדר";
        row.appointmentTypes[type] = (row.appointmentTypes[type] || 0) + 1;
      });

      filtered.medicalVisits.forEach((visit) => {
        const row = getRow(visit.vet_name || "לא משויך");
        row.visits += 1;
        row.total += 1;
      });

      if (mounted) {
        setRows([...activity.values()].sort((a, b) => b.total - a.total));
        setIsLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [dateRange]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const totalAppointments = rows.reduce((sum, row) => sum + row.appointments, 0);
  const totalVisits = rows.reduce((sum, row) => sum + row.visits, 0);
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  const doctorLoadChart = useMemo(() => rows.slice(0, 7).map((row) => ({
    label: row.name,
    value: row.total,
    hint: `${row.appointments} תורים · ${row.visits} ביקורים`,
  })), [rows]);

  const appointmentTypeChart = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      Object.entries(row.appointmentTypes).forEach(([type, count]) => {
        map.set(type, (map.get(type) || 0) + count);
      });
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [rows]);

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-500 font-medium">טוען דוח צוות...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Users className="w-6 h-6 text-blue-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">רופאים פעילים</p>
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <CalendarClock className="w-6 h-6 text-indigo-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">תורים בטווח</p>
          <p className="text-2xl font-bold text-gray-900">{totalAppointments}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <HeartPulse className="w-6 h-6 text-rose-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">ביקורים רפואיים</p>
          <p className="text-2xl font-bold text-gray-900">{totalVisits}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HorizontalBarChart
          title="עומס לפי רופא/ה"
          subtitle="תורים וביקורים רפואיים בטווח הנבחר"
          data={doctorLoadChart}
        />
        <MiniColumnChart
          title="סוגי תורים נפוצים"
          subtitle="התפלגות לפי appointment_type"
          data={appointmentTypeChart}
          emptyText="אין סוגי תורים להצגה"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px]">עומס ופעילות צוות</h3>
            <p className="text-gray-500 text-[12px] font-medium">פעילות הצוות לפי תורים וביקורים</p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש רופא/ה..." className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
        </div>

        <div className="p-5 space-y-4">
          {filteredRows.length === 0 ? (
            <div className="py-10 text-center text-gray-500 font-medium">אין פעילות צוות בטווח הנבחר</div>
          ) : filteredRows.map((row) => (
            <div key={row.name} className="rounded-2xl border border-gray-100 p-5 hover:border-blue-200 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{row.name}</p>
                    <p className="text-gray-500 text-[12px] font-medium">{row.appointments} תורים · {row.visits} ביקורים</p>
                  </div>
                </div>
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-[12px] font-bold">{row.total} פעולות</span>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max((row.total / maxTotal) * 100, 4)}%` }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(row.appointmentTypes).slice(0, 5).map(([type, count]) => (
                  <span key={type} className="bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-full text-[12px] font-medium">{type}: {count}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
