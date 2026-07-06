import type { StaffType } from "../data/staffAuth";
import type { AiUserRole } from "../components/ai/aiTypes";

export type AppActionGroup =
  | "today"
  | "patients"
  | "care"
  | "communication"
  | "operations"
  | "billing"
  | "reports"
  | "settings";

export type AppActionIconKey =
  | "home"
  | "calendar"
  | "plus"
  | "paw"
  | "users"
  | "message"
  | "video"
  | "bed"
  | "flask"
  | "package"
  | "receipt"
  | "chart"
  | "file"
  | "stethoscope"
  | "clipboard"
  | "price";

export type AppActionRole = StaffType | "owner" | "unknown";

export type AppAction = {
  id: string;
  title: string;
  description: string;
  route: string;
  iconKey: AppActionIconKey;
  group: AppActionGroup;
  aliases: string[];
  roles?: AppActionRole[];
  guide: string[];
  badge?: string;
};

export const APP_ACTION_GROUP_LABELS: Record<AppActionGroup, string> = {
  today: "עבודה יומית",
  patients: "לקוחות ומטופלים",
  care: "טיפול ותיק רפואי",
  communication: "פניות ודיגיטל",
  operations: "תפעול המרפאה",
  billing: "גבייה ומחירון",
  reports: "דוחות ותובנות",
  settings: "ניהול",
};

