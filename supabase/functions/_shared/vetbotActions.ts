import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

export type VetBotRole = "clinic_admin" | "vet" | "nurse" | "secretary" | "owner";

export type VetBotActionType =
  | "book_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "adjust_inventory"
  | "archive_conversation"
  | "restore_conversation"
  | "set_conversation_priority"
  | "set_lab_urgency"
  | "block_booking_time"
  | "draft_message"
  | "navigate"
  | "forbidden"
  | "none";

export interface ModelActionProposal {
  type?: VetBotActionType;
  intentSummary?: string;
  missingFields?: string[];
  patientName?: string;
  patientSpecies?: string;
  appointmentRef?: number;
  appointmentDate?: string;
  appointmentTime?: string;
  currentAppointmentDate?: string;
  currentAppointmentTime?: string;
  appointmentType?: string;
  appointmentMode?: "physical" | "video";
  urgency?: "normal" | "urgent";
  itemName?: string;
  inventoryOperation?: "set" | "add" | "remove";
  quantity?: number;
  conversationRef?: number;
  priority?: "normal" | "urgent";
  labOrderRef?: number;
  testName?: string;
  isUrgent?: boolean;
  blockDate?: string;
  blockStart?: string;
  blockEnd?: string;
  allDay?: boolean;
  reason?: string;
}

export interface VetBotActionPlan {
  requestId?: string;
  type: VetBotActionType;
  status: "needs_details" | "needs_confirmation" | "blocked" | "executed" | "rejected" | "failed";
  title: string;
  summary: string;
  missingFields: string[];
  details: Array<{ label: string; value: string }>;
  destructive?: boolean;
  confirmationLabel?: string;
}

export const VETBOT_ACTION_CATALOG = [
  { type: "book_appointment", description: "קביעת תור פנוי למטופל", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: ["patientName או patientRef", "appointmentDate", "appointmentTime", "appointmentType"] },
  { type: "reschedule_appointment", description: "שינוי מועד של תור קיים", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: ["appointmentRef או patientName והמועד הנוכחי", "appointmentDate", "appointmentTime"] },
  { type: "cancel_appointment", description: "ביטול תור קיים", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: ["appointmentRef או patientName והמועד הנוכחי"] },
  { type: "adjust_inventory", description: "שינוי כמות של פריט מלאי קיים", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["itemName", "inventoryOperation", "quantity"] },
  { type: "archive_conversation", description: "העברת השיחה הנבחרת לארכיון", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["conversationRef"] },
  { type: "restore_conversation", description: "החזרת השיחה הנבחרת מהארכיון", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["conversationRef"] },
  { type: "set_conversation_priority", description: "סימון שיחה כרגילה או דחופה", roles: ["clinic_admin", "vet", "nurse", "secretary"], required: ["conversationRef", "priority"] },
  { type: "set_lab_urgency", description: "סימון בדיקת מעבדה פתוחה כרגילה או דחופה", roles: ["clinic_admin", "vet", "nurse"], required: ["labOrderRef או patientName ו-testName", "isUrgent"] },
  { type: "block_booking_time", description: "חסימת יום או טווח שעות לקביעת תורים", roles: ["clinic_admin", "secretary"], required: ["blockDate", "allDay או blockStart ו-blockEnd"] },
  { type: "draft_message", description: "יצירת טיוטה בלבד; VetBot לעולם לא שולח אותה", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: [] },
  { type: "navigate", description: "פתיחת מסך מורשה במערכת", roles: ["clinic_admin", "vet", "nurse", "secretary", "owner"], required: [] },
  { type: "forbidden", description: "מחיקה של מטופל/לקוח, תשלום, הרשאות, אבחון, מרשם/מינון, שינוי רשומה רפואית, שחרור מאשפוז או שליחה ללקוח", roles: [], required: [] },
] as const;

