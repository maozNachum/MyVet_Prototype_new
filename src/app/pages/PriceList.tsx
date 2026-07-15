import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";

type ServiceCatalogRow = {
  service_id: number;
  service_code: string;
  service_name: string;
  category: string;
  default_price: number | string;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type ServiceForm = {
  serviceName: string;
  category: string;
  defaultPrice: string;
  isActive: boolean;
};

const CATEGORIES = [
  "בדיקות",
  "חיסונים",
  "מעבדה",
  "אשפוז",
  "ייעוץ דיגיטלי",
  "טיפולים",
  "שירות כללי",
] as const;

const emptyForm: ServiceForm = {
  serviceName: "",
  category: "בדיקות",
  defaultPrice: "",
  isActive: true,
};

function formatCurrency(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function getCategoryClass(category: string) {
  switch (category) {
    case "בדיקות":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "חיסונים":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "מעבדה":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "אשפוז":
      return "bg-purple-50 text-purple-700 border-purple-100";
    case "ייעוץ דיגיטלי":
      return "bg-indigo-50 text-indigo-700 border-indigo-100";
    case "טיפולים":
      return "bg-rose-50 text-rose-700 border-rose-100";
    default:
      return "bg-gray-50 text-gray-700 border-gray-100";
  }
}

function makeServiceCode(serviceName: string, category: string) {
  const categoryPrefix: Record<string, string> = {
    בדיקות: "exam",
    חיסונים: "vaccine",
    מעבדה: "lab",
    אשפוז: "hospitalization",
    "ייעוץ דיגיטלי": "digital",
    טיפולים: "treatment",
    "שירות כללי": "general",
  };

  const base = serviceName
    .trim()
    .toLowerCase()
    .replace(/[\u0590-\u05ff]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);

  const safeBase = base || String(Date.now()).slice(-7);
  return `${categoryPrefix[category] || "service"}-${safeBase}`;
}

function normalizePrice(value: string) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function PriceList() {
  const [services, setServices] = useState<ServiceCatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceCatalogRow | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [formError, setFormError] = useState("");

  const loadServices = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("service_id, service_code, service_name, category, default_price, is_active, created_at, updated_at")
        .order("category", { ascending: true })
        .order("service_name", { ascending: true });

      if (error) throw error;
      setServices((data || []) as ServiceCatalogRow[]);
    } catch (error) {
      console.error("price list load error", error);
      toast.error("לא הצלחנו לטעון את המחירון");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return services.filter((service) => {
      const matchesSearch = !query || [service.service_name, service.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
      const matchesCategory = categoryFilter === "all" || service.category === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && service.is_active) ||
        (statusFilter === "inactive" && !service.is_active);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [services, searchQuery, categoryFilter, statusFilter]);

  const activeServices = services.filter((service) => service.is_active);
  const inactiveServices = services.filter((service) => !service.is_active);
  const averagePrice = activeServices.length
    ? activeServices.reduce((sum, service) => sum + Number(service.default_price || 0), 0) / activeServices.length
    : 0;

  const openCreateModal = () => {
    setEditingService(null);
    setForm(emptyForm);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (service: ServiceCatalogRow) => {
    setEditingService(service);
    setForm({
      serviceName: service.service_name || "",
      category: service.category || "שירות כללי",
      defaultPrice: String(Number(service.default_price || 0)),
      isActive: Boolean(service.is_active),
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingService(null);
    setForm(emptyForm);
    setFormError("");
  };

  const validateForm = () => {
    if (!form.serviceName.trim()) return "חובה להזין שם שירות";
    if (!form.category) return "חובה לבחור קטגוריה";
    const price = normalizePrice(form.defaultPrice);
    if (price === null) return "חובה להזין מחיר תקין";
    return "";
  };

  const saveService = async () => {
    const errorMessage = validateForm();
    if (errorMessage) {
      setFormError(errorMessage);
      toast.error(errorMessage);
      return;
    }

    const price = normalizePrice(form.defaultPrice) || 0;

    try {
      setIsSaving(true);
      setFormError("");

      if (editingService) {
        const { error } = await supabase
          .from("service_catalog")
          .update({
            service_name: form.serviceName.trim(),
            category: form.category,
            default_price: price,
            is_active: form.isActive,
          })
          .eq("service_id", editingService.service_id);

        if (error) throw error;
        toast.success("המחיר עודכן בהצלחה");
      } else {
        const serviceCode = makeServiceCode(form.serviceName, form.category);
        const { error } = await supabase
          .from("service_catalog")
          .insert({
            service_code: serviceCode,
            service_name: form.serviceName.trim(),
            category: form.category,
            default_price: price,
            is_active: form.isActive,
          });

        if (error) throw error;
        toast.success("השירות נוסף למחירון");
      }

      // closeModal intentionally ignores user-initiated closes while saving.
      // The successful save path must reset the modal explicitly before finally
      // releases the saving lock.
      setIsModalOpen(false);
      setEditingService(null);
      setForm(emptyForm);
      setFormError("");
      await loadServices();
    } catch (error: any) {
      console.error("price list save error", error);
      if (String(error?.message || "").includes("duplicate")) {
        toast.error("כבר קיים שירות דומה במחירון");
      } else {
        toast.error("לא הצלחנו לשמור את השירות");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const toggleServiceStatus = async (service: ServiceCatalogRow) => {
    try {
      const { error } = await supabase
        .from("service_catalog")
        .update({ is_active: !service.is_active })
        .eq("service_id", service.service_id);

      if (error) throw error;
      toast.success(service.is_active ? "השירות הועבר ללא פעיל" : "השירות הופעל מחדש");
      await loadServices();
    } catch (error) {
      console.error("price list toggle error", error);
      toast.error("לא הצלחנו לעדכן את השירות");
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-7 sm:px-6 sm:py-8" dir="rtl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 rounded-2xl p-3">
            <Tag className="w-6 h-6 text-[#1e40af]" />
          </div>
          <div>
            <h1 className="text-gray-900 text-[26px] font-bold">מחירון מרפאה</h1>
            <p className="text-gray-500 text-[15px] mt-1">ניהול מחירי שירותים לביקורים, מעבדה, אשפוז וייעוץ</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadServices}
            disabled={isLoading}
            className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 text-[14px] font-semibold disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            רענן
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="h-11 px-5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] transition-colors flex items-center gap-2 text-[14px] font-bold shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            הוסף שירות
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-[13px] font-medium">שירותים פעילים</p>
            <p className="text-gray-900 text-[28px] font-bold mt-1">{activeServices.length}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-[13px] font-medium">מחיר ממוצע</p>
            <p className="text-gray-900 text-[28px] font-bold mt-1">{formatCurrency(averagePrice)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Settings2 className="w-6 h-6 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-[13px] font-medium">לא פעילים</p>
            <p className="text-gray-900 text-[28px] font-bold mt-1">{inactiveServices.length}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-gray-500" />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-gray-900 text-[18px] font-bold">שירותים ומחירים</h2>
            <p className="text-gray-500 text-[13px] mt-1">המחירים ישמשו כברירת מחדל בעת יצירת חיוב לביקור</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 lg:min-w-[560px]">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="חיפוש שירות"
                className="w-full h-11 pr-10 pl-4 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="all">כל הקטגוריות</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "active" | "inactive" | "all")}
              className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="active">פעילים</option>
              <option value="inactive">לא פעילים</option>
              <option value="all">הכול</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-gray-500">
            <RefreshCw className="w-7 h-7 animate-spin mb-3 text-blue-500" />
            <p className="text-[14px] font-medium">טוען מחירון...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Tag className="w-9 h-9 mx-auto mb-3 text-gray-300" />
            <p className="text-[15px] font-bold text-gray-700">לא נמצאו שירותים</p>
            <p className="text-[13px] mt-1">אפשר להוסיף שירות חדש למחירון</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[760px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-[12px] text-gray-500 font-bold">שירות</th>
                  <th className="px-5 py-3 text-[12px] text-gray-500 font-bold">קטגוריה</th>
                  <th className="px-5 py-3 text-[12px] text-gray-500 font-bold">מחיר</th>
                  <th className="px-5 py-3 text-[12px] text-gray-500 font-bold">סטטוס</th>
                  <th className="px-5 py-3 text-[12px] text-gray-500 font-bold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredServices.map((service) => (
                  <tr key={service.service_id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-gray-900 text-[14px] font-bold">{service.service_name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full border text-[12px] font-bold ${getCategoryClass(service.category)}`}>
                        {service.category || "שירות כללי"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-900 text-[15px] font-bold">
                      {formatCurrency(service.default_price)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-bold ${service.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {service.is_active ? "פעיל" : "לא פעיל"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(service)}
                          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors flex items-center gap-1.5 text-[12px] font-bold cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          ערוך
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleServiceStatus(service)}
                          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-[12px] font-bold cursor-pointer"
                        >
                          {service.is_active ? "הפוך ללא פעיל" : "הפעל"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 text-[18px] font-bold">
                  {editingService ? "עריכת שירות" : "הוספת שירות למחירון"}
                </h3>
                <p className="text-gray-500 text-[13px] mt-1">המחיר ניתן לשינוי בעת יצירת חיוב</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 cursor-pointer"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-red-700 text-[13px] font-bold">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-gray-700 text-[14px] font-bold mb-2">שם שירות</label>
                <input
                  value={form.serviceName}
                  onChange={(event) => setForm((current) => ({ ...current, serviceName: event.target.value }))}
                  placeholder="לדוגמה: בדיקה רפואית מלאה"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 text-[14px] font-bold mb-2">קטגוריה</label>
                  <select
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 text-[14px] font-bold mb-2">מחיר</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.defaultPrice}
                    onChange={(event) => setForm((current) => ({ ...current, defaultPrice: event.target.value }))}
                    placeholder="0"
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="w-4 h-4 accent-[#1e40af]"
                />
                <span className="text-gray-800 text-[14px] font-bold">שירות פעיל במחירון</span>
              </label>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                className="h-10 px-5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors text-[14px] font-bold disabled:opacity-60 cursor-pointer"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={saveService}
                disabled={isSaving}
                className="h-10 px-6 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] transition-colors text-[14px] font-bold disabled:opacity-70 cursor-pointer"
              >
                {isSaving ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