export const APP_ACTIONS: AppAction[] = [
  {
    id: "dashboard.open",
    title: "פתח מוקד רפואי יומי",
    description: "תמונת מצב של היום: תורים, פניות, מעקב מרפאה ומה דורש טיפול.",
    route: "/",
    iconKey: "home",
    group: "today",
    aliases: ["דשבורד", "בית", "ראשי", "מוקד", "היום", "dashboard"],
    guide: ["לחץ על דשבורד בסרגל העליון", "או פתח את מרכז הפעולות וחפש דשבורד"],
  },
  {
    id: "appointments.today",
    title: "פתח תורים להיום",
    description: "יומן תורים מלא לפי יום, שבוע, חודש ורופא.",
    route: "/appointments",
    iconKey: "calendar",
    group: "today",
    aliases: ["תורים", "תורים להיום", "יומן", "לו״ז", "calendar", "schedule"],
    guide: ["לחץ על תורים להיום בדשבורד", "או לחץ על יומן תורים בסרגל העליון"],
  },
  {
    id: "appointments.new",
    title: "קבע תור חדש",
    description: "קביעת תור פיזי או תור וידאו ללקוח ולחיה.",
    route: "/appointments/new",
    iconKey: "plus",
    group: "today",
    aliases: ["קביעת תור", "תור חדש", "לקבוע תור", "וידאו", "פיזי"],
    guide: ["פתח את יומן התורים", "לחץ קבע תור", "בחר לקוח, חיה, סיבה, תאריך, שעה וסוג תור"],
  },
  {
    id: "patients.open",
    title: "פתח מטופלים ותיקים רפואיים",
    description: "רשימת חיות, פתיחת תיק רפואי, הוספת רשומות ומרשמים.",
    route: "/patients",
    iconKey: "paw",
    group: "patients",
    aliases: ["מטופלים", "חיות", "תיק רפואי", "חיה", "כלב", "חתול", "patients"],
    guide: ["לחץ על מטופלים בסרגל העליון", "חפש חיה או בעלים", "לחץ על החיה כדי לפתוח את התיק"],
  },
  {
    id: "patients.add-record",
    title: "הוסף רשומה רפואית",
    description: "הוספת ביקור, חיסון, שקילה, מרשם, מעבדה, מעקב או הערה.",
    route: "/patients?action=add-record",
    iconKey: "clipboard",
    group: "care",
    roles: ["vet", "nurse"],
    aliases: ["רשומה רפואית", "הוסף ביקור", "טיפול", "חיסון", "מרשם", "מעבדה", "מעקב"],
    guide: ["פתח מטופלים", "בחר חיה", "לחץ הוסף רשומה רפואית", "מלא את הפרטים ושמור רשומה רפואית"],
  },
  {
    id: "patients.medical-summary",
    title: "סכם תיק רפואי",
    description: "שימוש בעוזר התיק הרפואי כדי לסכם ביקורים ולנסח הנחיות.",
    route: "/patients",
    iconKey: "stethoscope",
    group: "care",
    roles: ["vet", "nurse"],
    aliases: ["עוזר רפואי", "סיכום ביקור", "סכם תיק", "הנחיות לבעלים"],
    guide: ["פתח תיק חיה", "לחץ עוזר רפואי", "בחר סכם ביקורים או נסח הנחיות"],
  },
  {
    id: "clients.open",
    title: "פתח לקוחות ובעלים",
    description: "ניהול בעלי חיות, חיות משויכות, פרטי קשר וחובות פתוחים.",
    route: "/clients",
    iconKey: "users",
    group: "patients",
    aliases: ["לקוחות", "בעלים", "לקוח", "בעל חיה", "חובות בעלים", "owners"],
    guide: ["לחץ לקוחות בסרגל העליון", "בחר בעלים", "ראה חיות משויכות וחובות פתוחים"],
  },
  {
    id: "digital.open",
    title: "פתח מרפאה דיגיטלית",
    description: "ניהול פניות, צ׳אט, קבצים ושיחות וידאו.",
    route: "/digital-care",
    iconKey: "message",
    group: "communication",
    aliases: ["דיגיטל", "מרפאה דיגיטלית", "צאט", "צ׳אט", "הודעות", "שיחות"],
    guide: ["לחץ דיגיטל בסרגל העליון", "בחר שיחה מהרשימה", "שלח הודעה, צרף קובץ או צור קישור וידאו"],
  },
  {
    id: "digital.open-inquiries",
    title: "פתח פניות פתוחות",
    description: "כניסה ממוקדת לפניות שממתינות לטיפול צוות.",
    route: "/digital-care?filter=open",
    iconKey: "message",
    group: "communication",
    aliases: ["פניות פתוחות", "פניות", "ממתין לטיפול", "שירות לקוחות"],
    guide: ["בדשבורד לחץ פניות פתוחות", "או פתח דיגיטל וסנן לפניות פתוחות"],
  },
  {
    id: "digital.video",
    title: "פתח תורי וידאו",
    description: "כניסה לשיחות ולתורים דיגיטליים שדורשים טיפול.",
    route: "/digital-care?filter=video",
    iconKey: "video",
    group: "communication",
    aliases: ["וידאו", "תור וידאו", "שיחת וידאו", "meet", "דיגיטלי"],
    guide: ["בדשבורד לחץ על תור וידאו אם קיים", "או פתח מרפאה דיגיטלית עם סינון וידאו"],
  },
  {
    id: "digital.video-summary",
    title: "סכם שיחת וידאו לתיק רפואי",
    description: "שמירת סיכום שיחת וידאו כתיעוד בתיק החיה.",
    route: "/digital-care?focus=video-summary",
    iconKey: "video",
    group: "care",
    roles: ["vet", "nurse"],
    aliases: ["סיכום וידאו", "שיחת וידאו לתיק", "וידאו לתיק רפואי"],
    guide: ["פתח מרפאה דיגיטלית", "בחר שיחה עם חיה משויכת", "פתח שיחת וידאו", "לחץ סכם לתיק רפואי"],
    badge: "חדש",
  },
  {
    id: "hospitalizations.active",
    title: "פתח אשפוזים פעילים",
    description: "רשימת מאושפזים פעילים, חומרה, מחלקה וצפי שחרור.",
    route: "/hospitalizations?filter=active",
    iconKey: "bed",
    group: "care",
    aliases: ["אשפוז", "מאושפזים", "מחלקה", "אשפוזים פעילים"],
    guide: ["בדשבורד לחץ אשפוזים פעילים", "או פתח מרכז פעולות וחפש אשפוזים"],
  },
  {
    id: "hospitalizations.discharge",
    title: "פתח שחרורים צפויים",
    description: "מעקב אחר מאושפזים עם תאריך שחרור מתוכנן.",
    route: "/hospitalizations?filter=discharge",
    iconKey: "bed",
    group: "care",
    aliases: ["שחרור", "שחרורים", "לשחרור", "צפי שחרור"],
    guide: ["פתח אשפוזים", "בחר פילטר לשחרור", "פתח את תיק החיה אם צריך לעדכן סיכום שחרור"],
  },
  {
    id: "lab.open",
    title: "פתח בדיקות ממתינות",
    description: "מסך עבודה לבדיקות פתוחות, דחופות ותוצאות חריגות.",
    route: "/lab-orders?filter=open",
    iconKey: "flask",
    group: "operations",
    roles: ["vet", "nurse"],
    aliases: ["מעבדה", "בדיקות", "בדיקות ממתינות", "תוצאות", "lab"],
    guide: ["בדשבורד לחץ בדיקות ממתינות", "או פתח מעבדה ממרכז הפעולות", "בחר בדיקה לעדכון תוצאה"],
  },
  {
    id: "lab.urgent",
    title: "פתח בדיקות דחופות",
    description: "בדיקות מעבדה שסומנו כדחופות.",
    route: "/lab-orders?filter=urgent",
    iconKey: "flask",
    group: "operations",
    roles: ["vet", "nurse"],
    aliases: ["בדיקות דחופות", "מעבדה דחופה", "urgent lab"],
    guide: ["פתח מעבדה", "בחר פילטר דחופות", "עדכן תוצאה או פתח תיק חיה"],
  },
  {
    id: "inventory.open",
    title: "פתח מלאי",
    description: "ניהול תרופות, ציוד, כמויות ומחירי מוצרים.",
    route: "/inventory",
    iconKey: "package",
    group: "operations",
    aliases: ["מלאי", "תרופות", "ציוד", "מוצרים", "inventory"],
    guide: ["לחץ מלאי בסרגל העליון", "חפש פריט או סנן לפי קטגוריה", "ערוך כמות ומחיר במידת הצורך"],
  },
  {
    id: "inventory.low",
    title: "פתח מלאי נמוך",
    description: "פריטים שדורשים בדיקה או הזמנה.",
    route: "/inventory?filter=low-stock",
    iconKey: "package",
    group: "operations",
    aliases: ["מלאי נמוך", "חוסרים", "צריך להזמין", "קריטי"],
    guide: ["פתח מלאי", "בחר פילטר מלאי נמוך", "בדוק כמות ועדכן הזמנה"],
  },
  {
    id: "pricing.open",
    title: "פתח מחירון מרפאה",
    description: "עריכת מחירי שירותים: בדיקות, חיסונים, מעבדה, אשפוז וייעוץ.",
    route: "/price-list",
    iconKey: "price",
    group: "billing",
    roles: ["vet", "secretary"],
    aliases: ["מחירון", "מחירים", "תמחור", "מחיר חיסון", "מחיר בדיקה", "מחיר אשפוז"],
    guide: ["פתח מלאי או מרכז פעולות", "לחץ מחירון מרפאה", "חפש שירות ועדכן מחיר"],
  },
  {
    id: "billing.open-debts",
    title: "בדוק חובות פתוחים",
    description: "איתור חיובים פתוחים לפי בעלים או תיק חיה.",
    route: "/clients",
    iconKey: "receipt",
    group: "billing",
    roles: ["vet", "secretary"],
    aliases: ["חובות", "גבייה", "תשלומים", "תשלום פתוח", "חוב בעלים"],
    guide: ["פתח לקוחות", "בחר בעלים", "אם יש חוב פתוח לחץ גביית חוב"],
  },
  {
    id: "reports.open",
    title: "פתח דוחות ותובנות",
    description: "דוחות פעילות, גבייה, מלאי, תורים וצוות.",
    route: "/reports",
    iconKey: "chart",
    group: "reports",
    roles: ["vet", "secretary"],
    aliases: ["דוחות", "תובנות", "BI", "גבייה", "מגמות", "reports"],
    guide: ["לחץ דוחות בסרגל העליון", "בחר תחום דוח", "השתמש בעוזר הדוחות לקבלת תובנות"],
  },
  {
    id: "portal.open",
    title: "פתח פורטל לקוח לדוגמה",
    description: "כניסה לפורטל לקוחות לצפייה בתורים, מסמכים, פניות ותשלומים.",
    route: "/portal",
    iconKey: "file",
    group: "communication",
    aliases: ["פורטל", "פורטל לקוח", "מסמכים ללקוח", "תשלום לקוח"],
    guide: ["פתח את כתובת הפורטל", "הזן owner_id בפרמטר אם צריך", "בדוק תורים, מסמכים, פניות ותשלומים"],
  },
];

