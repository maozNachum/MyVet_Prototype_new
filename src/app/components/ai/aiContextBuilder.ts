import { supabase } from "../../../services/supabaseClient";
import { compactText } from "./aiSanitizer";
import type { AiUserRole } from "./aiTypes";

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

function hourBucket(value?: string | null) {
  if (!value) return "לא מוגדר";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "לא מוגדר";
  const hour = date.getHours();
  if (hour < 10) return "מוקדם";
  if (hour < 14) return "בוקר";
  if (hour < 18) return "צהריים";
  return "ערב";
}

function normalizeMode(value?: string | null) {
  return value === "video" ? "video" : "physical";
}

function buildRoleFocus(role: AiUserRole) {
  if (role === "secretary") return "תורים, שירות לקוחות, פניות, תיאום וגבייה";
  if (role === "nurse") return "תפעול רפואי, מעבדה, אשפוזים, תורים ותיעוד סיעודי";
  if (role === "vet") return "תיק רפואי, עומס קליני, מעבדה, אשפוזים ותיעוד ביקורים";
  if (role === "owner") return "עזרה בשימוש בפורטל ופעולות שירות";
  return "עזרה לפי המסך הנוכחי";
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
    billingFollowUps,
    openConversations,
  ] = await Promise.all([
    supabase.from("appointments").select("appointment_id", { count: "exact", head: true }).gte("start_time", start).lt("start_time", end),
    supabase.from("appointments").select("appointment_id", { count: "exact", head: true }).gte("start_time", start).lt("start_time", week.end).eq("appointment_mode", "video"),
    supabase.from("hospitalizations").select("hospitalization_id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("medical_problems").select("problem_id", { count: "exact", head: true }).eq("status", "active").in("severity", ["serious", "critical"]),
    supabase.from("lab_orders").select("lab_order_id", { count: "exact", head: true }).not("status", "eq", "completed"),
    supabase.from("payments").select("payment_id", { count: "exact", head: true }).in("status", ["unpaid", "partial"]),
    supabase.from("conversations").select("conversation_id", { count: "exact", head: true }).neq("status", "closed"),
  ]);

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
      billingFollowUps: safeCount(billingFollowUps),
      openDigitalConversations: safeCount(openConversations),
    },
    expectedAnswerStyle: "תשובה קצרה עם סדר עדיפויות ופעולות המשך ברורות",
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
      date: appt.date || `${appt.year}-${String((appt.month ?? 0) + 1).padStart(2, "0")}-${String(appt.day).padStart(2, "0")}`,
      time: appt.time,
      endTime: appt.endTime,
      department: appt.department,
      vet: appt.vet,
      room: appt.room,
      appointmentMode: normalizeMode(appt.appointmentMode || appt.appointment_mode),
      type: appt.type,
    })),
  };
}

export function buildInventoryContext({ items, role }: { items: any[]; role: AiUserRole }) {
  const categorySummary = items.reduce<Record<string, { total: number; low: number }>>((acc, item) => {
    const key = item.categoryLabel || item.category || "ללא קטגוריה";
    if (!acc[key]) acc[key] = { total: 0, low: 0 };
    acc[key].total += 1;
    if (item.lowStock) acc[key].low += 1;
    return acc;
  }, {});

  return {
    screen: "inventory",
    role,
    roleFocus: buildRoleFocus(role),
    summary: {
      totalItems: items.length,
      lowStockItems: items.filter((item) => item.lowStock).length,
      estimatedStockValue: items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0),
      categorySummary,
    },
    itemsToReview: items
      .filter((item) => item.lowStock || Number(item.quantity || 0) <= 5)
      .slice(0, 50)
      .map((item) => ({
        itemName: item.name,
        sku: item.sku,
        category: item.categoryLabel || item.category,
        quantity: item.quantity,
        price: item.price,
        lowStock: Boolean(item.lowStock),
      })),
  };
}

export function buildDigitalCareContext({ conversation, messages, attachments, role }: { conversation: any | null; messages: any[]; attachments: any[]; role: AiUserRole }) {
  return {
    screen: "digital-care",
    role,
    roleFocus: buildRoleFocus(role),
    conversation: conversation
      ? {
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
    expectedAnswerStyle: "טיוטה קצרה וברורה. לא לשלוח לבד.",
  };
}

export function buildMedicalRecordContext({ patient, visits, activeHospitalization, role }: { patient: any; visits: any[]; activeHospitalization?: any; role: AiUserRole }) {
  return {
    screen: "medical-record",
    role,
    roleFocus: buildRoleFocus(role),
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
      openDigitalConversations: digitalConversations.filter((conversation) => conversation.status !== "closed").length,
      unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
      billingFollowUps: billingItems.filter((item) => item.status !== "paid").length,
      hasVideoAppointment: appointments.some((appointment) => normalizeMode(appointment.appointment_mode || appointment.appointmentMode) === "video"),
    },
    availableActions: ["קביעת תור", "פתיחת פנייה", "צירוף קובץ", "צפייה במסמכים", "הצטרפות לשיחת וידאו"],
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
  };
}
