import { useState } from "react";
import { Bot, ChevronLeft, ShieldCheck, Sparkles } from "lucide-react";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import type { AiAssistantMode, AiQuickAction, AiUserRole } from "./aiTypes";

type Props = {
  mode: AiAssistantMode;
  title: string;
  subtitle: string;
  compactTitle?: string;
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole?: AiUserRole;
  disabledReason?: string | null;
  privacyNote?: string;
};

export function AiAssistantCard({
  mode,
  title,
  subtitle,
  compactTitle = "עוזר חכם",
  quickActions,
  buildContext,
  userRole = "unknown",
  disabledReason,
  privacyNote,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const disabled = Boolean(disabledReason);

  return (
    <>
      <section className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 md:p-5 overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-blue-50 to-transparent pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1e40af] to-[#6366f1] flex items-center justify-center shrink-0 shadow-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-gray-900 text-[16px] font-bold">{compactTitle}</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 text-[11px] font-bold">
                  <ShieldCheck className="w-3 h-3" /> מידע מסונן
                </span>
              </div>
              <p className="text-gray-500 text-[13px] leading-5 font-medium max-w-3xl">{subtitle}</p>
              {disabledReason && <p className="text-amber-600 text-[12px] mt-1 font-semibold">{disabledReason}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(true)}
            disabled={disabled}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-gray-300 text-white px-4 py-2.5 text-[13px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" /> פתח עוזר <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </section>

      <AiAssistantDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode={mode}
        title={title}
        subtitle={subtitle}
        quickActions={quickActions}
        buildContext={buildContext}
        userRole={userRole}
        privacyNote={privacyNote}
      />
    </>
  );
}
