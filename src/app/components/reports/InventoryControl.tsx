import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Package, Search, WalletCards } from "lucide-react";
import { DateRangeKey, InventoryRow, LOW_STOCK_THRESHOLD, fetchReportDataset, formatCurrency } from "../../data/reportMetrics";
import { DonutMetric, HorizontalBarChart } from "./ReportVisuals";

interface InventoryControlProps {
  dateRange: DateRangeKey;
}

export function InventoryControl({ dateRange }: InventoryControlProps) {
  void dateRange;
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setIsLoading(true);
      const { dataset } = await fetchReportDataset();
      if (mounted) {
        setItems(dataset.inventory);
        setIsLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const categories = useMemo(() => ["all", ...Array.from(new Set(items.map((i) => i.category || "אחר")))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = category === "all" || (item.category || "אחר") === category;
      const matchesQuery = !q || [item.item_name || "", item.category || ""].join(" ").toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [items, query, category]);

  const totalValue = items.reduce((sum, item) => sum + Number(item.stock_quantity || 0) * Number(item.price || 0), 0);
  const lowStock = items.filter((item) => Number(item.stock_quantity || 0) <= LOW_STOCK_THRESHOLD);
  const outOfStock = items.filter((item) => Number(item.stock_quantity || 0) === 0);
  const healthyStock = items.filter((item) => Number(item.stock_quantity || 0) > LOW_STOCK_THRESHOLD);

  const categoryValueChart = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      const cat = item.category || "אחר";
      const value = Number(item.stock_quantity || 0) * Number(item.price || 0);
      map.set(cat, (map.get(cat) || 0) + value);
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [items]);

  const stockStatusSegments = useMemo(() => ([
    { label: "תקין", value: healthyStock.length, className: "bg-emerald-500" },
    { label: "מלאי נמוך", value: lowStock.filter((item) => Number(item.stock_quantity || 0) > 0).length, className: "bg-amber-500" },
    { label: "אזל", value: outOfStock.length, className: "bg-red-500" },
  ]), [healthyStock.length, lowStock, outOfStock.length]);

  if (isLoading) return <div className="bg-white rounded-2xl p-8 text-center text-gray-500 font-medium">טוען דוח מלאי...</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800 text-[13px] font-semibold">
        דוח מלאי הוא תמונת מצב נוכחית ולכן אינו משתנה לפי טווח זמן. טווח הזמן ישפיע בדוחות עם שדות תאריך כמו תשלומים, תורים, ביקורים ובדיקות.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <p className="text-gray-500 text-[12px] font-medium">מלאי נמוך</p>
          <p className="text-2xl font-bold text-gray-900">{lowStock.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <AlertTriangle className="w-6 h-6 text-red-600 mb-3" />
          <p className="text-gray-500 text-[12px] font-medium">אזל מהמלאי</p>
          <p className="text-2xl font-bold text-gray-900">{outOfStock.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <DonutMetric
          title="בריאות המלאי"
          subtitle="חלוקה לפי תקין, נמוך ואזל"
          value={items.length}
          label="פריטים"
          segments={stockStatusSegments}
        />
        <HorizontalBarChart
          title="שווי מלאי לפי קטגוריה"
          subtitle="מסייע לזהות איפה הכסף נמצא במלאי"
          data={categoryValueChart}
          valueFormatter={formatCurrency}
          emptyText="אין קטגוריות מלאי להצגה"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-[17px]">בקרת מלאי</h3>
            <p className="text-gray-500 text-[12px] font-medium">מבוסס על טבלת inventory</p>
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
                <th className="p-4 font-semibold">מחיר</th>
                <th className="p-4 font-semibold">שווי</th>
                <th className="p-4 font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500 font-medium">לא נמצאו פריטים</td></tr>
              ) : filtered.map((item) => {
                const quantity = Number(item.stock_quantity || 0);
                const price = Number(item.price || 0);
                const isLow = quantity <= LOW_STOCK_THRESHOLD;
                const isEmpty = quantity === 0;
                return (
                  <tr key={item.item_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="p-4 font-bold text-gray-900">{item.item_name || "ללא שם"}</td>
                    <td className="p-4 text-gray-500 font-medium">{item.category || "אחר"}</td>
                    <td className="p-4 font-semibold text-gray-900">{quantity}</td>
                    <td className="p-4 text-gray-600">{formatCurrency(price)}</td>
                    <td className="p-4 text-gray-600">{formatCurrency(quantity * price)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full border text-[12px] font-semibold ${isEmpty ? "bg-red-50 text-red-700 border-red-200" : isLow ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        {isEmpty ? "אזל" : isLow ? "מלאי נמוך" : "תקין"}
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
