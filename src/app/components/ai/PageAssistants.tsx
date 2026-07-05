import { supabase } from "../../../services/supabaseClient";
import { getStaffType } from "../../data/staffAuth";
import { AiAssistantCard } from "./AiAssistantCard";
import { compactText } from "./aiSanitizer";
import type { AiQuickAction } from "./aiTypes";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function staffRole() {
  return getStaffType();
}

const dashboardActions: AiQuickAction[] = [
  { label: "מה הכי דחוף היום?", prompt: "תן לי סדר עדיפויות קצר להיום לפי הנתונים התפעוליים." },
  { label: "מה לבדוק קודם?", prompt: "מה כדאי לבדוק קודם בתחילת יום עבודה?" },
  { label: "סכם מצב מרפאה", prompt: "סכם את מצב המרפאה בשורה תחתונה ו-3 פעולות." },
];

export function DashboardAssistant() {
  return (
    <AiAssistantCard
      mode="dashboard"
      title="עוזר דשבורד"
      compactTitle="עוזר תפעולי יומי"
      subtitle="מסכם עומסים, תורים, מקרים דחופים ואשפוזים בלי לשלוח פרטים מזהים של לקוחות או חיות."
      userRole={staffRole()}
      quickActions={dashboardActions}
      buildContext={async () => {
        const { start, end } = todayRange();
        const [appointments, hospitalizations, urgentProblems, openLabs, payments] = await Promise.all([
          supabase.from("appointments").select("appointment_id", { count: "exact", head: true }).gte("start_time", start).lt("start_time", end),
          supabase.from("hospitalizations").select("hospitalization_id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("medical_problems").select("problem_id", { count: "exact", head: true }).eq("status", "active").in("severity", ["serious", "critical"]),
          supabase.from("lab_orders").select("lab_order_id", { count: "exact", head: true }).not("status", "eq", "completed"),
          supabase.from("payments").select("payment_id", { count: "exact", head: true }).in("status", ["unpaid", "partial"]),
        ]);

        return {
          date: new Date().toLocaleDateString("he-IL"),
          appointmentsToday: appointments.count ?? 0,
          activeHospitalizations: hospitalizations.count ?? 0,
          urgentActiveProblems: urgentProblems.count ?? 0,
          openLabOrders: openLabs.count ?? 0,
          openPayments: payments.count ?? 0,
          notes: "הנתונים הם אגרגטיביים בלבד וללא שמות, טלפונים, כתובות או מזהים.",
        };
      }}
    />
  );
}

const scheduleActions: AiQuickAction[] = [
  { label: "איפה יש עומס?", prompt: "נתח את עומס התורים ותן המלצה קצרה לאיזון היומן." },
  { label: "המלץ זמן פנוי", prompt: "לפי התורים הקיימים, איפה כדאי לשבץ תור חדש בלי ליצור עומס?" },
  { label: "בדוק התנגשויות", prompt: "האם יש סיכוי להתנגשות או עומס חריג ביומן?" },
];

export function ScheduleAssistant({ appointments, viewMode, activeVet }: { appointments: any[]; viewMode: string; activeVet: string }) {
  return (
    <AiAssistantCard
      mode="schedule"
      title="עוזר יומן תורים"
      compactTitle="עוזר שיבוץ"
      subtitle="בודק עומסים וחלונות פנויים לפי שעות, מחלקות ורופאים — ללא שמות לקוחות או פרטי קשר."
      userRole={staffRole()}
      quickActions={scheduleActions}
      buildContext={() => ({
        viewMode,
        activeVet: activeVet === "all" ? "all" : activeVet,
        totalAppointments: appointments.length,
        appointments: appointments.slice(0, 120).map((appt) => ({
          date: `${appt.year}-${String((appt.month ?? 0) + 1).padStart(2, "0")}-${String(appt.day).padStart(2, "0")}`,
          time: appt.time,
          endTime: appt.endTime,
          department: appt.department,
          vet: appt.vet,
          room: appt.room,
          type: appt.type,
        })),
      })}
    />
  );
}

const inventoryActions: AiQuickAction[] = [
  { label: "מה צריך להזמין?", prompt: "אילו פריטים כדאי להזמין עכשיו ולמה?" },
  { label: "מה קריטי?", prompt: "סמן את פריטי המלאי הקריטיים ביותר ותן פעולה מומלצת." },
  { label: "סכם מלאי", prompt: "סכם את מצב המלאי בכמה נקודות קצרות." },
];

export function InventoryAssistant({ items }: { items: any[] }) {
  return (
    <AiAssistantCard
      mode="inventory"
      title="עוזר מלאי"
      compactTitle="עוזר ניהול מלאי"
      subtitle="מזהה חוסרים, פריטים קריטיים ועלויות משוערות. זהו אזור ללא מידע אישי ולכן מתאים במיוחד ל-AI."
      userRole={staffRole()}
      quickActions={inventoryActions}
      buildContext={() => ({
        totalItems: items.length,
        lowStockCount: items.filter((item) => item.lowStock).length,
        totalValue: items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0),
        items: items.slice(0, 120).map((item) => ({
          itemName: item.name,
          sku: item.sku,
          category: item.categoryLabel || item.category,
          quantity: item.quantity,
          price: item.price,
          lowStock: item.lowStock,
        })),
      })}
    />
  );
}