const labels: Record<string, string> = {
  patientName: "שם המטופל",
  appointmentDate: "תאריך",
  appointmentTime: "שעה",
  appointmentType: "סוג התור",
  currentAppointmentDate: "מועד התור הנוכחי",
  itemName: "שם הפריט",
  inventoryOperation: "האם להגדיר, להוסיף או להפחית",
  quantity: "כמות",
  conversationRef: "שיחה נבחרת",
  priority: "רמת דחיפות",
  isUrgent: "האם הבדיקה רגילה או דחופה",
  labOrderRef: "בדיקת המעבדה",
  testName: "שם הבדיקה",
  blockDate: "תאריך החסימה",
  blockTime: "שעות החסימה",
};

function safeText(value: unknown, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function dateValue(value: unknown) {
  const text = safeText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function timeValue(value: unknown) {
  const text = safeText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function localParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function contextNumber(context: unknown, path: string[]) {
  let current: any = context;
  for (const key of path) current = current && typeof current === "object" ? current[key] : undefined;
  const value = numeric(current);
  return value === null ? undefined : value;
}

function missingPlan(type: VetBotActionType, title: string, missing: string[], summary?: string, details: VetBotActionPlan["details"] = []): VetBotActionPlan {
  const unique = [...new Set(missing.map((item) => labels[item] || safeText(item, 60)).filter(Boolean))];
  return {
    type,
    status: "needs_details",
    title,
    summary: summary || `כדי להמשיך חסרים לי: ${unique.join(", ")}.`,
    missingFields: unique,
    details,
  };
}

function blockedPlan(summary: string): VetBotActionPlan {
  return {
    type: "forbidden",
    status: "blocked",
    title: "הפעולה אינה זמינה דרך VetBot",
    summary,
    missingFields: [],
    details: [],
    destructive: true,
  };
}

async function createPending(
  admin: SupabaseClient,
  actorId: string,
  role: VetBotRole,
  type: VetBotActionType,
  payload: Record<string, unknown>,
  plan: Omit<VetBotActionPlan, "requestId" | "status" | "type" | "missingFields">,
): Promise<VetBotActionPlan> {
  const preview = {
    title: safeText(plan.title, 100),
    summary: safeText(plan.summary, 300),
    details: plan.details.slice(0, 8).map((item) => ({ label: safeText(item.label, 50), value: safeText(item.value, 140) })),
    destructive: Boolean(plan.destructive),
  };
  const { data, error } = await admin
    .from("vetbot_action_requests")
    .insert({ actor_id: actorId, actor_role: role, action_type: type, payload, preview })
    .select("action_request_id")
    .single();
  if (error || !data?.action_request_id) throw new Error("ACTION_REQUEST_CREATE_FAILED");
  return {
    requestId: String(data.action_request_id),
    type,
    status: "needs_confirmation",
    title: preview.title,
    summary: preview.summary,
    missingFields: [],
    details: preview.details,
    destructive: preview.destructive,
    confirmationLabel: plan.confirmationLabel || "אישור וביצוע",
  };
}

async function resolvePatient(client: SupabaseClient, patientName: string, patientRef?: number, species?: string) {
  if (patientRef) {
    const { data } = await client.from("patients").select("pet_id,pet_name,species").eq("pet_id", patientRef).maybeSingle();
    return data ? { row: data, issue: "" } : { row: null, issue: "לא מצאתי מטופל מורשה התואם לבקשה." };
  }
  if (!patientName) return { row: null, issue: "" };
  const { data, error } = await client.from("patients").select("pet_id,pet_name,species").limit(300);
  if (error || !Array.isArray(data)) return { row: null, issue: "לא הצלחתי לאמת את המטופל כרגע." };
  const target = patientName.toLocaleLowerCase("he-IL");
  const speciesTarget = species.toLocaleLowerCase("he-IL");
  const matches = data.filter((row: any) => {
    const nameMatches = safeText(row.pet_name).toLocaleLowerCase("he-IL") === target;
    const speciesMatches = !speciesTarget || safeText(row.species).toLocaleLowerCase("he-IL").includes(speciesTarget);
    return nameMatches && speciesMatches;
  });
  if (matches.length === 1) return { row: matches[0], issue: "" };
  if (matches.length > 1) return { row: null, issue: "מצאתי יותר ממטופל אחד בשם הזה. ציין גם את סוג החיה או פתח את התיק המתאים ובקש שוב." };
  return { row: null, issue: "לא מצאתי מטופל מורשה בשם הזה. בדוק את השם ונסה שוב." };
}

async function resolveAvailableSlot(client: SupabaseClient, date: string, time: string) {
  const { data, error } = await client.rpc("myvet_available_slots", { range_start: date, range_end: date });
  if (error || !Array.isArray(data)) return { slot: null, alternatives: [] as string[] };
  const rows = data.map((row: any) => ({ row, local: localParts(String(row.slot_start)) }));
  const match = rows.find((item) => item.local.date === date && item.local.time === time);
  return {
    slot: match?.row || null,
    alternatives: rows.filter((item) => item.local.date === date).slice(0, 6).map((item) => item.local.time),
  };
}

async function resolveAppointment(client: SupabaseClient, proposal: ModelActionProposal, context: unknown) {
  const directRef = numeric(proposal.appointmentRef) ?? contextNumber(context, ["selectedAppointmentRef"]);
  if (directRef) {
    const { data } = await client.from("appointments").select("appointment_id,pet_id,start_time,end_time,appointment_type,appointment_mode").eq("appointment_id", directRef).maybeSingle();
    if (data) return { row: data, patient: null, issue: "" };
  }

  const patientRef = contextNumber(context, ["selectedPatientRef"]);
  const patient = await resolvePatient(client, safeText(proposal.patientName), patientRef, safeText(proposal.patientSpecies));
  if (!patient.row) return { row: null, patient: null, issue: patient.issue || "ציין את שם המטופל של התור." };
  const currentDate = dateValue(proposal.currentAppointmentDate);
  const { data, error } = await client
    .from("appointments")
    .select("appointment_id,pet_id,start_time,end_time,appointment_type,appointment_mode")
    .eq("pet_id", patient.row.pet_id)
    .gte("start_time", currentDate ? `${currentDate}T00:00:00Z` : new Date(Date.now() - 86_400_000).toISOString())
    .order("start_time", { ascending: true })
    .limit(30);
  if (error || !Array.isArray(data)) return { row: null, patient: patient.row, issue: "לא הצלחתי לאמת את התור כרגע." };
  const currentTime = timeValue(proposal.currentAppointmentTime);
  const matches = data.filter((row: any) => {
    const local = localParts(String(row.start_time));
    return (!currentDate || local.date === currentDate) && (!currentTime || local.time === currentTime);
  });
  if (matches.length === 1) return { row: matches[0], patient: patient.row, issue: "" };
  if (matches.length > 1) return { row: null, patient: patient.row, issue: "יש למטופל כמה תורים מתאימים. ציין את התאריך והשעה של התור הנוכחי." };
  return { row: null, patient: patient.row, issue: "לא מצאתי תור עתידי התואם לפרטים שסיפקת." };
}

function roleAllows(role: VetBotRole, type: VetBotActionType) {
  const entry = VETBOT_ACTION_CATALOG.find((item) => item.type === type);
  return Boolean(entry && (entry.roles as readonly string[]).includes(role));
}

async function canAccessPet(client: SupabaseClient, role: VetBotRole, petId: number) {
  if (role !== "owner") return true;
  const { data, error } = await client.rpc("myvet_pet_owned", { candidate_pet_id: String(petId) });
  return !error && data === true;
}

export async function prepareVetBotAction({
  client,
  admin,
  actorId,
  role,
  proposal,
  context,
}: {
  client: SupabaseClient;
  admin: SupabaseClient;
  actorId: string;
  role: VetBotRole;
  proposal: ModelActionProposal | null | undefined;
  context: unknown;
}): Promise<VetBotActionPlan | null> {
  const type = proposal?.type || "none";
  if (type === "none" || type === "navigate" || type === "draft_message") return null;
  if (type === "forbidden") return blockedPlan("כדי להגן על המשתמשים והמטופלים, VetBot אינו מבצע תשלומים, מחיקות של לקוחות או מטופלים, שינוי הרשאות, אבחון, מרשמים או מינונים, שינוי רשומה רפואית, שחרור מאשפוז או שליחת הודעות בפועל.");
  if (!roleAllows(role, type)) return blockedPlan("התפקיד המחובר אינו מורשה לבצע את הפעולה הזו דרך VetBot.");

  if (type === "book_appointment") {
    const patientRef = contextNumber(context, ["selectedPatientRef"]);
    const patientName = safeText(proposal?.patientName);
    const date = dateValue(proposal?.appointmentDate);
    const time = timeValue(proposal?.appointmentTime);
    const appointmentType = safeText(proposal?.appointmentType, 120);
    const missing = [!patientName && !patientRef ? "patientName" : "", !date ? "appointmentDate" : "", !time ? "appointmentTime" : "", !appointmentType ? "appointmentType" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "קביעת תור", missing);
    const patient = await resolvePatient(client, patientName, patientRef, safeText(proposal?.patientSpecies));
    if (!patient.row) return missingPlan(type, "קביעת תור", ["patientName"], patient.issue);
    if (!(await canAccessPet(client, role, Number(patient.row.pet_id)))) {
      return blockedPlan("לא ניתן לקבוע תור למטופל שאינו משויך לחשבון המחובר.");
    }
    const availability = await resolveAvailableSlot(client, date, time);
    if (!availability.slot) {
      const details = availability.alternatives.length ? [{ label: "שעות פנויות באותו יום", value: availability.alternatives.join(", ") }] : [];
      return missingPlan(type, "השעה שביקשת אינה פנויה", ["appointmentTime"], availability.alternatives.length ? "בחר שעה פנויה מהרשימה או בקש יום אחר." : "לא נמצאו שעות פנויות ביום הזה. בקש תאריך אחר.", details);
    }
    const mode = proposal?.appointmentMode === "video" ? "video" : "physical";
    const details = [
      { label: "מטופל", value: safeText(patient.row.pet_name) },
      { label: "מועד", value: `${date} בשעה ${time}` },
      { label: "סוג תור", value: appointmentType },
      { label: "אופן", value: mode === "video" ? "וידאו" : "במרפאה" },
    ];
    return createPending(admin, actorId, role, type, {
      pet_id: patient.row.pet_id,
      start_time: availability.slot.slot_start,
      end_time: availability.slot.slot_end,
      appointment_type: appointmentType,
      appointment_mode: mode,
      urgency: proposal?.urgency === "urgent" ? "urgent" : "normal",
    }, { title: "אישור קביעת תור", summary: "בדקתי את יומן המרפאה והשעה פנויה. התור ייווצר רק לאחר אישורך.", details, confirmationLabel: "קבע את התור" });
  }

  if (type === "reschedule_appointment" || type === "cancel_appointment") {
    const appointment = await resolveAppointment(client, proposal || {}, context);
    if (!appointment.row) return missingPlan(type, type === "cancel_appointment" ? "ביטול תור" : "שינוי מועד תור", ["currentAppointmentDate"], appointment.issue);
    if (!(await canAccessPet(client, role, Number(appointment.row.pet_id)))) {
      return blockedPlan("לא ניתן לצפות או לשנות תור שאינו שייך לחשבון המחובר.");
    }
    const current = localParts(String(appointment.row.start_time));
    const petName = safeText(appointment.patient?.pet_name || proposal?.patientName || "המטופל");
    if (type === "cancel_appointment") {
      return createPending(admin, actorId, role, type, { appointment_id: appointment.row.appointment_id }, {
        title: "אישור ביטול תור",
        summary: "הביטול יסיר את התור מהיומן. לא ניתן לשחזר אותו אוטומטית.",
        details: [{ label: "מטופל", value: petName }, { label: "מועד", value: `${current.date} בשעה ${current.time}` }],
        destructive: true,
        confirmationLabel: "בטל את התור",
      });
    }
    const date = dateValue(proposal?.appointmentDate);
    const time = timeValue(proposal?.appointmentTime);
    const missing = [!date ? "appointmentDate" : "", !time ? "appointmentTime" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "שינוי מועד תור", missing);
    const availability = await resolveAvailableSlot(client, date, time);
    if (!availability.slot) return missingPlan(type, "המועד החדש אינו פנוי", ["appointmentTime"], availability.alternatives.length ? `שעות פנויות: ${availability.alternatives.join(", ")}` : "בחר תאריך אחר.");
    return createPending(admin, actorId, role, type, {
      appointment_id: appointment.row.appointment_id,
      start_time: availability.slot.slot_start,
      end_time: availability.slot.slot_end,
    }, {
      title: "אישור שינוי מועד",
      summary: "המועד החדש פנוי. השינוי יתבצע רק לאחר אישורך.",
      details: [{ label: "מטופל", value: petName }, { label: "מועד נוכחי", value: `${current.date} ${current.time}` }, { label: "מועד חדש", value: `${date} ${time}` }],
      confirmationLabel: "שנה את המועד",
    });
  }

  if (type === "adjust_inventory") {
    const itemName = safeText(proposal?.itemName);
    const operation = proposal?.inventoryOperation;
    const quantity = numeric(proposal?.quantity);
    const missing = [!itemName ? "itemName" : "", !operation ? "inventoryOperation" : "", quantity === null ? "quantity" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "עדכון מלאי", missing);
    const { data, error } = await client.from("inventory").select("item_id,item_name,stock_quantity").limit(1000);
    if (error || !Array.isArray(data)) return missingPlan(type, "עדכון מלאי", ["itemName"], "לא הצלחתי לאמת את פריט המלאי כרגע.");
    const target = itemName.toLocaleLowerCase("he-IL");
    const matches = data.filter((row: any) => safeText(row.item_name).toLocaleLowerCase("he-IL") === target);
    if (matches.length !== 1) return missingPlan(type, "עדכון מלאי", ["itemName"], matches.length > 1 ? "נמצאו כמה פריטים בשם הזה. ציין שם מדויק יותר." : "לא נמצא פריט מלאי בשם הזה.");
    const row = matches[0];
    const current = Number(row.stock_quantity || 0);
    const rounded = Math.trunc(quantity!);
    const next = operation === "add" ? current + rounded : operation === "remove" ? current - rounded : rounded;
    if (rounded < 0 || next < 0 || next > 1_000_000) return blockedPlan("כמות המלאי המבוקשת אינה תקינה או שתיצור מלאי שלילי.");
    return createPending(admin, actorId, role, type, { item_id: row.item_id, new_quantity: next }, {
      title: "אישור עדכון מלאי",
      summary: "כמות הפריט תשתנה רק לאחר אישורך.",
      details: [{ label: "פריט", value: safeText(row.item_name) }, { label: "כמות נוכחית", value: String(current) }, { label: "כמות חדשה", value: String(next) }],
      confirmationLabel: "עדכן את המלאי",
    });
  }

  if (type === "archive_conversation" || type === "restore_conversation" || type === "set_conversation_priority") {
    const conversationRef = numeric(proposal?.conversationRef) ?? contextNumber(context, ["conversation", "conversationRef"]);
    if (!conversationRef) return missingPlan(type, "עדכון שיחה", ["conversationRef"], "בחר שיחה במרפאה הדיגיטלית ובקש שוב.");
    const { data } = await client.from("conversations").select("conversation_id,status,priority,subject").eq("conversation_id", conversationRef).maybeSingle();
    if (!data) return missingPlan(type, "עדכון שיחה", ["conversationRef"], "השיחה אינה זמינה או שאינך מורשה לעדכן אותה.");
    const priority = proposal?.priority === "urgent" ? "urgent" : proposal?.priority === "normal" ? "normal" : "";
    if (type === "set_conversation_priority" && !priority) return missingPlan(type, "עדכון דחיפות שיחה", ["priority"]);
    const actionLabel = type === "archive_conversation" ? "העבר לארכיון" : type === "restore_conversation" ? "החזר לפעילות" : "עדכן דחיפות";
    const payload = { conversation_id: data.conversation_id, ...(priority ? { priority } : {}) };
    return createPending(admin, actorId, role, type, payload, {
      title: `אישור: ${actionLabel}`,
      summary: "השינוי יתבצע בשיחה שנבחרה בלבד.",
      details: [{ label: "שיחה", value: safeText(data.subject || `#${data.conversation_id}`) }, ...(priority ? [{ label: "דחיפות חדשה", value: priority === "urgent" ? "דחופה" : "רגילה" }] : [])],
      destructive: type === "archive_conversation",
      confirmationLabel: actionLabel,
    });
  }

  if (type === "set_lab_urgency") {
    if (typeof proposal?.isUrgent !== "boolean") {
      return missingPlan(type, "עדכון דחיפות בדיקה", ["isUrgent"]);
    }
    let labRef = numeric(proposal?.labOrderRef);
    let lab: any = null;
    if (labRef) {
      const result = await client.from("lab_orders").select("lab_order_id,pet_id,test_name,status,is_urgent").eq("lab_order_id", labRef).maybeSingle();
      lab = result.data;
    } else {
      const patient = await resolvePatient(client, safeText(proposal?.patientName), contextNumber(context, ["selectedPatientRef"]), safeText(proposal?.patientSpecies));
      const testName = safeText(proposal?.testName);
      if (!patient.row || !testName) return missingPlan(type, "עדכון דחיפות בדיקה", [!patient.row ? "patientName" : "", !testName ? "testName" : ""].filter(Boolean), patient.issue || undefined);
      const result = await client.from("lab_orders").select("lab_order_id,pet_id,test_name,status,is_urgent").eq("pet_id", patient.row.pet_id).neq("status", "completed").limit(100);
      const matches = Array.isArray(result.data) ? result.data.filter((row: any) => safeText(row.test_name).toLocaleLowerCase("he-IL") === testName.toLocaleLowerCase("he-IL")) : [];
      if (matches.length === 1) lab = matches[0];
    }
    if (!lab) return missingPlan(type, "עדכון דחיפות בדיקה", ["labOrderRef"], "לא מצאתי בדיקה פתוחה אחת שמתאימה לבקשה.");
    labRef = Number(lab.lab_order_id);
    return createPending(admin, actorId, role, type, { lab_order_id: labRef, is_urgent: Boolean(proposal?.isUrgent) }, {
      title: "אישור עדכון דחיפות בדיקה",
      summary: "הפעולה משנה דחיפות תפעולית בלבד ואינה משנה תוצאה רפואית.",
      details: [{ label: "בדיקה", value: safeText(lab.test_name) }, { label: "דחיפות חדשה", value: proposal?.isUrgent ? "דחופה" : "רגילה" }],
      confirmationLabel: "עדכן דחיפות",
    });
  }

  if (type === "block_booking_time") {
    const date = dateValue(proposal?.blockDate);
    const allDay = Boolean(proposal?.allDay);
    const start = timeValue(proposal?.blockStart);
    const end = timeValue(proposal?.blockEnd);
    const missing = [!date ? "blockDate" : "", !allDay && (!start || !end) ? "blockTime" : ""].filter(Boolean);
    if (missing.length) return missingPlan(type, "חסימת קביעת תורים", missing);
    if (!allDay && start >= end) return missingPlan(type, "חסימת קביעת תורים", ["blockTime"], "שעת הסיום חייבת להיות מאוחרת משעת ההתחלה.");
    return createPending(admin, actorId, role, type, { block_date: date, is_all_day: allDay, starts_at: start || null, ends_at: end || null, reason: safeText(proposal?.reason, 200) }, {
      title: "אישור חסימת קביעת תורים",
      summary: "לקוחות לא יוכלו לבחור שעות בתוך הטווח החסום.",
      details: [{ label: "תאריך", value: date }, { label: "טווח", value: allDay ? "כל היום" : `${start}–${end}` }, ...(proposal?.reason ? [{ label: "סיבה", value: safeText(proposal.reason, 120) }] : [])],
      destructive: true,
      confirmationLabel: "חסום את הטווח",
    });
  }

  return blockedPlan("VetBot אינו מורשה לבצע את הפעולה המבוקשת.");
}

function actionErrorMessage(code: string) {
  if (/SLOT_NOT_AVAILABLE/.test(code)) return "המועד כבר אינו פנוי. הנתונים השתנו מאז האישור; בחר מועד אחר.";
  if (/ACTION_EXPIRED|ACTION_NOT_PENDING/.test(code)) return "האישור פג או שכבר טופל. בקש מ־VetBot להכין את הפעולה מחדש.";
  if (/ROLE_CHANGED|NOT_ALLOWED|REQUIRED|NOT_OWNED/.test(code)) return "אין הרשאה לבצע את הפעולה הזו.";
  if (/NOT_FOUND/.test(code)) return "הפריט שביקשת לעדכן כבר אינו קיים או אינו זמין.";
  return "הפעולה לא בוצעה כי הנתונים השתנו או לא עברו אימות. אפשר להכין אותה מחדש.";
}

export async function decideVetBotAction({
  client,
  admin,
  actorId,
  requestId,
  decision,
}: {
  client: SupabaseClient;
  admin: SupabaseClient;
  actorId: string;
  requestId: string;
  decision: "approve" | "reject";
}): Promise<VetBotActionPlan> {
  const { data: requestRow } = await admin
    .from("vetbot_action_requests")
    .select("action_request_id,actor_id,action_type,status,expires_at,preview")
    .eq("action_request_id", requestId)
    .eq("actor_id", actorId)
    .maybeSingle();
  if (!requestRow) throw new Error("ACTION_NOT_FOUND");
  const preview: any = requestRow.preview || {};
  const base = {
    requestId,
    type: requestRow.action_type as VetBotActionType,
    title: safeText(preview.title || "פעולת VetBot", 100),
    summary: safeText(preview.summary || "", 300),
    missingFields: [] as string[],
    details: Array.isArray(preview.details) ? preview.details.slice(0, 8) : [],
    destructive: Boolean(preview.destructive),
  };
  if (requestRow.status !== "pending" || new Date(requestRow.expires_at).getTime() <= Date.now()) {
    return { ...base, status: "failed", summary: "האישור פג או שכבר טופל. בקש להכין את הפעולה מחדש." };
  }
  if (decision === "reject") {
    await admin.from("vetbot_action_requests").update({ status: "rejected" }).eq("action_request_id", requestId).eq("actor_id", actorId).eq("status", "pending");
    return { ...base, status: "rejected", summary: "הפעולה בוטלה ולא בוצע שינוי במערכת." };
  }
  const { data, error } = await client.rpc("myvet_execute_vetbot_action", { requested_action_id: requestId });
  const result: any = data || {};
  if (error || result.ok !== true) {
    const code = String(result.error_code || error?.message || "ACTION_FAILED");
    return { ...base, status: "failed", summary: actionErrorMessage(code) };
  }
  return { ...base, status: "executed", title: "הפעולה בוצעה בהצלחה", summary: "המערכת אימתה מחדש את ההרשאות והנתונים וביצעה את השינוי שאישרת." };
}
