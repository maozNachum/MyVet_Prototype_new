import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";

// ─── Types ───────────────────────────────────────────────────────────
export interface LabOrder {
  id: number;
  patientId: number;
  visitId?: number | null;
  petName: string;
  testName: string;
  category: "blood" | "urine" | "imaging" | "biopsy" | "other";
  status: "ordered" | "in-progress" | "completed";
  orderedDate: string;
  testDate?: string;
  orderedBy: string;
  results?: string;
  normalRange?: string;
  resultValue?: string;
  resultStatus?: "normal" | "abnormal" | "critical";
  completedDate?: string;
  notes?: string;
  urgent?: boolean;
}

const categoryLabels: Record<LabOrder["category"], string> = {
  blood: "בדיקת דם",
  urine: "בדיקת שתן",
  imaging: "הדמיה",
  biopsy: "ביופסיה",
  other: "אחר",
};

export { categoryLabels };

// ─── Context ─────────────────────────────────────────────────────────
interface LabStoreContextType {
  labOrders: LabOrder[];
  isLoading: boolean;
  error: string | null;
  loadLabOrders: () => Promise<void>;
  addLabOrder: (order: Omit<LabOrder, "id">) => Promise<LabOrder | null>;
  updateLabOrder: (id: number, updates: Partial<LabOrder>) => Promise<LabOrder | null>;
  deleteLabOrder: (id: number) => Promise<void>;
  getLabOrdersForPatient: (patientId: number) => LabOrder[];
}

const LabStoreContext = createContext<LabStoreContextType | null>(null);

