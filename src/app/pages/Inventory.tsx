import {
  Search,
  Plus,
  AlertTriangle,
  ArrowUpDown,
  X,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSearchFilter } from "../hooks/useSearchFilter";
import { normalizeSearchString } from "../utils/string";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_FALLBACK,
} from "../data/categoryConfig";

interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  categoryLabel: string;
  quantity: number;
  price: number;
  lowStock: boolean;
}

const inventoryData: InventoryItem[] = [
  { id: 1, sku: "10045", name: 'אמוקסיצילין 500 מ"ג', category: "medication", categoryLabel: "תרופות", quantity: 145, price: 80, lowStock: false },
  { id: 2, sku: "20099", name: "תחבושת אלסטית", category: "equipment", categoryLabel: "ציוד רפואי", quantity: 8, price: 15, lowStock: true },
  { id: 3, sku: "10088", name: "טיפות עיניים", category: "medication", categoryLabel: "תרופות", quantity: 52, price: 45, lowStock: false },
  { id: 4, sku: "30012", name: 'מזרק 5 מ"ל', category: "consumable", categoryLabel: "ציוד מתכלה", quantity: 300, price: 2, lowStock: false },
  { id: 5, sku: "10072", name: 'מטרונידזול 250 מ"ג', category: "medication", categoryLabel: "תרופות", quantity: 67, price: 55, lowStock: false },
  { id: 6, sku: "20150", name: "כפפות ניטריל M", category: "consumable", categoryLabel: "ציוד מתכלה", quantity: 5, price: 35, lowStock: true },
  { id: 7, sku: "10091", name: "חיסון כלבת", category: "medication", categoryLabel: "תרופות", quantity: 24, price: 120, lowStock: false },
  { id: 8, sku: "20201", name: "צינור אנדוטרכיאלי", category: "equipment", categoryLabel: "ציוד רפואי", quantity: 12, price: 95, lowStock: false },
];

/** Resolve category config from the central map (with fallback). */
function getCatConfig(category: string) {
  return (
    INVENTORY_CATEGORIES[category as keyof typeof INVENTORY_CATEGORIES] ??
    INVENTORY_CATEGORY_FALLBACK
  );
}