const digitalActions: AiQuickAction[] = [
  { label: "סכם שיחה", prompt: "סכם את השיחה הנוכחית לצוות בשלושה סעיפים." },
  { label: "הצע תשובה", prompt: "נסח טיוטת תשובה מקצועית וקצרה ללקוח. אל תשלח אותה לבד." },
  { label: "זהה דחיפות", prompt: "הערך רמת דחיפות תפעולית לפי השיחה והצע פעולה מתאימה." },
  { label: "מה הפעולה הבאה?", prompt: "מה הפעולה הבאה שהצוות צריך לבצע בשיחה הזו?" },
];

export function DigitalCareAssistant({ conversation, messages, attachments }: { conversation: any | null; messages: any[]; attachments: any[] }) {
  return (
    <AiAssistantCard
      mode="digital-care"
      title="עוזר מרפאה דיגיטלית"
      compactTitle="עוזר שיחה"
      subtitle="מסכם שיחות, מציע טיוטת תשובה ומזהה דחיפות. ההודעה לא נשלחת אוטומטית."
      userRole={staffRole()}
      disabledReason={!conversation ? "בחר שיחה כדי להפעיל את העוזר." : null}
      quickActions={digitalActions}
      buildContext={() => ({
        conversation: conversation
          ? {
              status: conversation.status,
              priority: conversation.priority,
              subject: compactText(conversation.subject || ""),
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
      })}
      privacyNote="נשלחות רק ההודעות האחרונות לאחר ניקוי פרטים מזהים. העוזר מציע טיוטה בלבד והצוות מחליט אם לשלוח."
    />
  );
}

const medicalActions: AiQuickAction[] = [
  { label: "סכם ביקורים", prompt: "סכם את הרשומות האחרונות בצורה ברורה לצוות." },
  { label: "נסח הנחיות לבעלים", prompt: "נסח טיוטת הנחיות כלליות לבעלים לפי הרשומה, בלי אבחון חדש ובלי מינונים חדשים." },
  { label: "בדוק שדות חסרים", prompt: "בדוק האם חסרים פרטים חשובים ברשומה הרפואית האחרונה." },
];

export function MedicalRecordAssistant({ patient, visits, activeHospitalization }: { patient: any; visits: any[]; activeHospitalization?: any }) {
  const role = staffRole();
  const disabledReason = role === "secretary" ? "מזכירה לא מקבלת עוזר AI רפואי לפי ברירת המחדל שהגדרנו." : null;

  return (
    <AiAssistantCard
      mode="medical-record"
      title="עוזר תיק רפואי"
      compactTitle="עוזר כתיבה רפואית"
      subtitle="עוזר לסכם ולנסח. הוא לא מאבחן, לא קובע מינונים ולא מחליף החלטה של וטרינר."
      userRole={role}
      disabledReason={disabledReason}
      quickActions={medicalActions}
      buildContext={() => ({
        pet: {
          species: patient?.pet?.species,
          gender: patient?.pet?.gender,
          age: patient?.pet?.age,
          weight: patient?.pet?.weight,
          neuteredStatus: patient?.pet?.neuteredStatus,
          hasAllergies: Boolean(patient?.pet?.allergies),
        },
        activeHospitalization: activeHospitalization
          ? {
              department: activeHospitalization.department,
              severity: activeHospitalization.severity,
              status: activeHospitalization.status,
            }
          : null,
        recentVisits: visits.slice(0, 8).map((visit) => ({
          date: visit.date || visit.visitDate,
          visitType: visit.visitType,
          reason: compactText(visit.reason || visit.chiefComplaint || "", 400),
          treatment: compactText(visit.treatment || "", 550),
          finalDiagnosisExists: Boolean(visit.finalDiagnosis || visit.diagnosis),
          notes: compactText(visit.notes || "", 450),
        })),
      })}
      privacyNote="העוזר מקבל רק מידע רפואי מצומצם על החיה והרשומות האחרונות, ללא פרטי בעלים, טלפון, תעודת זהות או כתובת."
    />
  );
}

const clientsActions: AiQuickAction[] = [
  { label: "מי דורש מעקב?", prompt: "לפי סיכום הלקוחות, אילו קבוצות דורשות מעקב שירותי?" },
  { label: "הצע פעולות שירות", prompt: "הצע פעולות שירות קצרות למזכירות או לצוות." },
  { label: "סכם מצב לקוחות", prompt: "סכם את מצב הלקוחות בלי להתייחס לפרטים מזהים." },
];

export function ClientsAssistant({ clients }: { clients: any[] }) {
  return (
    <AiAssistantCard
      mode="clients"
      title="עוזר לקוחות"
      compactTitle="עוזר שירות לקוחות"
      subtitle="מנתח רק נתונים אגרגטיביים על לקוחות וחיות, בלי שמות, טלפונים, מיילים או כתובות."
      userRole={staffRole()}
      quickActions={clientsActions}
      buildContext={() => ({
        totalClients: clients.length,
        totalPets: clients.reduce((sum, client) => sum + (client.pets?.length || 0), 0),
        clientsWithoutPets: clients.filter((client) => (client.pets?.length || 0) === 0).length,
        multiPetClients: clients.filter((client) => (client.pets?.length || 0) >= 2).length,
        petSpeciesBreakdown: clients.reduce<Record<string, number>>((acc, client) => {
          for (const pet of client.pets || []) {
            const key = pet.species || "unknown";
            acc[key] = (acc[key] || 0) + 1;
          }
          return acc;
        }, {}),
      })}
    />
  );
}

const portalActions: AiQuickAction[] = [
  { label: "איך קובעים תור?", prompt: "הסבר לי איך לקבוע תור דרך הפורטל." },
  { label: "איך פותחים פנייה?", prompt: "הסבר לי איך לפתוח פנייה לצוות במרפאה הדיגיטלית." },
  { label: "עזור לנסח הודעה", prompt: "עזור לי לנסח הודעה קצרה לצוות המרפאה. אל תיתן אבחנה רפואית." },
  { label: "איפה המסמכים?", prompt: "הסבר איפה לראות ולהעלות מסמכים בפורטל." },
];

export function ClientPortalAssistant({ pets, appointments, notifications, digitalConversations, paymentsByPet }: { pets: any[]; appointments: any[]; notifications: any[]; digitalConversations: any[]; paymentsByPet: Record<string | number, any[]> }) {
  return (
    <AiAssistantCard
      mode="portal"
      title="עוזר פורטל לקוחות"
      compactTitle="עוזר שירות"
      subtitle="עוזר בניווט, קביעת תורים, פתיחת פנייה וצירוף מסמכים. לא נותן אבחון רפואי."
      userRole="owner"
      quickActions={portalActions}
      buildContext={() => ({
        petsCount: pets.length,
        upcomingAppointmentsCount: appointments.length,
        unreadNotificationsCount: notifications.filter((n) => !n.isRead).length,
        openDigitalConversations: digitalConversations.filter((c) => c.status !== "closed").length,
        unpaidPaymentsCount: Object.values(paymentsByPet || {}).flat().filter((payment: any) => payment.status !== "paid").length,
        availablePortalActions: ["קביעת תור", "פתיחת פנייה", "צירוף קובץ", "צפייה במסמכים", "תשלום דמו"],
      })}
      privacyNote="העוזר בפורטל הוא עוזר שירות בלבד. הוא לא מקבל תיק רפואי מלא ולא נותן אבחנה או הנחיה רפואית במקום וטרינר."
    />
  );
}