export function isActionAllowed(action: AppAction, role: AppActionRole) {
  if (!action.roles?.length) return true;
  return action.roles.includes(role);
}

export function getAllowedAppActions(role: AppActionRole = "unknown") {
  return APP_ACTIONS.filter((action) => isActionAllowed(action, role));
}

export function normalizeActionSearch(text: string) {
  return text
    .toLowerCase()
    .replace(/[״"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreAppAction(action: AppAction, query: string) {
  const normalizedQuery = normalizeActionSearch(query);
  if (!normalizedQuery) return 0;

  const title = normalizeActionSearch(action.title);
  const haystack = normalizeActionSearch([action.title, action.description, ...action.aliases, ...action.guide].join(" "));

  if (title.startsWith(normalizedQuery)) return 100;
  if (haystack.includes(normalizedQuery)) return 70;

  return normalizedQuery
    .split(" ")
    .filter(Boolean)
    .reduce((score, word) => (haystack.includes(word) ? score + 12 : score), 0);
}

export function getAiActionContext(role: AppActionRole = "unknown") {
  return getAllowedAppActions(role).map((action) => ({
    id: action.id,
    title: action.title,
    route: action.route,
    category: APP_ACTION_GROUP_LABELS[action.group],
    aliases: action.aliases.slice(0, 8),
    howToReach: action.guide,
    description: action.description,
  }));
}
