import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  BarChart3,
  Bed,
  CalendarDays,
  ClipboardPlus,
  Command,
  FileText,
  FlaskConical,
  Home,
  MessageCircle,
  Package,
  PawPrint,
  PlusCircle,
  ReceiptText,
  Search,
  Stethoscope,
  Tags,
  Users,
  Video,
  X,
} from "lucide-react";
import { getStaffLabel, getStaffType } from "../data/staffAuth";
import {
  APP_ACTION_GROUP_LABELS,
  getAllowedAppActions,
  scoreAppAction,
  type AppAction,
  type AppActionGroup,
  type AppActionIconKey,
} from "../navigation/appActions";

const ICONS: Record<AppActionIconKey, typeof Home> = {
  home: Home,
  calendar: CalendarDays,
  plus: PlusCircle,
  paw: PawPrint,
  users: Users,
  message: MessageCircle,
  video: Video,
  bed: Bed,
  flask: FlaskConical,
  package: Package,
  receipt: ReceiptText,
  chart: BarChart3,
  file: FileText,
  stethoscope: Stethoscope,
  clipboard: ClipboardPlus,
  price: Tags,
};

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

export function CommandCenter() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const staffType = getStaffType();
  const staffLabel = getStaffLabel(staffType);
  const shortcutKey = isMac() ? "⌘ K" : "Ctrl K";

  const actions = useMemo(() => getAllowedAppActions(staffType), [staffType]);

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    return actions
      .map((action) => ({ action, score: scoreAppAction(action, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.action);
  }, [actions, query]);

  const groupedActions = useMemo(() => {
    return filteredActions.reduce<Record<AppActionGroup, AppAction[]>>((acc, action) => {
      if (!acc[action.group]) acc[action.group] = [];
      acc[action.group].push(action);
      return acc;
    }, {} as Record<AppActionGroup, AppAction[]>);
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

  const runAction = (action: AppAction) => {
    navigate(action.route);
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
                <p className="text-[14px] text-slate-500">גישה מהירה לפי תפקיד: {staffLabel}</p>
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
              placeholder="חפש פעולה — תור, תיק רפואי, חוב, מחירון, מעבדה, אשפוז..."
              className="h-13 w-full rounded-2xl border border-slate-200 bg-white pr-12 pl-4 text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {filteredActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
              <Search className="mb-3 h-9 w-9 text-slate-300" />
              <h3 className="text-[16px] font-bold text-slate-800">לא מצאנו פעולה מתאימה</h3>
              <p className="mt-1 max-w-md text-[14px] leading-6 text-slate-500">נסה שם פעולה אחר, למשל תור, מחירון, חוב, אשפוז או מעבדה.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {(Object.keys(APP_ACTION_GROUP_LABELS) as AppActionGroup[]).map((group) => {
                const groupItems = groupedActions[group];
                if (!groupItems?.length) return null;

                return (
                  <section key={group}>
                    <h3 className="mb-2 px-2 text-[13px] font-bold uppercase tracking-wide text-slate-400">{APP_ACTION_GROUP_LABELS[group]}</h3>
                    <div className="space-y-2">
                      {groupItems.map((action) => {
                        const Icon = ICONS[action.iconKey] || Home;
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
                                {action.badge && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[12px] font-bold text-blue-700">{action.badge}</span>}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[14px] leading-5 text-slate-500">{action.description}</p>
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

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-[13px] text-slate-500">
          <span>אפשר לפתוח מכל מסך.</span>
          <kbd className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-sans text-[13px] font-bold text-slate-600 shadow-sm">{shortcutKey}</kbd>
        </div>
      </div>
    </div>
  );
}
