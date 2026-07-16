import { useEffect, useMemo, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  CreditCard,
  Loader2,
  CheckCircle2,
  Banknote,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { publishPaymentToOwner } from "../../services/portalNotifications";

type EntryType =
  | "full_exam"
  | "vaccination"
  | "weight_check"
  | "prescription_only"
  | "lab"
  | "follow_up"
  | "note";

type PrescriptionDraft = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
};

type LabDraft = {
  testName: string;
  category: "blood" | "urine" | "imaging" | "biopsy" | "other";
  testDate: string;
  urgent: boolean;
  notes: string;
};

type ServiceCatalogItem = {
  service_id: number;
  service_code: string;
  service_name: string;
  category: string;
  default_price: number;
  is_active: boolean;
};

type InventoryItem = {
  item_id: number;
  item_name: string;
  category?: string | null;
  price?: number | null;
};

type CheckoutItem = {
  localId: string;
  itemType: "service" | "inventory" | "manual";
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  sourceType?: string | null;
  sourceId?: string | null;
  notes?: string;
};

interface VisitCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  ownerId?: string;
  patientId?: number;
  visitId: number;
  petName: string;
  ownerName: string;
  entryType: EntryType;
  entryLabel: string;
  visitDate: string;
  prescriptions?: PrescriptionDraft[];
  labs?: LabDraft[];
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value: number) {
  return `₪${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function totalForItem(item: CheckoutItem) {
  return Math.max(0, item.quantity * item.unitPrice - item.discount);
}

function serviceCodeForEntry(entryType: EntryType) {
  const map: Partial<Record<EntryType, string>> = {
    full_exam: "exam-full",
    vaccination: "vaccination-core",
    weight_check: "weight-check",
    prescription_only: "prescription-service",
    lab: "lab-basic-blood",
    follow_up: "follow-up",
  };
  return map[entryType];
}

function labServiceCode(category: LabDraft["category"]) {
  if (category === "urine") return "lab-urine";
  if (category === "blood") return "lab-basic-blood";
  return undefined;
}

export function VisitCheckoutModal({
  isOpen,
  onClose,
  onSaved,
  ownerId,
  patientId,
  visitId,
  petName,
  ownerName,
  entryType,
  entryLabel,
  visitDate,
  prescriptions = [],
  labs = [],
}: VisitCheckoutModalProps) {
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");

  const total = useMemo(
    () => items.reduce((sum, item) => sum + totalForItem(item), 0),
    [items],
  );
  const cashReceivedAmount = toNumber(cashReceived);
  const cashChange = Math.max(0, cashReceivedAmount - total);
  const cashIsInsufficient = cashReceivedAmount < total;

  useEffect(() => {
    if (!isOpen) return;
    setPaymentMethod("cash");
    setCashReceived("");

    async function loadPriceData() {
      setIsLoading(true);
      setError("");
      try {
        const [servicesResult, inventoryResult] = await Promise.all([
          supabase
            .from("service_catalog")
            .select(
              "service_id, service_code, service_name, category, default_price, is_active",
            )
            .eq("is_active", true)
            .order("category", { ascending: true })
            .order("service_name", { ascending: true }),
          supabase
            .from("inventory")
            .select("item_id, item_name, category, price")
            .order("item_name", { ascending: true }),
        ]);

        if (servicesResult.error) throw servicesResult.error;
        if (inventoryResult.error) throw inventoryResult.error;

        const loadedServices = (servicesResult.data || []).map(
          (service: any) => ({
            ...service,
            default_price: toNumber(service.default_price),
          }),
        );
        const loadedInventory = (inventoryResult.data || []).map(
          (item: any) => ({
            ...item,
            price: toNumber(item.price),
          }),
        );

        setServices(loadedServices);
        setInventory(loadedInventory);
        setItems(buildSuggestedItems(loadedServices, loadedInventory));
      } catch (loadError) {
        console.error("Failed loading checkout data", loadError);
        setError("לא הצלחנו לטעון את המחירון. אפשר להוסיף שורות ידנית.");
        setItems(buildSuggestedItems([], []));
      } finally {
        setIsLoading(false);
      }
    }

    loadPriceData();
  }, [isOpen, visitId]);

  const buildSuggestedItems = (
    loadedServices: ServiceCatalogItem[],
    loadedInventory: InventoryItem[],
  ) => {
    const nextItems: CheckoutItem[] = [];

    const addServiceByCode = (code?: string, fallbackName?: string) => {
      if (!code && !fallbackName) return;
      const service = code
        ? loadedServices.find((item) => item.service_code === code)
        : undefined;
      nextItems.push({
        localId: makeId(),
        itemType: service ? "service" : "manual",
        itemName: service?.service_name || fallbackName || entryLabel,
        quantity: 1,
        unitPrice: service?.default_price || 0,
        discount: 0,
        sourceType: service ? "service_catalog" : null,
        sourceId: service ? String(service.service_id) : null,
        notes: service ? undefined : "מחיר ידני",
      });
    };

    addServiceByCode(serviceCodeForEntry(entryType), entryLabel);

    labs.forEach((lab) => {
      if (!lab.testName?.trim()) return;
      const service = loadedServices.find(
        (item) => item.service_code === labServiceCode(lab.category),
      );
      nextItems.push({
        localId: makeId(),
        itemType: service ? "service" : "manual",
        itemName: service?.service_name || lab.testName.trim(),
        quantity: 1,
        unitPrice: service?.default_price || 0,
        discount: 0,
        sourceType: service ? "service_catalog" : "lab_order",
        sourceId: service ? String(service.service_id) : null,
        notes: lab.urgent ? "בדיקה דחופה" : undefined,
      });
    });

    prescriptions.forEach((prescription) => {
      const medication = prescription.medication?.trim();
      if (!medication) return;
      const inventoryMatch = loadedInventory.find(
        (item) =>
          item.item_name?.toLowerCase().includes(medication.toLowerCase()) ||
          medication.toLowerCase().includes(item.item_name?.toLowerCase()),
      );
      nextItems.push({
        localId: makeId(),
        itemType: inventoryMatch ? "inventory" : "manual",
        itemName: inventoryMatch?.item_name || medication,
        quantity: 1,
        unitPrice: toNumber(inventoryMatch?.price),
        discount: 0,
        sourceType: inventoryMatch ? "inventory" : "prescription",
        sourceId: inventoryMatch ? String(inventoryMatch.item_id) : null,
        notes:
          [prescription.dosage, prescription.frequency, prescription.duration]
            .filter(Boolean)
            .join(" · ") || undefined,
      });
    });

    if (nextItems.length === 0) {
      nextItems.push({
        localId: makeId(),
        itemType: "manual",
        itemName: entryLabel,
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        sourceType: "manual",
        sourceId: null,
      });
    }

    return nextItems;
  };

  if (!isOpen) return null;

  const addServiceItem = (serviceId: string) => {
    const service = services.find(
      (item) => String(item.service_id) === serviceId,
    );
    if (!service) return;
    setItems((current) => [
      ...current,
      {
        localId: makeId(),
        itemType: "service",
        itemName: service.service_name,
        quantity: 1,
        unitPrice: service.default_price,
        discount: 0,
        sourceType: "service_catalog",
        sourceId: String(service.service_id),
      },
    ]);
  };

  const addInventoryItem = (itemId: string) => {
    const inventoryItem = inventory.find(
      (item) => String(item.item_id) === itemId,
    );
    if (!inventoryItem) return;
    setItems((current) => [
      ...current,
      {
        localId: makeId(),
        itemType: "inventory",
        itemName: inventoryItem.item_name,
        quantity: 1,
        unitPrice: toNumber(inventoryItem.price),
        discount: 0,
        sourceType: "inventory",
        sourceId: String(inventoryItem.item_id),
      },
    ]);
  };

  const addManualItem = () => {
    setItems((current) => [
      ...current,
      {
        localId: makeId(),
        itemType: "manual",
        itemName: "",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        sourceType: "manual",
        sourceId: null,
      },
    ]);
  };

  const updateItem = (localId: string, patch: Partial<CheckoutItem>) => {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeItem = (localId: string) => {
    setItems((current) =>
      current.length <= 1
        ? current
        : current.filter((item) => item.localId !== localId),
    );
  };

  const saveCheckout = async (markPaid: boolean) => {
    const validItems = items.filter((item) => item.itemName.trim());
    if (validItems.length === 0) {
      toast.error("יש להוסיף לפחות שורת חיוב אחת");
      return;
    }
    if (total <= 0) {
      toast.error("סכום החיוב חייב להיות גדול מאפס");
      return;
    }

    setIsSaving(true);
    let createdPaymentId: number | null = null;
    let persistenceComplete = false;
    try {
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert([
          {
            owner_id: ownerId || null,
            pet_id: patientId || null,
            visit_id: visitId,
            amount: total,
            status: "unpaid",
            payment_method: null,
            paid_at: null,
            notes: `חיוב עבור ביקור ${entryLabel}`,
            created_at: new Date().toISOString(),
          },
        ])
        .select("payment_id")
        .single();

      if (paymentError) throw paymentError;
      const paymentId = Number(payment?.payment_id);
      if (!Number.isFinite(paymentId) || paymentId <= 0) {
        throw new Error("PAYMENT_ID_MISSING");
      }
      createdPaymentId = paymentId;

      const paymentItems = validItems.map((item) => ({
        payment_id: paymentId,
        visit_id: visitId,
        item_type: item.itemType,
        item_name: item.itemName.trim(),
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount,
        total_price: totalForItem(item),
        source_type: item.sourceType || null,
        source_id: item.sourceId || null,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from("payment_items")
        .insert(paymentItems);
      if (itemsError) throw itemsError;

      if (markPaid) {
        const { error: settlementError } = await supabase.rpc("myvet_staff_settle_payment", {
          requested_payment_id: paymentId,
          requested_method: paymentMethod,
          tendered_amount: paymentMethod === "cash" ? cashReceivedAmount : null,
        });
        if (settlementError) throw settlementError;
      }
      persistenceComplete = true;

      if (!markPaid && ownerId) {
        await publishPaymentToOwner({
          ownerId,
          petId: patientId || null,
          paymentId,
          amount: total,
          title: `חיוב עבור ${entryLabel}`,
        });
      }

      toast.success(
        markPaid ? "החיוב נשמר וסומן כשולם" : "החיוב נשמר לתשלום והופיע בפורטל",
      );
      onSaved?.();
      onClose();
    } catch (saveError) {
      console.error("Failed saving checkout", saveError);
      let rollbackFailed = false;
      if (createdPaymentId && !persistenceComplete) {
        const { error: itemsRollbackError } = await supabase
          .from("payment_items")
          .delete()
          .eq("payment_id", createdPaymentId);
        const { error: paymentRollbackError } = await supabase
          .from("payments")
          .delete()
          .eq("payment_id", createdPaymentId);
        rollbackFailed = Boolean(itemsRollbackError || paymentRollbackError);
      }

      toast.error(
        rollbackFailed
          ? "החיוב נשמר חלקית. בדקו את רשימת החיובים לפני ניסיון נוסף."
          : "לא הצלחנו לשמור את החיוב",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[260] bg-black/50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <header className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-gray-900 text-[22px] font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#1e40af]" /> חיוב ביקור
            </h2>
            <p className="text-gray-500 text-[13px] mt-1">
              {petName} · {ownerName} · {entryLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור חלון"
            className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50/40 space-y-5">
          {error && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-[13px] font-semibold">
              {error}
            </div>
          )}

          <section className="bg-white rounded-2xl border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              onChange={(e) => {
                addServiceItem(e.target.value);
                e.currentTarget.value = "";
              }}
              defaultValue=""
              className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px]"
            >
              <option value="">הוסף שירות מהמחירון</option>
              {services.map((service) => (
                <option key={service.service_id} value={service.service_id}>
                  {service.service_name} · {formatPrice(service.default_price)}
                </option>
              ))}
            </select>
            <select
              onChange={(e) => {
                addInventoryItem(e.target.value);
                e.currentTarget.value = "";
              }}
              defaultValue=""
              className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px]"
            >
              <option value="">הוסף מוצר מהמלאי</option>
              {inventory.map((item) => (
                <option key={item.item_id} value={item.item_id}>
                  {item.item_name} · {formatPrice(toNumber(item.price))}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addManualItem}
              className="px-4 py-2.5 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 text-[14px] font-bold flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> שורה ידנית
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 text-gray-500 text-[12px] font-bold">
              <span className="col-span-4">פריט</span>
              <span className="col-span-2">כמות</span>
              <span className="col-span-2">מחיר</span>
              <span className="col-span-2">הנחה</span>
              <span className="col-span-1">סה״כ</span>
              <span className="col-span-1" />
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-gray-500 text-[14px] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> טוען מחירון
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <div
                    key={item.localId}
                    className="grid grid-cols-12 gap-3 px-4 py-3 items-center"
                  >
                    <input
                      value={item.itemName}
                      onChange={(e) =>
                        updateItem(item.localId, { itemName: e.target.value })
                      }
                      className="col-span-4 px-3 py-2.5 rounded-xl border border-gray-200 text-[14px]"
                      placeholder="שם פריט"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.localId, {
                          quantity: Math.max(0, toNumber(e.target.value)),
                        })
                      }
                      className="col-span-2 px-3 py-2.5 rounded-xl border border-gray-200 text-[14px]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(item.localId, {
                          unitPrice: Math.max(0, toNumber(e.target.value)),
                        })
                      }
                      className="col-span-2 px-3 py-2.5 rounded-xl border border-gray-200 text-[14px]"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount}
                      onChange={(e) =>
                        updateItem(item.localId, {
                          discount: Math.max(0, toNumber(e.target.value)),
                        })
                      }
                      className="col-span-2 px-3 py-2.5 rounded-xl border border-gray-200 text-[14px]"
                    />
                    <span className="col-span-1 text-gray-900 text-[13px] font-bold">
                      {formatPrice(totalForItem(item))}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.localId)}
                      className="col-span-1 w-9 h-9 rounded-xl hover:bg-red-50 text-red-500 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        <footer className="px-6 py-4 border-t border-gray-100 bg-white flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-gray-500 text-[12px] font-semibold">
              סה״כ לתשלום
            </p>
            <p className="text-gray-900 text-[26px] font-bold">
              {formatPrice(total)}
            </p>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-[170px_minmax(190px,1fr)] gap-3 max-w-xl">
            <label className="space-y-1">
              <span className="text-gray-600 text-[11px] font-bold">אמצעי תשלום בצוות</span>
              <select
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value);
                  setCashReceived("");
                }}
                className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-semibold"
              >
                <option value="cash">מזומן</option>
                <option value="credit">אשראי</option>
                <option value="bit">Bit</option>
                <option value="bank_transfer">העברה בנקאית</option>
                <option value="other">אחר</option>
              </select>
            </label>
            {paymentMethod === "cash" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="flex items-center gap-2 text-emerald-800 text-[11px] font-extrabold mb-1.5">
                  <Calculator className="w-3.5 h-3.5" /> מחשבון עודף
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={total}
                    step="0.01"
                    inputMode="decimal"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    className="min-w-0 flex-1 h-9 rounded-lg border border-emerald-200 bg-white px-2 text-[14px] font-bold"
                    placeholder="התקבל ₪"
                  />
                  <div className={`min-w-[105px] rounded-lg px-2 py-1.5 text-center ${cashReceived && !cashIsInsufficient ? "bg-emerald-600 text-white" : "bg-white text-gray-600"}`}>
                    <span className="block text-[10px] font-bold">עודף</span>
                    <span className="block text-[14px] font-extrabold">{formatPrice(cashChange)}</span>
                  </div>
                </div>
                {cashReceived && cashIsInsufficient && <p className="text-amber-700 text-[10px] font-bold mt-1">הסכום שהתקבל נמוך מהסכום לתשלום</p>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-[14px] font-bold"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => saveCheckout(false)}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:bg-gray-300 text-[14px] font-bold flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}{" "}
              שמור לתשלום
            </button>
            <button
              type="button"
              onClick={() => saveCheckout(true)}
              disabled={isSaving || (paymentMethod === "cash" && (!cashReceived || cashIsInsufficient))}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 text-[14px] font-bold flex items-center gap-2"
            >
              {paymentMethod === "cash" ? <Banknote className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {paymentMethod === "cash" ? "קבל מזומן וסמן כשולם" : "סמן כשולם"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
