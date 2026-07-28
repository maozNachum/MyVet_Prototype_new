import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Sparkles } from "lucide-react";
import { useLocation } from "react-router";
import { getStaffType } from "../../data/staffAuth";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import type { AiConversationContextIdentity } from "./aiConversationStorage";
import type { AiAssistantMode, AiQuickAction, AiUserRole } from "./aiTypes";

export type AiAssistantRegistration = {
  mode: AiAssistantMode;
  title: string;
  compactTitle: string;
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole: AiUserRole;
  disabledReason?: string | null;
  attentionCount: number;
  contextIdentity: AiConversationContextIdentity;
};

type RegistrationEntry = {
  id: number;
  getRegistration: () => AiAssistantRegistration;
};

type AiAssistantShellContextValue = {
  register: (getRegistration: () => AiAssistantRegistration) => () => void;
};

const AiAssistantShellContext = createContext<AiAssistantShellContextValue | null>(null);

const fallbackActions: AiQuickAction[] = [
  {
    label: "קבע תור",
    prompt: "אני רוצה לקבוע תור. שאל אותי רק את הפרטים שחסרים ובקש אישור לפני הביצוע.",
  },
  {
    label: "מצא מטופל",
    prompt: "עזור לי למצוא מטופל או לקוח במערכת. שאל אותי איזה פרט חסר לחיפוש.",
  },
  {
    label: "מה דורש טיפול?",
    prompt: "תן לי תמונת מצב קצרה של הנושאים שדורשים טיפול במרפאה.",
  },
];

const pageLabels: Record<string, string> = {
  "/": "מרכז המרפאה",
  "/appointments": "יומן התורים",
  "/appointments/new": "קביעת תור חדש",
  "/clients": "ניהול הלקוחות",
  "/patients": "מטופלים ותיקים רפואיים",
  "/inventory": "ניהול המלאי",
  "/digital-care": "המרפאה הדיגיטלית",
  "/hospitalizations": "ניהול אשפוזים",
  "/lab-orders": "הזמנות מעבדה",
  "/price-list": "מחירון השירותים",
};

export function useRegisterAiAssistant() {
  const context = useContext(AiAssistantShellContext);
  if (!context) throw new Error("VetBot must be registered inside AiAssistantShell");
  return context.register;
}

type AiAssistantShellProps = PropsWithChildren<{
  area?: "staff" | "portal";
}>;

export function AiAssistantShell({ children, area = "staff" }: AiAssistantShellProps) {
  const location = useLocation();
  const nextRegistrationId = useRef(0);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const [entry, setEntry] = useState<RegistrationEntry | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const register = useCallback((getRegistration: () => AiAssistantRegistration) => {
    const id = nextRegistrationId.current + 1;
    nextRegistrationId.current = id;
    setEntry({ id, getRegistration });

    return () => {
      setEntry((current) => current?.id === id ? null : current);
    };
  }, []);

  useEffect(() => {
    if (!entry) setIsOpen(false);
  }, [entry]);

  const contextValue = useMemo(() => ({ register }), [register]);
  const fallbackRegistration = useMemo<AiAssistantRegistration>(() => {
    const label = area === "portal"
      ? "פורטל הלקוחות"
      : pageLabels[location.pathname] || "MyVet";

    return {
      mode: area === "portal" ? "portal" : "dashboard",
      title: "VetBot",
      compactTitle: "VetBot",
      quickActions: fallbackActions,
      buildContext: () => ({
        currentPage: {
          path: location.pathname,
          label,
        },
      }),
      userRole: area === "portal" ? "owner" : getStaffType(),
      attentionCount: 0,
      contextIdentity: {
        key: `${area}:page:${location.pathname}`,
        label,
      },
    };
  }, [area, location.pathname]);
  const registration = area === "staff" && location.pathname === "/reports"
    ? null
    : entry?.getRegistration() || fallbackRegistration;
  const attentionCount = registration?.attentionCount || 0;
  const disabled = Boolean(registration?.disabledReason);
  const mobilePosition = area === "portal" ? "bottom-24" : "bottom-5";
  const closeAssistant = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  }, []);

  return (
    <AiAssistantShellContext.Provider value={contextValue}>
      <div
        className={`min-w-0 transition-[padding] duration-200 ease-out ${
          isOpen && registration ? "min-[1440px]:pl-[440px]" : ""
        }`}
      >
        {children}
      </div>

      {registration && !isOpen && (
        <div className={`fixed left-3 ${mobilePosition} z-[240] md:bottom-auto md:left-1 md:top-1/2 md:-translate-y-1/2`}>
          <button
            ref={launcherRef}
            type="button"
            onClick={() => !disabled && setIsOpen(true)}
            disabled={disabled}
            aria-label={registration.disabledReason || "פתיחת VetBot"}
            title={registration.disabledReason || "פתיחת VetBot"}
            className={`group relative flex h-[52px] w-[52px] items-center justify-center rounded-2xl border backdrop-blur-sm transition-[background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/50 md:h-[58px] md:w-[48px] ${
              disabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100/95 text-slate-400 shadow-sm"
                : "cursor-pointer border-blue-100 bg-white/95 text-[#1e40af] shadow-[0_10px_26px_rgba(30,64,175,0.14)] hover:border-blue-200 hover:bg-blue-50/95 hover:shadow-[0_12px_30px_rgba(30,64,175,0.2)] active:scale-[0.97]"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                disabled ? "bg-slate-200/70" : "bg-blue-50 group-hover:bg-blue-100"
              }`}
              aria-hidden="true"
            >
              <Sparkles className="h-[19px] w-[19px] shrink-0" />
            </span>
            <span
              aria-hidden="true"
              dir="rtl"
              className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
            >
              פתיחת {registration.compactTitle}
            </span>
            <span
              aria-hidden="true"
              className={`absolute inset-y-3 right-0 hidden w-[3px] rounded-l-full md:block ${
                disabled ? "bg-slate-300" : "bg-[#2563eb]"
              }`}
            />
            {attentionCount > 0 && !disabled && (
              <span
                className="absolute right-0 top-0 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#dc2626] px-1 text-[9px] font-extrabold leading-none text-white ring-2 ring-white"
                aria-label={`${attentionCount} נושאים לבדיקה`}
              >
                {attentionCount > 99 ? "99+" : attentionCount}
              </span>
            )}
          </button>
        </div>
      )}

      {registration && (
        <AiAssistantDrawer
          isOpen={isOpen}
          onClose={closeAssistant}
          mode={registration.mode}
          title={registration.title}
          quickActions={registration.quickActions}
          buildContext={registration.buildContext}
          userRole={registration.userRole}
          contextIdentity={registration.contextIdentity}
          desktopDocked
        />
      )}
    </AiAssistantShellContext.Provider>
  );
}
