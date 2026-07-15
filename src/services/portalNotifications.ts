import { supabase } from "./supabaseClient";

export type PortalNotificationType =
  | "info"
  | "success"
  | "warning"
  | "payment"
  | "appointment"
  | "medical"
  | "medical_summary"
  | "lab"
  | "document"
  | "digital";

export type PortalActionView =
  | "home"
  | "appointments"
  | "digital"
  | "pets"
  | "payments"
  | "notifications"
  | "profile";

export type NotificationSource = "notification" | "reminder";

export type OwnerPortalEventType =
  | "medical_summary"
  | "prescription"
  | "lab_result"
  | "document"
  | "payment"
  | "digital_message"
  | "digital_file"
  | "video_link"
  | "appointment_created"
  | "appointment_updated"
  | "appointment_cancelled"
  | "follow_up"
  | "general";

export interface PublishToOwnerPortalInput {
  ownerId: string;
  petId?: number | null;
  title: string;
  message: string;
  type?: PortalNotificationType;
  actionView?: PortalActionView;
  actionUrl?: string | null;
  target?: "owner" | "staff" | "both";
  createdByRole?: "clinic_admin" | "vet" | "nurse" | "secretary" | "staff" | "system" | "owner";
  eventType?: OwnerPortalEventType;
  sourceType?: string | null;
  sourceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateOwnerReminderInput {
  ownerId: string;
  petId?: number | null;
  visitId?: number | null;
  appointmentId?: number | null;
  title: string;
  message: string;
  reminderType?: string;
  dueAt: string;
  actionView?: PortalActionView;
  actionUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
}

export function portalActionUrl(_ownerId: string, view: PortalActionView = "home") {
  const safeView = encodeURIComponent(view);
  return `/portal?view=${safeView}`;
}

export function normalizePortalNotificationType(type?: string | null): PortalNotificationType {
  if (!type) return "info";
  if (type === "medical_summary" || type === "prescription") return "medical";
  if (type === "lab_result") return "lab";
  if (type === "file" || type === "document_upload") return "document";
  if (["info", "success", "warning", "payment", "appointment", "medical", "lab", "document", "digital"].includes(type)) {
    return type as PortalNotificationType;
  }
  return "info";
}

export function defaultActionViewForType(type?: string | null): PortalActionView {
  const normalized = normalizePortalNotificationType(type);

  if (normalized === "payment") return "payments";
  if (normalized === "appointment") return "appointments";
  if (normalized === "medical" || normalized === "lab") return "pets";
  if (normalized === "document") return "digital";
  if (normalized === "digital") return "digital";

  return "notifications";
}

export function portalActionLabelForType(type?: string | null) {
  const normalized = normalizePortalNotificationType(type);

  if (normalized === "payment") return "לתשלום";
  if (normalized === "appointment") return "צפייה בתורים";
  if (normalized === "medical") return "פתיחת תיק רפואי";
  if (normalized === "lab") return "צפייה בתיק";
  if (normalized === "document") return "פתיחת המרפאה הדיגיטלית";
  if (normalized === "digital") return "פתיחת שיחה";

  return "צפייה";
}

export function extractViewFromActionUrl(actionUrl?: string | null): PortalActionView | null {
  if (!actionUrl) return null;

  try {
    const url = actionUrl.startsWith("http")
      ? new URL(actionUrl)
      : new URL(actionUrl, "https://myvet.local");

    const view = url.searchParams.get("view") as PortalActionView | null;
    const allowed: PortalActionView[] = ["home", "appointments", "digital", "pets", "payments", "notifications", "profile"];
    return view && allowed.includes(view) ? view : null;
  } catch {
    return null;
  }
}

function cleanText(value: string, fallback: string) {
  return (value || "").trim() || fallback;
}

async function insertOwnerNotification(input: PublishToOwnerPortalInput) {
  const type = normalizePortalNotificationType(input.type || "info");
  const actionView = input.actionView || defaultActionViewForType(type);
  const actionUrl = input.actionUrl ?? portalActionUrl(input.ownerId, actionView);

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      owner_id: input.ownerId,
      pet_id: input.petId ?? null,
      title: cleanText(input.title, "עדכון חדש מהמרפאה"),
      message: cleanText(input.message, "יש עדכון חדש באזור האישי."),
      type,
      target: input.target || "owner",
      is_read: false,
      read_at: null,
      action_url: actionUrl,
      created_by_role: input.createdByRole || "system",
      event_type: input.eventType || "general",
      source_type: input.sourceType || input.eventType || null,
      source_id: input.sourceId !== undefined && input.sourceId !== null ? String(input.sourceId) : null,
      metadata: input.metadata || {},
    })
    .select("notification_id")
    .single();

  if (error) throw error;
  return data;
}

