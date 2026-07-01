import {
  Search,
  Plus,
  AlertTriangle,
  ArrowUpDown,
  X,
  Edit2,
  Trash2,
  Loader2,
  Save,
  Package,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { useSearchFilter } from "../hooks/useSearchFilter";
import { normalizeSearchString } from "../utils/string";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_FALLBACK,
} from "../data/categoryConfig";

type InventoryCategory = "medication" | "equipment" | "consumable" | "other";

type InventoryRow = {
  item_id: number;
  item_name: string | null;
  category: string | null;
  stock_quantity: number | null;
  price: number | null;
};

interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category: InventoryCategory;
  categoryLabel: string;
  quantity: number;
  price: number;
  lowStock: boolean;
}

type InventoryFormValues = {
  itemName: string;
  category: InventoryCategory;
  stockQuantity: string;
  price: string;
};

const LOW_STOCK_THRESHOLD = 10;

const DEFAULT_FORM: InventoryFormValues = {
  itemName: "",
  category: "medication",
  stockQuantity: "0",
  price: "0",
};

const FILTERS = [
  { key: "all", label: "הכל" },
  { key: "medication", label: "תרופות" },
  { key: "equipment", label: "ציוד רפואי" },
  { key: "consumable", label: "ציוד מתכלה" },
  { key: "other", label: "אחר" },
  { key: "low-stock", label: "מלאי נמוך" },
] as const;

/** Resolve category config from the central map with fallback. */
function getCatConfig(category: string) {
  return (
    INVENTORY_CATEGORIES[category as keyof typeof INVENTORY_CATEGORIES] ??
    INVENTORY_CATEGORY_FALLBACK
  );
}

function normalizeCategory(category: string | null | undefined): InventoryCategory {
  if (category === "medication" || category === "equipment" || category === "consumable") {
    return category;
  }
  return "other";
}

function mapInventoryRow(row: InventoryRow): InventoryItem {
  const category = normalizeCategory(row.category);
  const catConfig = getCatConfig(category);
  const quantity = Number(row.stock_quantity ?? 0);

  return {
    id: Number(row.item_id),
    sku: String(row.item_id),
    name: row.item_name || "ללא שם פריט",
    category,
    categoryLabel: catConfig.label,
    quantity,
    price: Number(row.price ?? 0),
    lowStock: quantity <= LOW_STOCK_THRESHOLD,
  };
}

function getFormFromItem(item: InventoryItem): InventoryFormValues {
  return {
    itemName: item.name,
    category: item.category,
    stockQuantity: String(item.quantity),
    price: String(item.price),
  };
}

