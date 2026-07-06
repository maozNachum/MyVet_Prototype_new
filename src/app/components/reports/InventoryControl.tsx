import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Clock3,
  Package,
  Search,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  DateRangeKey,
  InventoryRow,
  PaymentItemRow,
  PaymentRow,
  fetchReportDataset,
  formatCurrency,
  formatDate,
  getDateRangeLabel,
  getFilteredDataset,
  getInventoryStatus,
  getLowStockThreshold,
} from "../../data/reportMetrics";
import { ChartCard, DonutMetric, HorizontalBarChart } from "./ReportVisuals";

interface InventoryControlProps {
  dateRange: DateRangeKey;
}

type InventoryStatus = "healthy" | "low" | "out";

type InventoryAnalyticsRow = InventoryRow & {
  threshold: number;
  status: InventoryStatus;
  stockValue: number;
  demandUnitsInRange: number;
  demandEventsInRange: number;
  demandValueInRange: number;
  soldUnitsInRange: number;
  soldRevenueInRange: number;
  lastSoldAt: string | null;
  lastDemandAt: string | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isPaidSale(payment?: PaymentRow | null) {
  return ["paid", "partial"].includes(String(payment?.status || ""));
}

function isCancelledPayment(payment?: PaymentRow | null) {
  return ["cancelled", "refunded"].includes(String(payment?.status || ""));
}

function itemDate(item: PaymentItemRow, payment?: PaymentRow | null) {
  return item.created_at || payment?.paid_at || payment?.created_at || payment?.due_date || null;
}

function parseSourceItemId(item: PaymentItemRow) {
  if (String(item.source_type || "") !== "inventory") return null;
  const parsed = Number(item.source_id);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildInventoryItemMatcher(items: InventoryRow[]) {
  const byId = new Map(items.map((item) => [Number(item.item_id), item]));
  const byName = new Map<string, InventoryRow>();
  items.forEach((item) => {
    const key = normalizeText(item.item_name);
    if (key && !byName.has(key)) byName.set(key, item);
  });

  return (paymentItem: PaymentItemRow) => {
    const sourceId = parseSourceItemId(paymentItem);
    if (sourceId !== null && byId.has(sourceId)) return byId.get(sourceId) || null;

    if (String(paymentItem.item_type || "") === "inventory") {
      const nameMatch = byName.get(normalizeText(paymentItem.item_name));
      if (nameMatch) return nameMatch;
    }

    return null;
  };
}

function daysSince(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function statusLabel(status: InventoryStatus) {
  if (status === "out") return "אזל";
  if (status === "low") return "מלאי נמוך";
  return "תקין";
}

function statusClass(status: InventoryStatus) {
  if (status === "out") return "bg-red-50 text-red-700 border-red-200";
  if (status === "low") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export function InventoryControl({ dateRange }: InventoryControlProps) {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [paymentItems, setPaymentItems] = useState<PaymentItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [rangePaymentItems, setRangePaymentItems] = useState<PaymentItemRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      const filtered = getFilteredDataset(dataset, dateRange);

      if (mounted) {
        setItems(dataset.inventory);
        setPayments(dataset.payments);
        setPaymentItems(dataset.paymentItems);
        setRangePaymentItems(dateRange === "custom" ? dataset.paymentItems : filtered.paymentItems);
        setIsLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [dateRange]);

  const paymentsById = useMemo(
    () => new Map(payments.map((payment) => [Number(payment.payment_id), payment])),
    [payments],
  );

  const matchInventoryItem = useMemo(() => buildInventoryItemMatcher(items), [items]);

  const analyticsRows = useMemo<InventoryAnalyticsRow[]>(() => {
    const stats = new Map<number, Omit<InventoryAnalyticsRow,
      keyof InventoryRow | "threshold" | "status" | "stockValue"
    >>();

    items.forEach((item) => {
      stats.set(Number(item.item_id), {
        demandUnitsInRange: 0,
        demandEventsInRange: 0,
        demandValueInRange: 0,
        soldUnitsInRange: 0,
        soldRevenueInRange: 0,
        lastSoldAt: null,
        lastDemandAt: null,
      });
    });

    const applyRow = (paymentItem: PaymentItemRow, isInSelectedRange: boolean) => {
      const item = matchInventoryItem(paymentItem);
      if (!item) return;

      const payment = paymentsById.get(Number(paymentItem.payment_id));
      if (isCancelledPayment(payment)) return;

      const itemId = Number(item.item_id);
      const current = stats.get(itemId);
      if (!current) return;

      const quantity = Math.max(0, toNumber(paymentItem.quantity || 1));
      const total = toNumber(paymentItem.total_price) || quantity * toNumber(paymentItem.unit_price);
      const date = itemDate(paymentItem, payment);

      if (isInSelectedRange) {
        current.demandUnitsInRange += quantity;
        current.demandEventsInRange += 1;
        current.demandValueInRange += total;

        if (isPaidSale(payment)) {
          current.soldUnitsInRange += quantity;
          current.soldRevenueInRange += total;
        }
      }

      if (date) {
        if (!current.lastDemandAt || new Date(date) > new Date(current.lastDemandAt)) {
          current.lastDemandAt = date;
        }
        if (isPaidSale(payment) && (!current.lastSoldAt || new Date(date) > new Date(current.lastSoldAt))) {
          current.lastSoldAt = date;
        }
      }
    };

    rangePaymentItems.forEach((row) => applyRow(row, true));
    paymentItems.forEach((row) => applyRow(row, false));

    return items.map((item) => {
      const quantity = toNumber(item.stock_quantity);
      const price = toNumber(item.price);
      const threshold = getLowStockThreshold(item);
      const status = getInventoryStatus(item);
      const itemStats = stats.get(Number(item.item_id)) || {
        demandUnitsInRange: 0,
        demandEventsInRange: 0,
        demandValueInRange: 0,
        soldUnitsInRange: 0,
        soldRevenueInRange: 0,
        lastSoldAt: null,
        lastDemandAt: null,
      };

      return {
        ...item,
        threshold,
        status,
        stockValue: quantity * price,
        ...itemStats,
      };
    });
  }, [items, matchInventoryItem, paymentItems, paymentsById, rangePaymentItems]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(items.map((i) => i.category || "אחר")))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return analyticsRows.filter((item) => {
      const matchesCategory = category === "all" || (item.category || "אחר") === category;
      const matchesQuery = !q || [item.item_name || "", item.category || ""].join(" ").toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [analyticsRows, query, category]);

  const totalValue = analyticsRows.reduce((sum, item) => sum + item.stockValue, 0);
  const lowStock = analyticsRows.filter((item) => item.status === "low");
  const outOfStock = analyticsRows.filter((item) => item.status === "out");
  const healthyStock = analyticsRows.filter((item) => item.status === "healthy");
  const soldRevenueInRange = analyticsRows.reduce((sum, item) => sum + item.soldRevenueInRange, 0);
  const soldUnitsInRange = analyticsRows.reduce((sum, item) => sum + item.soldUnitsInRange, 0);
  const demandUnitsInRange = analyticsRows.reduce((sum, item) => sum + item.demandUnitsInRange, 0);
  const noSale90Days = analyticsRows.filter((item) => {
    const days = daysSince(item.lastSoldAt);
    return toNumber(item.stock_quantity) > 0 && (days === null || days >= 90);
  });
  const deadStockValue = noSale90Days.reduce((sum, item) => sum + item.stockValue, 0);

  const categoryValueChart = useMemo(() => {
    const map = new Map<string, number>();
    analyticsRows.forEach((item) => {
      const cat = item.category || "אחר";
      map.set(cat, (map.get(cat) || 0) + item.stockValue);
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [analyticsRows]);

  const mostRequestedChart = useMemo(() => analyticsRows
    .filter((item) => item.demandUnitsInRange > 0)
    .sort((a, b) => b.demandUnitsInRange - a.demandUnitsInRange)
    .slice(0, 7)
    .map((item) => ({
      label: item.item_name || "ללא שם",
      value: item.demandUnitsInRange,
      hint: `${item.demandEventsInRange} חיובים/בקשות · ${formatCurrency(item.demandValueInRange)}`,
    })), [analyticsRows]);

  const bestSellersChart = useMemo(() => analyticsRows
    .filter((item) => item.soldUnitsInRange > 0)
    .sort((a, b) => b.soldUnitsInRange - a.soldUnitsInRange)
    .slice(0, 7)
    .map((item) => ({
      label: item.item_name || "ללא שם",
      value: item.soldUnitsInRange,
      hint: `${formatCurrency(item.soldRevenueInRange)} הכנסות בפועל`,
    })), [analyticsRows]);

  const noRecentSalesList = useMemo(() => noSale90Days
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 8), [noSale90Days]);

  const stockStatusSegments = useMemo(() => ([
    { label: "תקין", value: healthyStock.length, className: "bg-emerald-500" },
    { label: "מלאי נמוך", value: lowStock.length, className: "bg-amber-500" },
    { label: "אזל", value: outOfStock.length, className: "bg-red-500" },
  ]), [healthyStock.length, lowStock.length, outOfStock.length]);

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-500 font-medium">טוען דוח מלאי...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800 text-[13px] font-semibold leading-6">
        דוח המלאי משלב תמונת מצב נוכחית עם נתוני מכירה וביקוש מתוך חיובי הביקור. מלאי נמוך מחושב לפי הסף שהוגדר לכל פריט, ולא לפי מספר קבוע לכל המערכת.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Package className="w-6 h-6 text-blue-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">פריטים במלאי</p>
          <p className="text-2xl font-bold text-gray-900">{items.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <WalletCards className="w-6 h-6 text-emerald-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">שווי מלאי</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <AlertTriangle className="w-6 h-6 text-amber-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">מתחת לסף</p>
          <p className="text-2xl font-bold text-gray-900">{(lowStock.length + outOfStock.length).toLocaleString("he-IL")}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <ShoppingCart className="w-6 h-6 text-indigo-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">יחידות מבוקשות</p>
          <p className="text-2xl font-bold text-gray-900">{demandUnitsInRange.toLocaleString("he-IL")}</p>
          <p className="text-[11px] text-gray-400 font-semibold mt-1">בטווח {getDateRangeLabel(dateRange)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <TrendingUp className="w-6 h-6 text-purple-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">נמכר בפועל</p>
          <p className="text-2xl font-bold text-gray-900">{soldUnitsInRange.toLocaleString("he-IL")}</p>
          <p className="text-[11px] text-gray-400 font-semibold mt-1">{formatCurrency(soldRevenueInRange)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <Clock3 className="w-6 h-6 text-rose-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">לא נמכר 90 יום</p>
          <p className="text-2xl font-bold text-gray-900">{noSale90Days.length.toLocaleString("he-IL")}</p>
          <p className="text-[11px] text-gray-400 font-semibold mt-1">{formatCurrency(deadStockValue)} במלאי</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <DonutMetric
          title="בריאות המלאי"
          subtitle="חלוקה לפי תקין, נמוך ואזל — לפי סף אישי לכל פריט"
          value={items.length}
          label="פריטים"
          segments={stockStatusSegments}
        />
        <HorizontalBarChart
          title="הפריטים הכי מבוקשים"
          subtitle="כמה יחידות נכנסו לחיובים או בקשות בטווח הנבחר"
          data={mostRequestedChart}
          emptyText="אין ביקוש לפריטי מלאי בטווח הנבחר"
        />
        <HorizontalBarChart
          title="הפריטים הכי נמכרים"
          subtitle="פריטים מתוך חיובים ששולמו או שולמו חלקית"
          data={bestSellersChart}
          emptyText="אין מכירות בפועל בטווח הנבחר"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HorizontalBarChart
          title="שווי מלאי לפי קטגוריה"
          subtitle="מסייע לזהות איפה הכסף נמצא במלאי"
          data={categoryValueChart}
          valueFormatter={formatCurrency}
          emptyText="אין קטגוריות מלאי להצגה"
        />

        <ChartCard
          title="פריטים שלא נמכרו לאחרונה"
          subtitle="פריטים עם מלאי קיים שלא נמכרו בפועל לפחות 90 יום"
        >
          {noRecentSalesList.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-[13px] font-medium">אין פריטים תקועים לזיהוי כרגע</div>
          ) : (
            <div className="space-y-3">
              {noRecentSalesList.map((item) => {
                const lastSaleDays = daysSince(item.lastSoldAt);
                return (
                  <div key={item.item_id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-[13px] truncate">{item.item_name || "ללא שם"}</p>
                      <p className="text-gray-500 text-[12px] font-medium">
                        {item.category || "אחר"} · {toNumber(item.stock_quantity)} יחידות · {formatCurrency(item.stockValue)} במלאי
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700">
                      {lastSaleDays === null ? "לא נמכר עדיין" : `${lastSaleDays} ימים`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px] flex items-center gap-2">
              <Boxes className="w-5 h-5 text-blue-600" />
              בקרת מלאי מפורטת
            </h3>
            <p className="text-gray-500 text-[12px] font-medium">כמות, סף אישי, ביקוש, מכירות ופריטים שלא זזו</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש פריט..." className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              {categories.map((cat) => <option key={cat} value={cat}>{cat === "all" ? "כל הקטגוריות" : cat}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-[12px]">
              <tr>
                <th className="p-4 font-semibold">פריט</th>
                <th className="p-4 font-semibold">קטגוריה</th>
                <th className="p-4 font-semibold">כמות</th>
                <th className="p-4 font-semibold">סף נמוך</th>
                <th className="p-4 font-semibold">נמכר בטווח</th>
                <th className="p-4 font-semibold">ביקוש בטווח</th>
                <th className="p-4 font-semibold">מכירה אחרונה</th>
                <th className="p-4 font-semibold">שווי</th>
                <th className="p-4 font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-500 font-medium">לא נמצאו פריטים</td></tr>
              ) : filtered.map((item) => {
                const quantity = toNumber(item.stock_quantity);
                return (
                  <tr key={item.item_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="p-4 font-bold text-gray-900">{item.item_name || "ללא שם"}</td>
                    <td className="p-4 text-gray-500 font-medium">{item.category || "אחר"}</td>
                    <td className="p-4 font-semibold text-gray-900">{quantity}</td>
                    <td className="p-4 text-gray-600">{item.threshold}</td>
                    <td className="p-4 text-gray-600 font-semibold">{item.soldUnitsInRange.toLocaleString("he-IL")}</td>
                    <td className="p-4 text-gray-600 font-semibold">{item.demandUnitsInRange.toLocaleString("he-IL")}</td>
                    <td className="p-4 text-gray-500">{item.lastSoldAt ? formatDate(item.lastSoldAt) : "לא נמכר"}</td>
                    <td className="p-4 text-gray-600">{formatCurrency(item.stockValue)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full border text-[12px] font-semibold ${statusClass(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
