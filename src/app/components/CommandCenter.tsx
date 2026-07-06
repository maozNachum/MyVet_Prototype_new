import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ClipboardPlus,
  Command,
  FileText,
  Home,
  MessageCircle,
  Package,
  PawPrint,
  PlusCircle,
  Search,
  Stethoscope,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  canAccessReportsPage,
  canPerformTreatment,
  getStaffLabel,
  getStaffType,
  type StaffType,
} from "../data/staffAuth";

type CommandAction = {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: typeof Home;
  group: "today" | "navigation" | "care" | "operations" | "admin";
  roles?: StaffType[];
  aliases: string[];
  badge?: string;
};

const GROUP_LABELS: Record<CommandAction["group"], string> = {
  today: "מה עושים עכשיו",
  navigation: "ניווט מהיר",
  care: "טיפול ותיק רפואי",
  operations: "תפעול המרפאה",
  admin: "ניהול ודוחות",
};

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[״"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getActions(staffType: StaffType): CommandAction[] {
  const canTreat = canPerformTreatment();
  const canReports = canAccessReportsPage();

  const actions: CommandAction[] = [
    {
      id: "dashboard",
      title: "פתח דשבורד יומי",
      description: "תמונת מצב מהירה של היום: תורים, פניות, עומסים ומשימות פתוחות.",
      path: "/",
      icon: Home,
      group: "today",
      aliases: ["בית", "ראשי", "דשבורד", "היום", "dashboard"],
    },
    {
      id: "appointments",
      title: "פתח יומן תורים",
      description: "מעבר ליומן לפי יום, שבוע, חודש ורופא מטפל.",
      path: "/appointments",
      icon: CalendarDays,
      group: "today",
      aliases: ["יומן", "תורים", "רופא", "לו״ז", "calendar", "schedule"],
    },
    {
      id: "new-appointment",
      title: "קבע תור חדש",
      description: "יצירת תור פיזי או תור וידאו עם לקוח, חיה, שעה ורופא.",
      path: "/appointments/new",
      icon: PlusCircle,
      group: "today",
      aliases: ["קביעת תור", "תור חדש", "וידאו", "פיזי", "appointment"],
    },
    {
      id: "digital-care",
      title: "פתח מרפאה דיגיטלית",
      description: "פניות לקוחות, הודעות, קבצים ושיחות וידאו במקום אחד.",
      path: "/digital-care",
      icon: MessageCircle,
      group: "today",
      aliases: ["דיגיטל", "צאט", "צ׳אט", "פניות", "וידאו", "digital", "care"],
    },
    {
      id: "patients",
      title: "חפש מטופל או תיק רפואי",
      description: "מעבר לרשימת החיות והתיקים הרפואיים.",
      path: "/patients",
      icon: PawPrint,
      group: "navigation",
      aliases: ["מטופל", "חיה", "כלב", "חתול", "תיק", "רפואי", "patients"],
    },
    {
      id: "clients",
      title: "פתח לקוחות ובעלים",
      description: "ניהול בעלי חיות, פרטי קשר וחיות משויכות.",
      path: "/clients",
      icon: Users,
      group: "navigation",
      aliases: ["לקוחות", "בעלים", "לקוח", "בעלים", "owners", "clients"],
    },
    {
      id: "inventory",
      title: "פתח מלאי",
      description: "בדיקת חוסרים, כמויות, קטגוריות ופריטים שדורשים הזמנה.",
      path: "/inventory",
      icon: Package,
      group: "operations",
      aliases: ["מלאי", "תרופות", "חוסרים", "הזמנה", "inventory"],
    },
    {
      id: "video-summary",
      title: "סכם שיחת וידאו לתיק רפואי",
      description: "מעבר לדיגיטל כדי לשמור סיכום שיחה בתיק החיה.",
      path: "/digital-care?focus=video-summary",
      icon: Video,
      group: "care",
      roles: ["vet", "nurse"],
      aliases: ["סיכום וידאו", "שיחת וידאו", "תיק רפואי", "video", "summary"],
      badge: "חדש",
    },
    {
      id: "add-medical-record",
      title: "הוסף רשומה רפואית",
      description: "בחר חיה בתיק המטופלים ואז הוסף ביקור, חיסון, מעבדה, מרשם או מעקב.",
      path: "/patients?action=add-record",
      icon: ClipboardPlus,
      group: "care",
      roles: ["vet", "nurse"],
      aliases: ["טיפול", "ביקור", "רשומה", "חיסון", "מעבדה", "מרשם", "follow up"],
    },
    {
      id: "medical-review",
      title: "בדוק תיקים רפואיים",
      description: "גישה מהירה לתיקים לצורך המשך טיפול, מעקב והשלמת תיעוד.",
      path: "/patients",
      icon: Stethoscope,
      group: "care",
      roles: ["vet", "nurse"],
      aliases: ["מעקב", "השלמת תיעוד", "בעיה רפואית", "אבחנות", "medical"],
    },
    {
      id: "reports",
      title: "פתח דוחות ותובנות",
      description: "סקירת פעילות המרפאה, תורים, מלאי, גבייה ומגמות.",
      path: "/reports",
      icon: BarChart3,
      group: "admin",
      roles: ["vet", "secretary"],
      aliases: ["דוחות", "BI", "תובנות", "גבייה", "מדדים", "reports"],
    },
    {
      id: "owner-documents",
      title: "מסמכים ודוחות ללקוח",
      description: "פתח לקוחות כדי להגיע למסמכים, חיות ותיקי בעלים.",
      path: "/clients",
      icon: FileText,
      group: "operations",
      roles: ["vet", "secretary", "nurse"],
      aliases: ["מסמכים", "קבצים", "דוחות לקוח", "document", "files"],
    },
  ];

  return actions.filter((action) => {
    if (action.roles && !action.roles.includes(staffType)) return false;
    if (action.id === "reports" && !canReports) return false;
    if ((action.id === "add-medical-record" || action.id === "video-summary" || action.id === "medical-review") && !canTreat) return false;
    return true;
  });
}

