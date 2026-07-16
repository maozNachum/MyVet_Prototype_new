import { supabase } from "../../../services/supabaseClient";
import { compactText } from "./aiSanitizer";
import type { AiUserRole } from "./aiTypes";
import { getAiActionContext } from "../../navigation/appActions";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start: start.toISOString(), end: end.toISOString() };
}

function nextDaysRange(days = 7) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + days);

  return { start: start.toISOString(), end: end.toISOString() };
}

function safeCount(result: { count: number | null } | null | undefined) {
  return result?.count ?? 0;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeMode(value?: string | null) {
  return value === "video" ? "video" : "physical";
}

function isLowStockInventoryItem(item: any) {
  const hasPersonalThreshold = item?.lowStockThreshold !== undefined || item?.low_stock_threshold !== undefined;
  if (!hasPersonalThreshold && typeof item?.lowStock === "boolean") return item.lowStock;

  const quantity = Number(item?.quantity ?? item?.stock_quantity ?? 0);
  const threshold = Number(item?.lowStockThreshold ?? item?.low_stock_threshold ?? 5);
  return quantity <= (Number.isFinite(threshold) ? threshold : 5);
}

function buildRoleFocus(role: AiUserRole) {
  if (role === "clinic_admin") return "תמונת מצב ניהולית, פעילות רפואית, שירות, תפעול וגבייה";
  if (role === "secretary") return "תורים, שירות לקוחות, פניות, תיאום וגבייה";
  if (role === "nurse") return "תפעול רפואי, מעבדה, אשפוזים, תורים ותיעוד סיעודי";
  if (role === "vet") return "תיק רפואי, עומס קליני, מעבדה, אשפוזים ותיעוד ביקורים";
  if (role === "owner") return "עזרה בשימוש בפורטל ופעולות שירות";
  return "עזרה לפי המסך הנוכחי";
}

function navigationContext(role: AiUserRole) {
  return {
    instruction: "כששואלים איך להגיע לפעולה, השתמש רק במפת הפעולות הזו. אל תמציא מסכים או כפתורים שלא מופיעים כאן.",
    actions: getAiActionContext(role),
  };
}


export async function buildDashboardContext(role: AiUserRole) {
  const { start, end } = todayRange();
  const week = nextDaysRange(7);

  const [
    todayAppointments,
    upcomingVideoAppointments,
    activeHospitalizations,
    urgentProblems,
    openLabOrders,
    urgentLabOrders,
    billingFollowUps,
    openPaymentsForTotal,
    openConversations,
    highPriorityConversations,
    lowStockInventory,
  ] = await Promise.all([
    supabase.from("appointments").select("appointment_id", { count: "exact", head: true }).gte("start_time", start).lt("start_time", end),
    supabase.from("appointments").select("appointment_id", { count: "exact", head: true }).gte("start_time", start).lt("start_time", week.end).eq("appointment_mode", "video"),
    supabase.from("hospitalizations").select("hospitalization_id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("medical_problems").select("problem_id", { count: "exact", head: true }).eq("status", "active").in("severity", ["serious", "critical"]),
    supabase.from("lab_orders").select("lab_order_id", { count: "exact", head: true }).not("status", "eq", "completed"),
    supabase.from("lab_orders").select("lab_order_id", { count: "exact", head: true }).not("status", "eq", "completed").eq("is_urgent", true),
    supabase.from("payments").select("payment_id", { count: "exact", head: true }).in("status", ["unpaid", "partial"]),
    supabase.from("payments").select("payment_id,amount,status").in("status", ["unpaid", "partial"]),
    supabase.from("conversations").select("conversation_id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("conversations").select("conversation_id", { count: "exact", head: true }).eq("status", "open").in("priority", ["high", "urgent"]),
    supabase.from("inventory").select("item_id,stock_quantity,low_stock_threshold"),
  ]);

  const openPaymentRows = Array.isArray(openPaymentsForTotal.data) ? openPaymentsForTotal.data : [];
  const openPaymentsAmount = openPaymentRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const lowStockRows = Array.isArray(lowStockInventory.data) ? lowStockInventory.data : [];
  const lowStockCount = lowStockRows.filter(isLowStockInventoryItem).length;

  return {
    screen: "dashboard",
    role,
    roleFocus: buildRoleFocus(role),
    date: new Date().toLocaleDateString("he-IL"),
    workSummary: {
      appointmentsToday: safeCount(todayAppointments),
      videoAppointmentsThisWeek: safeCount(upcomingVideoAppointments),
      activeHospitalizations: safeCount(activeHospitalizations),
      urgentCases: role === "secretary" ? 0 : safeCount(urgentProblems),
      openLabOrders: role === "secretary" ? 0 : safeCount(openLabOrders),
      urgentLabOrders: role === "secretary" ? 0 : safeCount(urgentLabOrders),
      billingFollowUps: safeCount(billingFollowUps),
      openDigitalConversations: safeCount(openConversations),
      highPriorityConversations: safeCount(highPriorityConversations),
      lowStockInventory: lowStockCount,
    },
    reportInsights: {
      billing: {
        openPayments: safeCount(billingFollowUps),
        openAmount: openPaymentsAmount,
      },
      inventory: {
        lowStockItems: lowStockCount,
      },
      lab: {
        openOrders: role === "secretary" ? 0 : safeCount(openLabOrders),
        urgentOrders: role === "secretary" ? 0 : safeCount(urgentLabOrders),
      },
      digitalCare: {
        openConversations: safeCount(openConversations),
        highPriorityConversations: safeCount(highPriorityConversations),
      },
    },
    navigation: navigationContext(role),
    expectedAnswerStyle: "תשובה קצרה עם סדר עדיפויות, ואם שואלים איך להגיע לפעולה — ציין את הדרך המדויקת מתוך מפת הפעולות.",
  };
}

export function buildScheduleContext({ appointments, viewMode, activeVet, role }: { appointments: any[]; viewMode: string; activeVet: string; role: AiUserRole }) {
  const byDate = appointments.reduce<Record<string, number>>((acc, appt) => {
    const dateKey = appt.date || `${appt.year}-${String((appt.month ?? 0) + 1).padStart(2, "0")}-${String(appt.day).padStart(2, "0")}`;
    acc[dateKey] = (acc[dateKey] || 0) + 1;
    return acc;
  }, {});

  const byHour = appointments.reduce<Record<string, number>>((acc, appt) => {
    const key = appt.time?.slice(0, 2) || "לא מוגדר";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const videoAppointments = appointments.filter((appt) => normalizeMode(appt.appointmentMode || appt.appointment_mode) === "video");
  const missingStaffOrRoom = appointments.filter((appt) => !appt.vet || !appt.room || appt.room === "לא שובץ");

  return {
    screen: "schedule",
    role,
    roleFocus: buildRoleFocus(role),
    viewMode,
    activeVet: activeVet === "all" ? "כל היומנים" : activeVet,
    summary: {
      totalAppointments: appointments.length,
      videoAppointments: videoAppointments.length,
      missingStaffOrRoom: missingStaffOrRoom.length,
      busiestDates: Object.entries(byDate).sort((a, b) => b[1] - a[1]).slice(0, 5),
      busiestHours: Object.entries(byHour).sort((a, b) => b[1] - a[1]).slice(0, 5),
    },
    appointments: appointments.slice(0, 90).map((appt) => ({
      appointmentRef: Number(appt.id || appt.appointment_id) || undefined,
      patientRef: Number(appt.petId || appt.pet_id) || undefined,
      date: appt.date || `${appt.year}-${String((appt.month ?? 0) + 1).padStart(2, "0")}-${String(appt.day).padStart(2, "0")}`,
      time: appt.time,
      endTime: appt.endTime,
      department: appt.department,
      vet: appt.vet,
      room: appt.room,
      appointmentMode: normalizeMode(appt.appointmentMode || appt.appointment_mode),
      type: appt.type,
    })),
    navigation: navigationContext(role),
  };
}

export function buildInventoryContext({ items, role }: { items: any[]; role: AiUserRole }) {
  const categorySummary = items.reduce<Record<string, { total: number; low: number }>>((acc, item) => {
    const key = item.categoryLabel || item.category || "ללא קטגוריה";
    if (!acc[key]) acc[key] = { total: 0, low: 0 };
    acc[key].total += 1;
    if (isLowStockInventoryItem(item)) acc[key].low += 1;
    return acc;
  }, {});

  return {
    screen: "inventory",
    role,
    roleFocus: buildRoleFocus(role),
    summary: {
      totalItems: items.length,
      lowStockItems: items.filter(isLowStockInventoryItem).length,
      estimatedStockValue: items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0),
      categorySummary,
    },
    itemsToReview: items
      .filter(isLowStockInventoryItem)
      .slice(0, 50)
      .map((item) => ({
        itemName: item.name,
        sku: item.sku,
        category: item.categoryLabel || item.category,
        quantity: item.quantity,
        price: item.price,
        lowStock: isLowStockInventoryItem(item),
      })),
    navigation: navigationContext(role),
  };
}

export function buildDigitalCareContext({ conversation, messages, attachments, role }: { conversation: any | null; messages: any[]; attachments: any[]; role: AiUserRole }) {
  return {
    screen: "digital-care",
    role,
    roleFocus: buildRoleFocus(role),
    conversation: conversation
      ? {
          conversationRef: Number(conversation.conversation_id || conversation.id) || undefined,
          status: conversation.status,
          priority: conversation.priority,
          subject: compactText(conversation.subject || "", 240),
          petSpecies: conversation.pet?.species || null,
          hasPetAssigned: Boolean(conversation.pet_id),
          hasAttachments: attachments.length > 0,
          attachmentCount: attachments.length,
        }
      : null,
    recentMessages: messages.slice(-18).map((message) => ({
      senderType: message.sender_type,
      messageType: message.message_type,
      text: compactText(message.message_text || "", 500),
      createdAt: message.created_at,
    })),
    navigation: navigationContext(role),
    expectedAnswerStyle: "טיוטה קצרה וברורה. לא לשלוח לבד.",
  };
}

export function buildMedicalRecordContext({ patient, visits, activeHospitalization, role }: { patient: any; visits: any[]; activeHospitalization?: any; role: AiUserRole }) {
  return {
    screen: "medical-record",
    role,
    roleFocus: buildRoleFocus(role),
    selectedPatientRef: Number(patient?.pet?.pet_id || patient?.pet?.id || patient?.pet_id || patient?.id) || undefined,
    petSummary: {
      species: patient?.pet?.species,
      gender: patient?.pet?.gender,
      age: patient?.pet?.age,
      weight: patient?.pet?.weight,
      neuteredStatus: patient?.pet?.neuteredStatus,
      hasKnownAllergies: Boolean(patient?.pet?.allergies),
    },
    activeHospitalization: activeHospitalization
      ? {
          department: activeHospitalization.department,
          severity: activeHospitalization.severity,
          status: activeHospitalization.status,
        }
      : null,
    recentVisits: visits.slice(0, 10).map((visit) => ({
      date: visit.date || visit.visitDate,
      visitType: visit.visitType,
      urgencyLevel: visit.urgencyLevel,
      reason: compactText(visit.reason || visit.chiefComplaint || "", 400),
      treatment: compactText(visit.treatment || "", 550),
      hasFinalDiagnosis: Boolean(visit.finalDiagnosis || visit.diagnosis),
      hasFollowUp: Boolean(visit.followUpRequired),
      notes: compactText(visit.notes || "", 450),
    })),
    navigation: navigationContext(role),
    expectedAnswerStyle: "סיכום מקצועי קצר לצוות. אין אבחון חדש ואין מינונים חדשים.",
  };
}

export function buildPortalContext({ pets, appointments, notifications, digitalConversations, billingItems }: { pets: any[]; appointments: any[]; notifications: any[]; digitalConversations: any[]; billingItems: any[] }) {
  const today = toDateKey(new Date());

  return {
    screen: "portal",
    role: "owner",
    roleFocus: buildRoleFocus("owner"),
    summary: {
      petsCount: pets.length,
      upcomingAppointments: appointments.length,
      appointmentsToday: appointments.filter((appointment) => String(appointment.start_time || appointment.date || "").startsWith(today)).length,
      openDigitalConversations: digitalConversations.filter((conversation) => conversation.status === "open").length,
      unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
      billingFollowUps: billingItems.filter((item) => item.status !== "paid").length,
      hasVideoAppointment: appointments.some((appointment) => normalizeMode(appointment.appointment_mode || appointment.appointmentMode) === "video"),
    },
    availableActions: ["קביעת תור", "פתיחת פנייה", "צירוף קובץ בתוך פנייה", "צפייה בפנקס חיסונים", "הצטרפות לשיחת וידאו"],
    navigation: navigationContext("owner"),
    expectedAnswerStyle: "עזרה באתר בלבד. להפנות לצוות במקרה רפואי.",
  };
}

export function buildClientsSummaryContext({ clients, role }: { clients: any[]; role: AiUserRole }) {
  return {
    screen: "clients",
    role,
    roleFocus: buildRoleFocus(role),
    summary: {
      totalClients: clients.length,
      totalPets: clients.reduce((sum, client) => sum + (client.pets?.length || 0), 0),
      clientsWithoutPets: clients.filter((client) => (client.pets?.length || 0) === 0).length,
      multiPetClients: clients.filter((client) => (client.pets?.length || 0) >= 2).length,
      petSpeciesBreakdown: clients.reduce<Record<string, number>>((acc, client) => {
        for (const pet of client.pets || []) {
          const key = pet.species || "לא מוגדר";
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {}),
    },
    navigation: navigationContext(role),
  };
}
