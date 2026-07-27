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
        <div className={`fixed left-3 ${mobilePosition} z-[240] md:bottom-auto md:left-0 md:top-1/2 md:-translate-y-1/2`}>
          <button
            ref={launcherRef}
            type="button"
            onClick={() => !disabled && setIsOpen(true)}
            disabled={disabled}
            aria-label={registration.disabledReason || "פתיחת VetBot"}
            title={registration.disabledReason || "פתיחת VetBot"}
            className={`group relative flex h-13 w-13 items-center justify-center rounded-2xl border shadow-[0_14px_34px_rgba(30,64,175,0.24)] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60 md:h-28 md:w-12 md:flex-col md:gap-2 md:rounded-l-none md:rounded-r-2xl ${
              disabled
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : "cursor-pointer border-blue-200/80 bg-gradient-to-b from-[#2563eb] to-[#1e40af] text-white hover:w-14 hover:from-blue-600 hover:to-blue-900"
            }`}
          >
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="hidden text-[12px] font-extrabold tracking-wide md:block md:[writing-mode:vertical-rl] md:rotate-180">
              {registration.compactTitle}
            </span>
            {attentionCount > 0 && !disabled && (
              <span
                className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white ring-2 ring-white md:-right-2"
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