export async function publishToOwnerPortal(input: PublishToOwnerPortalInput) {
  if (!input.ownerId) throw new Error("Missing ownerId for owner portal notification");
  return insertOwnerNotification(input);
}

export async function safePublishToOwnerPortal(input: PublishToOwnerPortalInput) {
  try {
    return await publishToOwnerPortal(input);
  } catch (error) {
    console.warn("Owner portal publish failed", error);
    return null;
  }
}

// Backward-compatible name for older components.
export async function createOwnerNotification(input: PublishToOwnerPortalInput) {
  return publishToOwnerPortal(input);
}

export async function createOwnerReminder(input: CreateOwnerReminderInput) {
  const reminderType = input.reminderType || "follow_up";
  const actionView = input.actionView || defaultActionViewForType(reminderType);
  const actionUrl = input.actionUrl ?? portalActionUrl(input.ownerId, actionView);

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      owner_id: input.ownerId,
      pet_id: input.petId ?? null,
      visit_id: input.visitId ?? null,
      appointment_id: input.appointmentId ?? null,
      title: cleanText(input.title, "תזכורת מהמרפאה"),
      message: cleanText(input.message, "יש תזכורת חדשה באזור האישי."),
      reminder_type: reminderType,
      due_at: input.dueAt,
      status: "open",
      is_read: false,
      read_at: null,
      action_url: actionUrl,
      source_type: input.sourceType || reminderType,
      source_id: input.sourceId !== undefined && input.sourceId !== null ? String(input.sourceId) : null,
      metadata: input.metadata || {},
    })
    .select("reminder_id")
    .single();

  if (error) throw error;
  return data;
}

export async function publishTreatmentSummaryToOwner(input: {
  ownerId: string;
  petId?: number | null;
  visitId?: number | null;
  petName?: string;
  summaryText: string;
}) {
  return safePublishToOwnerPortal({
    ownerId: input.ownerId,
    petId: input.petId ?? null,
    title: "סיכום טיפול חדש",
    message: input.summaryText.trim(),
    type: "medical",
    actionView: "pets",
    createdByRole: "staff",
    eventType: "medical_summary",
    sourceType: "medical_visit",
    sourceId: input.visitId ?? null,
    metadata: { petName: input.petName || null },
  });
}

export async function publishPrescriptionToOwner(input: {
  ownerId: string;
  petId?: number | null;
  visitId?: number | null;
  petName?: string;
  prescriptionText: string;
}) {
  return safePublishToOwnerPortal({
    ownerId: input.ownerId,
    petId: input.petId ?? null,
    title: "מרשם חדש זמין",
    message: input.prescriptionText.trim(),
    type: "medical",
    actionView: "pets",
    createdByRole: "staff",
    eventType: "prescription",
    sourceType: "prescription",
    sourceId: input.visitId ?? null,
    metadata: { petName: input.petName || null },
  });
}

