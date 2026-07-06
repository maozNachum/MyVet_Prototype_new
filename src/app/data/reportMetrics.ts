import { supabase } from "../../services/supabaseClient";

export type DateRangeKey = "today" | "7d" | "30d" | "90d" | "12m" | "custom" | string;

export interface OwnerRow {
  owner_id: string;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at?: string | null;
}

export interface PatientRow {
  pet_id: number;
  owner_id: string;
  pet_name?: string | null;
  species?: string | null;
  breed?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  weight?: number | null;
  created_at?: string | null;
}

export interface AppointmentRow {
  appointment_id: number;
  pet_id: number;
  start_time?: string | null;
  end_time?: string | null;
  department?: string | null;
  vet_name?: string | null;
  room?: string | null;
  appointment_type?: string | null;
  color?: string | null;
  notes?: string | null;
}

export interface MedicalVisitRow {
  visit_id: number;
  appointment_id?: number | null;
  pet_id: number;
  visit_date?: string | null;
  vet_name?: string | null;
  reason?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  attachments?: string | null;
}

export interface PaymentRow {
  payment_id: number;
  owner_id: string;
  pet_id?: number | null;
  visit_id?: number | null;
  appointment_id?: number | null;
  amount: number;
  status: "unpaid" | "paid" | "partial" | "cancelled" | "refunded" | string;
  payment_method?: string | null;
  paid_at?: string | null;
  due_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface InventoryRow {
  item_id: number;
  item_name?: string | null;
  category?: string | null;
  stock_quantity?: number | null;
  price?: number | null;
  low_stock_threshold?: number | null;
}

export interface PaymentItemRow {
  payment_item_id: number;
  payment_id?: number | null;
  visit_id?: number | null;
  item_type?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  discount?: number | null;
  total_price?: number | null;
  source_type?: string | null;
  source_id?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface LabOrderRow {
  lab_order_id: number;
  pet_id: number;
  test_name?: string | null;
  category?: string | null;
  status?: string | null;
  ordered_date?: string | null;
  ordered_by?: string | null;
  results?: string | null;
  normal_range?: string | null;
  result_value?: string | null;
  result_status?: string | null;
  completed_date?: string | null;
  notes?: string | null;
  is_urgent?: boolean | null;
}

export interface ReminderRow {
  reminder_id: number;
  owner_id?: string | null;
  pet_id?: number | null;
  title?: string | null;
  message?: string | null;
  reminder_type?: string | null;
  due_at?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface NotificationRow {
  notification_id: number;
  owner_id?: string | null;
  pet_id?: number | null;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  target?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
}

export interface StaffRow {
  staff_id: string;
  name?: string | null;
  role?: string | null;
  license_no?: string | null;
  certification_level?: string | null;
}

export interface PrescriptionRow {
  prescription_id: number;
  visit_id?: number | null;
  pet_id?: number | null;
  medication?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  start_date?: string | null;
  prescribed_by?: string | null;
}

export interface ReportDataset {
  owners: OwnerRow[];
  patients: PatientRow[];
  appointments: AppointmentRow[];
  medicalVisits: MedicalVisitRow[];
  payments: PaymentRow[];
  inventory: InventoryRow[];
  paymentItems: PaymentItemRow[];
  labOrders: LabOrderRow[];
  reminders: ReminderRow[];
  notifications: NotificationRow[];
  staff: StaffRow[];
  prescriptions: PrescriptionRow[];
}

export interface ReportError {
  table: string;
  message: string;
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

// Backwards-compatible alias. New inventory logic should use getLowStockThreshold(),
// because every inventory item can now define its own threshold.
export const LOW_STOCK_THRESHOLD = DEFAULT_LOW_STOCK_THRESHOLD;

export function getLowStockThreshold(item: Pick<InventoryRow, "low_stock_threshold">) {
  const threshold = Number(item.low_stock_threshold);
  return Number.isFinite(threshold) && threshold >= 0
    ? threshold
    : DEFAULT_LOW_STOCK_THRESHOLD;
}

export function getInventoryStatus(item: Pick<InventoryRow, "stock_quantity" | "low_stock_threshold">) {
  const quantity = Number(item.stock_quantity || 0);
  const threshold = getLowStockThreshold(item);

  if (quantity <= 0) return "out" as const;
  if (quantity <= threshold) return "low" as const;
  return "healthy" as const;
}

export function isLowInventoryItem(item: Pick<InventoryRow, "stock_quantity" | "low_stock_threshold">) {
  const status = getInventoryStatus(item);
  return status === "low" || status === "out";
}


export function getDateRangeLabel(dateRange: DateRangeKey) {
  switch (dateRange) {
    case "today": return "היום";
    case "7d": return "7 ימים";
    case "30d": return "30 יום";
    case "90d": return "רבעון";
    case "12m": return "שנה";
    case "custom": return "הכל";
    default: return String(dateRange || "הכל");
  }
}

export function getDateRangeStart(dateRange: DateRangeKey): Date | null {
  const now = new Date();
  const start = new Date(now);

  if (dateRange === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (dateRange === "7d") {
    start.setDate(start.getDate() - 7);
    return start;
  }

  if (dateRange === "30d") {
    start.setDate(start.getDate() - 30);
    return start;
  }

  if (dateRange === "90d") {
    start.setDate(start.getDate() - 90);
    return start;
  }

  if (dateRange === "12m") {
    start.setFullYear(start.getFullYear() - 1);
    return start;
  }

  return null;
}

export function inRange(dateValue: string | null | undefined, dateRange: DateRangeKey) {
  const start = getDateRangeStart(dateRange);
  if (!start) return true;
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start;
}

export function isFuture(dateValue: string | null | undefined) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date();
}

export function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatCurrency(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "לא ידוע";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "לא ידוע";
  return date.toLocaleDateString("he-IL");
}

export function ownerName(owner?: OwnerRow | null) {
  const fullName = `${owner?.owner_first_name || ""} ${owner?.owner_last_name || ""}`.trim();
  return fullName || owner?.owner_id || "ללא שם";
}

export function petName(patient?: PatientRow | null) {
  return patient?.pet_name || `חיה #${patient?.pet_id || ""}`;
}

async function selectTable<T>(table: string, orderColumn?: string): Promise<{ data: T[]; error?: ReportError }> {
  let query = supabase.from(table).select("*").limit(2000);

  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Report query failed for ${table}:`, error);
    return { data: [], error: { table, message: error.message } };
  }

  return { data: (data || []) as T[] };
}

export async function fetchReportDataset(): Promise<{ dataset: ReportDataset; errors: ReportError[] }> {
  const [
    owners,
    patients,
    appointments,
    medicalVisits,
    payments,
    inventory,
    paymentItems,
    labOrders,
    reminders,
    notifications,
    staff,
    prescriptions,
  ] = await Promise.all([
    selectTable<OwnerRow>("owners", "created_at"),
    selectTable<PatientRow>("patients", "created_at"),
    selectTable<AppointmentRow>("appointments", "start_time"),
    selectTable<MedicalVisitRow>("medical_visits", "visit_date"),
    selectTable<PaymentRow>("payments", "created_at"),
    selectTable<InventoryRow>("inventory"),
    selectTable<PaymentItemRow>("payment_items", "created_at"),
    selectTable<LabOrderRow>("lab_orders", "ordered_date"),
    selectTable<ReminderRow>("reminders", "due_at"),
    selectTable<NotificationRow>("notifications", "created_at"),
    selectTable<StaffRow>("staff"),
    selectTable<PrescriptionRow>("prescriptions", "start_date"),
  ]);

  const errors = [
    owners.error,
    patients.error,
    appointments.error,
    medicalVisits.error,
    payments.error,
    inventory.error,
    paymentItems.error,
    labOrders.error,
    reminders.error,
    notifications.error,
    staff.error,
    prescriptions.error,
  ].filter(Boolean) as ReportError[];

  return {
    dataset: {
      owners: owners.data,
      patients: patients.data,
      appointments: appointments.data,
      medicalVisits: medicalVisits.data,
      payments: payments.data,
      inventory: inventory.data,
      paymentItems: paymentItems.data,
      labOrders: labOrders.data,
      reminders: reminders.data,
      notifications: notifications.data,
      staff: staff.data,
      prescriptions: prescriptions.data,
    },
    errors,
  };
}

export function getFilteredDataset(dataset: ReportDataset, dateRange: DateRangeKey): ReportDataset {
  return {
    ...dataset,
    owners: dataset.owners.filter((o) => inRange(o.created_at, dateRange)),
    patients: dataset.patients.filter((p) => inRange(p.created_at, dateRange)),
    appointments: dataset.appointments.filter((a) => inRange(a.start_time, dateRange)),
    medicalVisits: dataset.medicalVisits.filter((v) => inRange(v.visit_date, dateRange)),
    payments: dataset.payments.filter((p) => inRange(p.created_at || p.paid_at || p.due_date, dateRange)),
    paymentItems: dataset.paymentItems.filter((item) => inRange(item.created_at, dateRange)),
    labOrders: dataset.labOrders.filter((l) => inRange(l.ordered_date || l.completed_date, dateRange)),
    reminders: dataset.reminders.filter((r) => inRange(r.due_at || r.created_at, dateRange)),
    notifications: dataset.notifications.filter((n) => inRange(n.created_at, dateRange)),
    prescriptions: dataset.prescriptions.filter((p) => inRange(p.start_date, dateRange)),
  };
}

export function buildLookups(dataset: ReportDataset) {
  const ownersById = new Map(dataset.owners.map((owner) => [owner.owner_id, owner]));
  const patientsById = new Map(dataset.patients.map((patient) => [Number(patient.pet_id), patient]));

  return { ownersById, patientsById };
}

export function getPaymentStatusLabel(status: string) {
  switch (status) {
    case "paid": return "שולם";
    case "unpaid": return "פתוח";
    case "partial": return "שולם חלקית";
    case "cancelled": return "בוטל";
    case "refunded": return "זוכה";
    default: return status || "לא ידוע";
  }
}

export function getLabStatusLabel(status?: string | null) {
  switch (status) {
    case "completed": return "הושלם";
    case "pending": return "ממתין";
    case "ordered": return "הוזמן";
    case "cancelled": return "בוטל";
    default: return status || "לא ידוע";
  }
}
