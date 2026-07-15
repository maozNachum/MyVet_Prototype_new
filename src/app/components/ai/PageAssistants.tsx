import { getStaffType } from "../../data/staffAuth";
import { AiAssistantCard } from "./AiAssistantCard";
import type { AiQuickAction } from "./aiTypes";
import {
  buildClientsSummaryContext,
  buildDashboardContext,
  buildDigitalCareContext,
  buildInventoryContext,
  buildMedicalRecordContext,
  buildPortalContext,
  buildScheduleContext,
} from "./aiContextBuilder";

function staffRole() {
  return getStaffType();
}

const dashboardActions: AiQuickAction[] = [
  { label: "מה לטפל קודם?", prompt: "תן לי סדר עדיפויות קצר להיום לפי מצב המרפאה, כולל כפתורים או מסכים שכדאי לפתוח." },
  { label: "איך מגיעים ל...?", prompt: "הסבר לי איך להגיע לפעולות מרכזיות במערכת: תור חדש, תיק רפואי, גביית חוב, מחירון, מעבדה ואשפוזים." },
  { label: "סכם תובנות", prompt: "סכם את מצב המרפאה, הגבייה, המלאי, המעבדה והפניות בשורה תחתונה ושלוש פעולות." },
];

export function DashboardAssistant({ attentionCount = 0 }: { attentionCount?: number }) {
  const role = staffRole();

  return (
    <AiAssistantCard
      mode="dashboard"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="ממקד את מה שדורש טיפול ומה כדאי לבדוק בהמשך היום."
      userRole={role}
      quickActions={dashboardActions}
      buildContext={() => buildDashboardContext(role)}
      attentionCount={attentionCount}
    />
  );
}

const scheduleActions: AiQuickAction[] = [
  { label: "איפה יש עומס?", prompt: "איפה יש עומס ביומן ומה כדאי לעשות כדי לאזן אותו?" },
  { label: "איפה לשבץ תור?", prompt: "הצע חלון מתאים לשיבוץ תור נוסף בלי ליצור עומס." },
  { label: "מה חסר ביומן?", prompt: "בדוק אם יש תורים שדורשים השלמה או טיפול." },
];

export function ScheduleAssistant({ appointments, viewMode, activeVet }: { appointments: any[]; viewMode: string; activeVet: string }) {
  const role = staffRole();

  return (
    <AiAssistantCard
      mode="schedule"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="מזהה עומסים, חלונות פנויים ותורים שדורשים טיפול."
      userRole={role}
      quickActions={scheduleActions}
      buildContext={() => buildScheduleContext({ appointments, viewMode, activeVet, role })}
    />
  );
}

const inventoryActions: AiQuickAction[] = [
  { label: "מה צריך להזמין?", prompt: "אילו פריטים כדאי להזמין עכשיו ולמה?" },
  { label: "איפה מעדכנים מחיר?", prompt: "הסבר איך מעדכנים מחיר מוצר במלאי ואיך פותחים את מחירון המרפאה לשירותים." },
  { label: "סכם מלאי", prompt: "סכם את מצב המלאי בכמה נקודות קצרות." },
];

export function InventoryAssistant({ items }: { items: any[] }) {
  const role = staffRole();

  return (
    <AiAssistantCard
      mode="inventory"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="מזהה חוסרים, פריטים קריטיים וסדר עדיפויות להזמנה."
      userRole={role}
      quickActions={inventoryActions}
      buildContext={() => buildInventoryContext({ items, role })}
    />
  );
}

const digitalActions: AiQuickAction[] = [
  { label: "סכם שיחה", prompt: "סכם את השיחה הנוכחית לצוות בשלושה סעיפים." },
  { label: "הצע תשובה", prompt: "נסח טיוטת תשובה קצרה ללקוח. אל תשלח אותה לבד." },
  { label: "זהה דחיפות", prompt: "הערך רמת דחיפות תפעולית לפי השיחה והצע פעולה מתאימה." },
  { label: "מה הפעולה הבאה?", prompt: "מה הפעולה הבאה שהצוות צריך לבצע בשיחה הזו?" },
];