export async function publishLabResultToOwner(input: {
  ownerId: string;
  petId?: number | null;
  labOrderId?: number | null;
  petName?: string;
  testName?: string | null;
  resultText?: string | null;
}) {
  const testName = input.testName || "בדיקת מעבדה";
  const resultLine = input.resultText?.trim() ? `\n${input.resultText.trim()}` : "";
  return safePublishToOwnerPortal({
    ownerId: input.ownerId,
    petId: input.petId ?? null,
    title: "תוצאת בדיקה זמינה",
    message: `${testName} זמינה לצפייה באזור האישי.${resultLine}`,
    type: "lab",
    actionView: "pets",
    createdByRole: "staff",
    eventType: "lab_result",
    sourceType: "lab_order",
    sourceId: input.labOrderId ?? null,
    metadata: { petName: input.petName || null, testName },
  });
}

export async function publishPaymentToOwner(input: {
  ownerId: string;
  petId?: number | null;
  paymentId?: number | null;
  amount: number;
  title?: string;
}) {
  return safePublishToOwnerPortal({
    ownerId: input.ownerId,
    petId: input.petId ?? null,
    title: "חיוב חדש לתשלום",
    message: `${input.title || "נוסף חיוב חדש"} בסך ₪${Number(input.amount || 0).toLocaleString()}.`,
    type: "payment",
    actionView: "payments",
    createdByRole: "staff",
    eventType: "payment",
    sourceType: "payment",
    sourceId: input.paymentId ?? null,
  });
}

export async function publishDigitalMessageToOwner(input: {
  ownerId: string;
  petId?: number | null;
  conversationId?: number | null;
  subject?: string | null;
  fileAttached?: boolean;
  videoLink?: boolean;
}) {
  const title = input.videoLink
    ? "קישור לשיחת וידאו זמין"
    : input.fileAttached
      ? "קובץ חדש מהמרפאה"
      : "הודעה חדשה מהמרפאה";

  const message = input.videoLink
    ? "המרפאה שלחה קישור לשיחת וידאו. אפשר להיכנס דרך המרפאה הדיגיטלית."
    : input.fileAttached
      ? "המרפאה צירפה קובץ חדש לשיחה הדיגיטלית."
      : `יש הודעה חדשה בשיחה${input.subject ? `: ${input.subject}` : ""}.`;

  return safePublishToOwnerPortal({
    ownerId: input.ownerId,
    petId: input.petId ?? null,
    title,
    message,
    type: "digital",
    actionView: "digital",
    createdByRole: "staff",
    eventType: input.videoLink ? "video_link" : input.fileAttached ? "digital_file" : "digital_message",
    sourceType: "conversation",
    sourceId: input.conversationId ?? null,
  });
}

export async function publishDocumentToOwner(input: {
  ownerId: string;
  petId?: number | null;
  documentId?: number | null;
  fileName?: string | null;
}) {
  return safePublishToOwnerPortal({
    ownerId: input.ownerId,
    petId: input.petId ?? null,
    title: "קובץ חדש מהמרפאה",
    message: input.fileName ? `קובץ חדש זמין במרפאה הדיגיטלית: ${input.fileName}` : "קובץ חדש זמין במרפאה הדיגיטלית.",
    type: "document",
    actionView: "digital",
    createdByRole: "staff",
    eventType: "document",
    sourceType: "document",
    sourceId: input.documentId ?? null,
  });
}

export async function markPortalNotificationRead(source: NotificationSource, sourceId: number) {
  const now = new Date().toISOString();

  if (source === "notification") {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("notification_id", sourceId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("reminders")
    .update({ is_read: true, read_at: now, status: "sent" })
    .eq("reminder_id", sourceId);

  if (error) throw error;
}

export async function markAllPortalNotificationsRead(ownerId: string) {
  const now = new Date().toISOString();

  const [notificationsResult, remindersResult] = await Promise.all([
    supabase
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("owner_id", ownerId)
      .in("target", ["owner", "both"])
      .eq("is_read", false),
    supabase
      .from("reminders")
      .update({ is_read: true, read_at: now, status: "sent" })
      .eq("owner_id", ownerId)
      .in("status", ["open", "pending"]),
  ]);

  if (notificationsResult.error) throw notificationsResult.error;
  if (remindersResult.error) throw remindersResult.error;
}
