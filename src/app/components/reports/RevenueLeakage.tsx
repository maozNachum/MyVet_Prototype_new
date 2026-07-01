import { useEffect, useMemo, useState } from "react";
import { CreditCard, CheckCircle2, AlertCircle, Clock, Search, User, PawPrint } from "lucide-react";
import {
  DateRangeKey,
  PaymentRow,
  buildLookups,
  fetchReportDataset,
  formatCurrency,
  formatDate,
  getFilteredDataset,
  getPaymentStatusLabel,
  ownerName,
  petName,
} from "../../data/reportMetrics";
import { DonutMetric, HorizontalBarChart } from "./ReportVisuals";

interface RevenueLeakageProps {
  dateRange: DateRangeKey;
}

interface PaymentDisplay extends PaymentRow {
  ownerDisplay: string;
  petDisplay: string;
}

const statusClass: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-red-50 text-red-700 border-red-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
  refunded: "bg-blue-50 text-blue-700 border-blue-200",
};

export function RevenueLeakage({ dateRange }: RevenueLeakageProps) {
  const [payments, setPayments] = useState<PaymentDisplay[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      const filtered = getFilteredDataset(dataset, dateRange);
      const { ownersById, patientsById } = buildLookups(dataset);

      const mapped = filtered.payments.map((payment) => {
        const patient = payment.pet_id ? patientsById.get(Number(payment.pet_id)) : null;
        const owner = ownersById.get(payment.owner_id) || (patient?.owner_id ? ownersById.get(patient.owner_id) : null);
        return {
          ...payment,
          ownerDisplay: ownerName(owner),
          petDisplay: petName(patient),
        };
      });

      if (mounted) {
        setPayments(mapped);
        setIsLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [dateRange]);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
      const matchesQuery = !q || [payment.ownerDisplay, payment.petDisplay, payment.owner_id, payment.notes || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [payments, query, statusFilter]);

  const totals = useMemo(() => {
    const paid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const open = payments.filter((p) => p.status === "unpaid" || p.status === "partial").reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const partial = payments.filter((p) => p.status === "partial").length;
    return { paid, open, partial, count: payments.length };
  }, [payments]);

  const ownerDebtChart = useMemo(() => {
    const map = new Map<string, number>();
    payments
      .filter((payment) => payment.status === "unpaid" || payment.status === "partial")
      .forEach((payment) => {
        map.set(payment.ownerDisplay, (map.get(payment.ownerDisplay) || 0) + Number(payment.amount || 0));
      });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [payments]);

  const paymentStatusSegments = useMemo(() => ([
    { label: "שולם", value: payments.filter((p) => p.status === "paid").length, className: "bg-emerald-500" },
    { label: "פתוח", value: payments.filter((p) => p.status === "unpaid").length, className: "bg-red-500" },
    { label: "חלקי", value: payments.filter((p) => p.status === "partial").length, className: "bg-amber-500" },
  ]), [payments]);

  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500 font-medium">טוען דוח תשלומים...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <CreditCard className="w-6 h-6 text-blue-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">סה״כ חיובים</p>
          <p className="text-2xl font-bold text-gray-900">{totals.count}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">שולם</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <AlertCircle className="w-6 h-6 text-red-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">פתוח לגבייה</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.open)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Clock className="w-6 h-6 text-amber-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">תשלומים חלקיים</p>
          <p className="text-2xl font-bold text-gray-900">{totals.partial}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DonutMetric
          title="התפלגות סטטוס חיובים"
          subtitle="כמה חיובים שולמו, פתוחים או חלקיים"
          value={totals.count}
          label="חיובים"
          segments={paymentStatusSegments}
        />
        <HorizontalBarChart
          title="לקוחות עם יתרה פתוחה"
          subtitle="מיון לפי סכום חוב פתוח"
          data={ownerDebtChart}
          valueFormatter={formatCurrency}
          emptyText="אין חובות פתוחים בטווח הנבחר"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h3 className="text-gray-900 font-bold text-[17px]">חיובים ותשלומים</h3>
            <p className="text-gray-500 text-[12px] font-medium">מבוסס על טבלת payments</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי לקוח, חיה או הערה..." className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="all">כל הסטטוסים</option>
              <option value="unpaid">פתוח</option>
              <option value="partial">חלקי</option>
              <option value="paid">שולם</option>
              <option value="cancelled">בוטל</option>
              <option value="refunded">זוכה</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredPayments.length === 0 ? (
            <div className="py-12 text-center text-gray-500 font-medium">לא נמצאו חיובים בטווח הנבחר</div>
          ) : filteredPayments.map((payment) => (
            <div key={payment.payment_id} className="p-5 hover:bg-gray-50/60 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-900 font-bold text-[15px]">{formatCurrency(Number(payment.amount || 0))}</span>
                    <span className={`text-[12px] px-2.5 py-1 rounded-full border font-semibold ${statusClass[payment.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{getPaymentStatusLabel(payment.status)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{payment.ownerDisplay}</span>
                    <span className="flex items-center gap-1"><PawPrint className="w-3.5 h-3.5" />{payment.petDisplay}</span>
                    <span>יעד תשלום: {formatDate(payment.due_date)}</span>
                    <span>שולם: {formatDate(payment.paid_at)}</span>
                  </div>
                  {payment.notes && <p className="text-gray-500 text-[13px] mt-1">{payment.notes}</p>}
                </div>
                <div className="text-left text-[12px] text-gray-400 font-medium">
                  #{payment.payment_id}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