function formatDateForUi(value?: string | null) {
  if (!value) return "לא ידוע";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parseDateToIso(value?: string | null) {
  if (!value) return new Date().toISOString();

  // Supports DD/MM/YYYY from the existing UI.
  const parts = value.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts.map((p) => Number(p));
    if (day && month && year) {
      const d = new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes());
      return d.toISOString();
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeCategory(value?: string | null): LabOrder["category"] {
  if (value === "blood" || value === "urine" || value === "imaging" || value === "biopsy" || value === "other") {
    return value;
  }
  return "other";
}

function normalizeStatus(value?: string | null): LabOrder["status"] {
  if (value === "ordered" || value === "in-progress" || value === "completed") {
    return value;
  }
  return "ordered";
}

function normalizeResultStatus(value?: string | null): LabOrder["resultStatus"] | undefined {
  if (value === "normal" || value === "abnormal" || value === "critical") {
    return value;
  }
  return undefined;
}

function mapLabOrderRow(row: any): LabOrder {
  return {
    id: Number(row.lab_order_id),
    patientId: Number(row.pet_id),
    visitId: row.visit_id ? Number(row.visit_id) : null,
    petName: row.patients?.pet_name || row.pet_name || "",
    testName: row.test_name || "בדיקת מעבדה",
    category: normalizeCategory(row.category),
    status: normalizeStatus(row.status),
    orderedDate: formatDateForUi(row.ordered_date),
    testDate: row.test_date || undefined,
    // ordered_by is uuid in the DB. Until staff authentication is connected to staff.staff_id,
    // we keep it null in DB and show a readable fallback in the UI.
    orderedBy: row.staff?.name || "צוות המרפאה",
    results: row.results || undefined,
    normalRange: row.normal_range || undefined,
    resultValue: row.result_value || undefined,
    resultStatus: normalizeResultStatus(row.result_status),
    completedDate: row.completed_date ? formatDateForUi(row.completed_date) : undefined,
    notes: row.notes || undefined,
    urgent: Boolean(row.is_urgent),
  };
}

function buildInsertPayload(order: Omit<LabOrder, "id">) {
  return {
    pet_id: order.patientId,
    visit_id: order.visitId || null,
    test_name: order.testName,
    category: order.category,
    status: order.status,
    ordered_date: parseDateToIso(order.orderedDate),
    test_date: order.testDate || null,
    // The database column is uuid. Until login is connected to staff.staff_id, keep it null.
    ordered_by: null,
    results: order.results || null,
    normal_range: order.normalRange || null,
    result_value: order.resultValue || null,
    result_status: order.resultStatus || null,
    completed_date: order.completedDate ? parseDateToIso(order.completedDate) : null,
    notes: order.notes || null,
    is_urgent: Boolean(order.urgent),
  };
}

function buildUpdatePayload(updates: Partial<LabOrder>) {
  const patch: Record<string, any> = {};

  if (updates.patientId !== undefined) patch.pet_id = updates.patientId;
  if (updates.visitId !== undefined) patch.visit_id = updates.visitId || null;
  if (updates.testName !== undefined) patch.test_name = updates.testName;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.orderedDate !== undefined) patch.ordered_date = parseDateToIso(updates.orderedDate);
  if (updates.testDate !== undefined) patch.test_date = updates.testDate || null;
  if (updates.results !== undefined) patch.results = updates.results || null;
  if (updates.normalRange !== undefined) patch.normal_range = updates.normalRange || null;
  if (updates.resultValue !== undefined) patch.result_value = updates.resultValue || null;
  if (updates.resultStatus !== undefined) patch.result_status = updates.resultStatus || null;
  if (updates.completedDate !== undefined) patch.completed_date = updates.completedDate ? parseDateToIso(updates.completedDate) : null;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;
  if (updates.urgent !== undefined) patch.is_urgent = Boolean(updates.urgent);

  return patch;
}

export function LabStoreProvider({ children }: { children: ReactNode }) {
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadLabOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: loadError } = await supabase
        .from("lab_orders")
        .select("*")
        .order("ordered_date", { ascending: false });

      if (loadError) throw loadError;

      setLabOrders((data || []).map(mapLabOrderRow));
    } catch (err: any) {
      console.error("Failed loading lab orders from Supabase", err);
      setError(err?.message || "שגיאה בטעינת בדיקות מעבדה");
      toast.error("לא הצלחנו לטעון בדיקות מעבדה");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLabOrders();
  }, [loadLabOrders]);

  const addLabOrder = useCallback(async (order: Omit<LabOrder, "id">) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("lab_orders")
        .insert(buildInsertPayload(order))
        .select("*")
        .single();

      if (insertError) throw insertError;

      const mapped = { ...mapLabOrderRow(data), petName: order.petName };
      setLabOrders((prev) => [mapped, ...prev.filter((o) => o.id !== mapped.id)]);
      toast.success("בדיקת המעבדה נשלחה ונשמרה במסד הנתונים");
      return mapped;
    } catch (err: any) {
      console.error("Failed to add lab order", err);
      setError(err?.message || "אירעה שגיאה בשליחת בדיקת המעבדה");
      toast.error("לא הצלחנו לשמור את בדיקת המעבדה");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateLabOrder = useCallback(async (id: number, updates: Partial<LabOrder>) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("lab_orders")
        .update(buildUpdatePayload(updates))
        .eq("lab_order_id", id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      const mapped = mapLabOrderRow(data);
      setLabOrders((prev) => prev.map((o) => (o.id === id ? { ...mapped, petName: o.petName } : o)));
      toast.success("תוצאות הבדיקה עודכנו במסד הנתונים");
      return mapped;
    } catch (err: any) {
      console.error("Failed to update lab order", err);
      setError(err?.message || "אירעה שגיאה בעדכון בדיקת המעבדה");
      toast.error("לא הצלחנו לעדכן את בדיקת המעבדה");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteLabOrder = useCallback(async (id: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("lab_orders")
        .delete()
        .eq("lab_order_id", id);

      if (deleteError) throw deleteError;

      setLabOrders((prev) => prev.filter((o) => o.id !== id));
      toast.success("בדיקת המעבדה נמחקה");
    } catch (err: any) {
      console.error("Failed to delete lab order", err);
      setError(err?.message || "שגיאה במחיקת בדיקת מעבדה");
      toast.error("לא הצלחנו למחוק את בדיקת המעבדה");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLabOrdersForPatient = useCallback((patientId: number) => {
    return labOrders.filter((o) => Number(o.patientId) === Number(patientId));
  }, [labOrders]);

  return (
    <LabStoreContext.Provider value={{ labOrders, isLoading, error, loadLabOrders, addLabOrder, updateLabOrder, deleteLabOrder, getLabOrdersForPatient }}>
      {children}
    </LabStoreContext.Provider>
  );
}

export function useLabStore() {
  const ctx = useContext(LabStoreContext);
  if (!ctx) throw new Error("useLabStore must be used within LabStoreProvider");
  return ctx;
}