function scoreAction(action: CommandAction, query: string) {
  if (!query) return 0;
  const haystack = normalize([action.title, action.description, ...action.aliases].join(" "));
  const normalizedQuery = normalize(query);
  if (normalize(action.title).startsWith(normalizedQuery)) return 100;
  if (haystack.includes(normalizedQuery)) return 70;
  return normalizedQuery
    .split(" ")
    .filter(Boolean)
    .reduce((score, word) => (haystack.includes(word) ? score + 12 : score), 0);
}

export function CommandCenter() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const staffType = getStaffType();
  const staffLabel = getStaffLabel(staffType);
  const shortcutKey = isMac() ? "⌘ K" : "Ctrl K";

  const actions = useMemo(() => getActions(staffType), [staffType]);

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    return actions
      .map((action) => ({ action, score: scoreAction(action, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.action);
  }, [actions, query]);

  const groupedActions = useMemo(() => {
    return filteredActions.reduce<Record<string, CommandAction[]>>((acc, action) => {
      if (!acc[action.group]) acc[action.group] = [];
      acc[action.group].push(action);
      return acc;
    }, {});
  }, [filteredActions]);

  useEffect(() => {
    const openHandler = () => setIsOpen(true);
    const keyHandler = (event: KeyboardEvent) => {
      const isCommandK = (event.ctrlKey || event.metaKey) && (event.code === "KeyK" || event.key.toLowerCase() === "k");
      if (isCommandK) {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("myvet:open-command-center", openHandler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("myvet:open-command-center", openHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };

  const runAction = (action: CommandAction) => {
    navigate(action.path);
    close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-950/35 px-4 pt-24 backdrop-blur-sm" dir="rtl" role="dialog" aria-modal="true" aria-label="מרכז פעולות">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="סגור מרכז פעולות" onClick={close} />

      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="border-b border-slate-100 bg-gradient-to-l from-blue-50 to-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                <Command className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[19px] font-bold text-slate-900">מרכז פעולות</h2>
                <p className="text-[13px] text-slate-500">גישה מהירה לפעולות החשובות לפי התפקיד שלך: {staffLabel}</p>
              </div>
            </div>
            <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900" aria-label="סגור">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חפש פעולה, מסך או תהליך — למשל תור, תיק רפואי, דיגיטל, מלאי..."
              className="h-13 w-full rounded-2xl border border-slate-200 bg-white pr-12 pl-4 text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {filteredActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <Search className="mb-3 h-9 w-9 text-slate-300" />
              <h3 className="text-[16px] font-bold text-slate-800">לא מצאנו פעולה מתאימה</h3>
              <p className="mt-1 max-w-md text-[13px] leading-6 text-slate-500">נסה לכתוב שם פעולה אחר. לחיפוש חיה, לקוח או פריט מלאי אפשר להשתמש גם בשורת החיפוש הראשית למעלה.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {(Object.keys(GROUP_LABELS) as CommandAction["group"][]).map((group) => {
                const groupItems = groupedActions[group];
                if (!groupItems?.length) return null;

                return (
                  <section key={group}>
                    <h3 className="mb-2 px-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">{GROUP_LABELS[group]}</h3>
                    <div className="space-y-2">
                      {groupItems.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => runAction(action)}
                            className="group flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:bg-blue-50/60 hover:shadow-md"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[15px] font-bold text-slate-900">{action.title}</span>
                                {action.badge && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">{action.badge}</span>}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-slate-500">{action.description}</p>
                            </div>
                            <ArrowLeft className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-blue-500" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-[12px] text-slate-500">
          <span>טיפ: אפשר לפתוח את מרכז הפעולות מכל מסך.</span>
          <kbd className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-sans text-[12px] font-bold text-slate-600 shadow-sm">{shortcutKey}</kbd>
        </div>
      </div>
    </div>
  );
}