function validateForm(form: InventoryFormValues) {
  if (!form.itemName.trim()) return "חובה להזין שם פריט";

  const stockQuantity = Number(form.stockQuantity);
  if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
    return "כמות במלאי חייבת להיות מספר 0 ומעלה";
  }

  const price = Number(form.price);
  if (Number.isNaN(price) || price < 0) {
    return "מחיר חייב להיות מספר 0 ומעלה";
  }

  return null;
}

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formValues, setFormValues] = useState<InventoryFormValues>(DEFAULT_FORM);
  const [deleteCandidate, setDeleteCandidate] = useState<InventoryItem | null>(null);

  const loadInventory = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: inventoryError } = await supabase
      .from("inventory")
      .select("item_id,item_name,category,stock_quantity,price")
      .order("item_id", { ascending: true });

    if (inventoryError) {
      console.error("Failed to load inventory", inventoryError);
      setError("לא הצלחנו לטעון את המלאי מהמסד");
      toast.error("שגיאה בטעינת המלאי");
      setIsLoading(false);
      return;
    }

    setItems(((data || []) as InventoryRow[]).map(mapInventoryRow));
    setIsLoading(false);
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // ── Centralised search via shared hook + category filter ──
  const searchFiltered = useSearchFilter(items, searchQuery, (item) => [
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

  const totalItems = items.length;
  const lowStockCount = items.filter((i) => i.lowStock).length;
  const totalValue = items.reduce((sum, i) => sum + i.quantity * i.price, 0);

  const categoriesCount = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  // Highlight matched text helper, uses shared normalizer.
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

  const openCreateForm = () => {
    setEditingItem(null);
    setFormValues(DEFAULT_FORM);
    setIsFormOpen(true);
  };

  const openEditForm = (item: InventoryItem) => {
    setEditingItem(item);
    setFormValues(getFormFromItem(item));
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingItem(null);
    setFormValues(DEFAULT_FORM);
  };

  const handleFormChange = (field: keyof InventoryFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm(formValues);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSaving(true);

    const payload = {
      item_name: formValues.itemName.trim(),
      category: formValues.category,
      stock_quantity: Number(formValues.stockQuantity),
      price: Number(formValues.price),
    };

    if (editingItem) {
      const { data, error: updateError } = await supabase
        .from("inventory")
        .update(payload)
        .eq("item_id", editingItem.id)
        .select("item_id,item_name,category,stock_quantity,price")
        .single();

      if (updateError) {
        console.error("Failed to update inventory item", updateError);
        toast.error("לא הצלחנו לעדכן את הפריט");
        setIsSaving(false);
        return;
      }

      const updatedItem = mapInventoryRow(data as InventoryRow);
      setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      toast.success("הפריט עודכן בהצלחה");
    } else {
      const { data, error: insertError } = await supabase
        .from("inventory")
        .insert([payload])
        .select("item_id,item_name,category,stock_quantity,price")
        .single();

      if (insertError) {
        console.error("Failed to add inventory item", insertError);
        toast.error("לא הצלחנו להוסיף את הפריט");
        setIsSaving(false);
        return;
      }

      const newItem = mapInventoryRow(data as InventoryRow);
      setItems((prev) => [...prev, newItem].sort((a, b) => a.id - b.id));
      toast.success("הפריט נוסף למלאי");
    }

    setIsSaving(false);
    closeForm();
  };

  const handleDeleteItem = async () => {
    if (!deleteCandidate) return;
    setIsSaving(true);

    const { error: deleteError } = await supabase
      .from("inventory")
      .delete()
      .eq("item_id", deleteCandidate.id);

    if (deleteError) {
      console.error("Failed to delete inventory item", deleteError);
      toast.error("לא הצלחנו למחוק את הפריט");
      setIsSaving(false);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== deleteCandidate.id));
    toast.success("הפריט נמחק מהמלאי");
    setDeleteCandidate(null);
    setIsSaving(false);
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 rounded-xl p-2.5">
          {(() => {
            const Icon = getCatConfig("equipment").icon;
            return <Icon className="w-6 h-6 text-[#1e40af]" />;
          })()}
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
          <p className="text-gray-900 text-[28px]" style={{ fontWeight: 700 }}>
            {isLoading ? "..." : totalItems}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-gray-500 text-[13px]">מלאי נמוך</p>
          </div>
          <p className="text-red-600 text-[28px]" style={{ fontWeight: 700 }}>
            {isLoading ? "..." : lowStockCount}
          </p>
          <p className="text-gray-400 text-[12px] mt-1">סף: {LOW_STOCK_THRESHOLD} יחידות ומטה</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-gray-500 text-[13px] mb-1">שווי מלאי כולל</p>
          <p className="text-gray-900 text-[28px]" style={{ fontWeight: 700 }}>
            {isLoading ? "..." : `${totalValue.toLocaleString()} ₪`}
          </p>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 font-medium pointer-events-none" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium hover:text-gray-600 cursor-pointer transition-colors"
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
          onClick={openCreateForm}
          className="bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-6 py-3 rounded-xl transition-colors shadow-sm cursor-pointer text-[15px] flex items-center justify-center gap-2 shrink-0"
          style={{ fontWeight: 600 }}
        >
          <Plus className="w-5 h-5" />
          הוסף פריט חדש
        </button>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
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
            {f.key !== "all" && f.key !== "low-stock" && (
              <span className="opacity-70 mr-1">({categoriesCount[f.key] || 0})</span>
            )}
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
                  { label: "פעולות", width: "w-[130px]" },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={`text-right px-5 py-4 text-gray-500 text-[13px] ${col.width}`}
                    style={{ fontWeight: 600 }}
                  >
                    <span className="flex items-center gap-1.5 cursor-pointer hover:text-gray-700 transition-colors">
                      {col.label}
                      {col.label !== "פעולות" && <ArrowUpDown className="w-3 h-3 text-gray-300" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Loader2 className="w-8 h-8 text-[#1e40af] mx-auto mb-3 animate-spin" />
                    <p className="text-gray-500 text-[15px]" style={{ fontWeight: 600 }}>טוען מלאי מהמסד...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
                    <p className="text-red-500 text-[15px]" style={{ fontWeight: 600 }}>{error}</p>
                    <button
                      onClick={loadInventory}
                      className="mt-4 text-[#1e40af] text-[13px] hover:underline cursor-pointer"
                      style={{ fontWeight: 500 }}
                    >
                      נסה שוב
                    </button>
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((item, idx) => {
                  const catCfg = getCatConfig(item.category);
                  const CatIcon = catCfg.icon;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${
                        idx === highlightedIndex ? "bg-blue-50/60" : ""
                      } ${idx === filtered.length - 1 ? "border-b-0" : ""}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onMouseLeave={() => setHighlightedIndex(-1)}
                    >
                      <td className="px-5 py-4">
                        <span className="text-gray-500 font-medium text-[14px] font-mono">
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
                            <span className="bg-red-50 border border-red-200 text-red-600 text-[13px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
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
                          {item.price.toLocaleString()} ₪
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditForm(item)}
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="עריכת פריט"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteCandidate(item)}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            title="מחיקת פריט"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-[15px]" style={{ fontWeight: 600 }}>
                      לא נמצאו פריטים עבור &quot;{searchQuery}&quot;
                    </p>
                    <p className="text-gray-500 font-medium text-[13px] mt-1">
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
          <p className="text-gray-500 font-medium text-[13px]">
            מציג {filtered.length} מתוך {totalItems} פריטים
          </p>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center px-4">
          <form onSubmit={handleSaveItem} className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Package className="w-5 h-5 text-white/90" />
                <h2 className="text-white text-[17px]" style={{ fontWeight: 700 }}>
                  {editingItem ? "עריכת פריט מלאי" : "הוספת פריט מלאי"}
                </h2>
              </div>
              <button type="button" onClick={closeForm} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">שם פריט</label>
                <input
                  value={formValues.itemName}
                  onChange={(e) => handleFormChange("itemName", e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  placeholder='לדוגמה: אמוקסיצילין 500 מ"ג'
                />
              </div>

              <div>
                <label className="block text-gray-700 text-[14px] mb-2 font-medium">קטגוריה</label>
                <select
                  value={formValues.category}
                  onChange={(e) => handleFormChange("category", e.target.value as InventoryCategory)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px] bg-white"
                >
                  <option value="medication">תרופות</option>
                  <option value="equipment">ציוד רפואי</option>
                  <option value="consumable">ציוד מתכלה</option>
                  <option value="other">אחר</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">כמות במלאי</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formValues.stockQuantity}
                    onChange={(e) => handleFormChange("stockQuantity", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] mb-2 font-medium">מחיר ליחידה</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formValues.price}
                    onChange={(e) => handleFormChange("price", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-[15px]"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 bg-[#1e40af] hover:bg-[#1e3a8a] text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ fontWeight: 600 }}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingItem ? "שמור שינויים" : "הוסף למלאי"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px]"
                style={{ fontWeight: 500 }}
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden">
            <div className="bg-red-50 px-6 py-5 flex flex-col items-center text-center border-b border-red-100">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-gray-900 text-[18px] mb-1" style={{ fontWeight: 700 }}>מחיקת פריט</h3>
              <p className="text-gray-500 text-[13px]">האם למחוק את הפריט מהמלאי?</p>
            </div>
            <div className="p-6">
              <div className="bg-gray-50 rounded-xl p-4 mb-5">
                <p className="text-gray-900 text-[14px]" style={{ fontWeight: 700 }}>{deleteCandidate.name}</p>
                <p className="text-gray-500 text-[13px] mt-1">
                  כמות: {deleteCandidate.quantity} · מחיר: {deleteCandidate.price.toLocaleString()} ₪
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteItem}
                  disabled={isSaving}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl transition-colors cursor-pointer text-[14px] shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ fontWeight: 600 }}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  כן, מחק
                </button>
                <button
                  onClick={() => setDeleteCandidate(null)}
                  disabled={isSaving}
                  className="px-5 py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer text-[14px] disabled:opacity-70"
                  style={{ fontWeight: 500 }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