export function Inventory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Centralised search via shared hook + category filter ──
  const searchFiltered = useSearchFilter(inventoryData, searchQuery, (item) => [
    item.name,
    item.sku,
    item.categoryLabel,
    item.category,
    String(item.price),
    String(item.quantity),
  ]);

  const filtered = searchFiltered.filter((item) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "low-stock") return item.lowStock;
    return item.category === activeFilter;
  });

  // Highlight matched text helper (uses shared normalizer)
  const highlightMatch = (text: string) => {
    if (!searchQuery.trim()) return text;
    const q = normalizeSearchString(searchQuery);
    const normalizedText = normalizeSearchString(text);
    const idx = normalizedText.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">
          {match}
        </mark>
        {after}
      </>
    );
  };

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSearchQuery("");
      searchInputRef.current?.blur();
    }
  };

  const totalItems = inventoryData.length;
  const lowStockCount = inventoryData.filter((i) => i.lowStock).length;
  const totalValue = inventoryData.reduce((sum, i) => sum + i.quantity * i.price, 0);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 rounded-xl p-2.5">
          {(() => { const Icon = getCatConfig("equipment").icon; return <Icon className="w-6 h-6 text-[#1e40af]" />; })()}
        </div>
        <div>
          <h1 className="text-gray-900 text-[22px]" style={{ fontWeight: 700 }}>
            ניהול מלאי
          </h1>
          <p className="text-gray-500 text-[14px]">ניהול תרופות, ציוד רפואי וחומרים מתכלים</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-gray-500 text-[13px] mb-1">סה״כ פריטים</p>
          <p className="text-gray-900 text-[28px]" style={{ fontWeight: 700 }}>{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-gray-500 text-[13px]">מלאי נמוך</p>
          </div>
          <p className="text-red-600 text-[28px]" style={{ fontWeight: 700 }}>{lowStockCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-gray-500 text-[13px] mb-1">שווי מלאי כולל</p>
          <p className="text-gray-900 text-[28px]" style={{ fontWeight: 700 }}>{totalValue.toLocaleString()} ₪</p>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <input
            ref={searchInputRef}
            type="text"
            placeholder='חיפוש לפי שם פריט, מק"ט, קטגוריה...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pr-11 pl-10 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors text-[15px]"
          />
        </div>
        <button
          className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-6 py-3 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2 shrink-0"
          style={{ fontWeight: 600 }}
        >
          <Plus className="w-5 h-5" />
          הוסף פריט חדש
        </button>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: "all", label: "הכל" },
          { key: "medication", label: "תרופות" },
          { key: "equipment", label: "ציוד רפואי" },
          { key: "consumable", label: "ציוד מתכלה" },
          { key: "low-stock", label: "מלאי נמוך" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-4 py-2 rounded-lg transition-colors cursor-pointer text-[14px] border ${
              activeFilter === f.key
                ? "bg-[#1e40af] text-white border-[#1e40af]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
            style={{ fontWeight: 500 }}
          >
            {f.key === "low-stock" && (
              <AlertTriangle className="w-3.5 h-3.5 inline-block ml-1.5 -mt-0.5" />
            )}
            {f.label}
          </button>
        ))}
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {[
                  { label: "מקט", width: "w-[100px]" },
                  { label: "שם פריט", width: "" },
                  { label: "קטגוריה", width: "w-[160px]" },
                  { label: "כמות במלאי", width: "w-[140px]" },
                  { label: "מחיר ליחידה", width: "w-[130px]" },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={`text-right px-5 py-4 text-gray-500 text-[13px] ${col.width}`}
                    style={{ fontWeight: 600 }}
                  >
                    <span className="flex items-center gap-1.5 cursor-pointer hover:text-gray-700 transition-colors">
                      {col.label}
                      <ArrowUpDown className="w-3 h-3 text-gray-300" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((item, idx) => {
                  const catCfg = getCatConfig(item.category);
                  const CatIcon = catCfg.icon;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors cursor-pointer ${
                        idx === filtered.length - 1 ? "border-b-0" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <span className="text-gray-400 text-[14px] font-mono">
                          {highlightMatch(item.sku)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-gray-900 text-[15px]" style={{ fontWeight: 500 }}>
                          {highlightMatch(item.name)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[13px] ${catCfg.color}`}
                          style={{ fontWeight: 500 }}
                        >
                          <CatIcon className="w-4 h-4" />
                          {item.categoryLabel}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {item.lowStock ? (
                          <div className="flex items-center gap-2">
                            <span className="text-red-600 text-[15px]" style={{ fontWeight: 700 }}>
                              {item.quantity}
                            </span>
                            <span className="bg-red-50 border border-red-200 text-red-600 text-[11px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                              מלאי נמוך
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-900 text-[15px]" style={{ fontWeight: 500 }}>
                            {item.quantity}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-gray-700 text-[15px]" style={{ fontWeight: 500 }}>
                          {item.price} ₪
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-[15px]" style={{ fontWeight: 600 }}>
                      לא נמצאו פריטים עבור &quot;{searchQuery}&quot;
                    </p>
                    <p className="text-gray-400 text-[13px] mt-1">
                      נסו לחפש לפי שם אחר, מק&quot;ט או קטגוריה
                    </p>
                    <button
                      onClick={() => { setSearchQuery(""); setActiveFilter("all"); }}
                      className="mt-4 text-[#1e40af] text-[13px] hover:underline cursor-pointer"
                      style={{ fontWeight: 500 }}
                    >
                      נקו חיפוש והציגו הכל
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-3 flex items-center justify-between">
          <p className="text-gray-400 text-[13px]">
            מציג {filtered.length} מתוך {totalItems} פריטים
          </p>
        </div>
      </div>
    </main>
  );
}