export function DigitalCareAssistant({ conversation, messages, attachments }: { conversation: any | null; messages: any[]; attachments: any[] }) {
  const role = staffRole();

  return (
    <AiAssistantCard
      mode="digital-care"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="מסכם שיחות, מכין טיוטות ומציע את הפעולה הבאה."
      userRole={role}
      disabledReason={!conversation ? "בחר שיחה כדי להפעיל את VetBot." : null}
      quickActions={digitalActions}
      buildContext={() => buildDigitalCareContext({ conversation, messages, attachments, role })}
    />
  );
}

const medicalActions: AiQuickAction[] = [
  { label: "סכם ביקורים", prompt: "סכם את הרשומות האחרונות בצורה ברורה לצוות." },
  { label: "נסח הנחיות", prompt: "נסח טיוטת הנחיות כלליות לבעלים לפי הרשומה, בלי אבחון חדש ובלי מינונים חדשים." },
  { label: "בדוק חוסרים", prompt: "בדוק האם חסרים פרטים חשובים ברשומה הרפואית האחרונה." },
];

export function MedicalRecordAssistant({ patient, visits, activeHospitalization }: { patient: any; visits: any[]; activeHospitalization?: any }) {
  const role = staffRole();
  const disabledReason = role === "secretary" ? "פעולות רפואיות זמינות לצוות רפואי בלבד." : null;

  return (
    <AiAssistantCard
      mode="medical-record"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="מסכם ביקורים, מנסח הנחיות ומזהה פרטים חסרים."
      userRole={role}
      disabledReason={disabledReason}
      quickActions={medicalActions}
      buildContext={() => buildMedicalRecordContext({ patient, visits, activeHospitalization, role })}
    />
  );
}

const clientsActions: AiQuickAction[] = [
  { label: "מי דורש מעקב?", prompt: "אילו קבוצות לקוחות דורשות מעקב שירותי?" },
  { label: "הצע פעולות שירות", prompt: "הצע פעולות שירות קצרות למזכירות או לצוות." },
  { label: "סכם מצב לקוחות", prompt: "סכם את מצב הלקוחות בכמה נקודות קצרות." },
];

export function ClientsAssistant({ clients }: { clients: any[] }) {
  const role = staffRole();

  return (
    <AiAssistantCard
      mode="clients"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="מזהה פעולות שירות ומעקב נדרשות ללקוחות."
      userRole={role}
      quickActions={clientsActions}
      buildContext={() => buildClientsSummaryContext({ clients, role })}
    />
  );
}

const portalActions: AiQuickAction[] = [
  { label: "איך קובעים תור?", prompt: "הסבר לי איך לקבוע תור דרך הפורטל, צעד אחר צעד." },
  { label: "איך פותחים פנייה?", prompt: "הסבר לי איך לפתוח פנייה לצוות במרפאה הדיגיטלית." },
  { label: "איך מצטרפים לווידאו?", prompt: "הסבר לי איך מצטרפים לשיחת וידאו אם הצוות שלח קישור." },
  { label: "איפה רואים קבצים?", prompt: "הסבר שקבצים מהמרפאה מופיעים בתוך הפנייה במרפאה הדיגיטלית, וחיסונים מופיעים בפנקס החיסונים של החיה." },
  { label: "עזור לנסח הודעה", prompt: "עזור לי לנסח הודעה קצרה לצוות המרפאה. אל תיתן אבחנה, טיפול או מינון." },
];

export function ClientPortalAssistant({
  pets,
  appointments,
  notifications,
  digitalConversations,
  paymentsByPet,
}: {
  pets: any[];
  appointments: any[];
  notifications: any[];
  digitalConversations: any[];
  paymentsByPet: Record<string | number, any[]>;
}) {
  const billingItems = Object.values(paymentsByPet || {}).flat();

  return (
    <AiAssistantCard
      mode="portal"
      title="VetBot"
      compactTitle="VetBot"
      subtitle="מכוון לתורים, פניות, קבצים ושיחות וידאו בפורטל."
      userRole="owner"
      quickActions={portalActions}
      buildContext={() => buildPortalContext({ pets, appointments, notifications, digitalConversations, billingItems })}
    />
  );
}
