import { useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";
import { AiAssistantDrawer } from "./AiAssistantDrawer";
import type { AiAssistantMode, AiQuickAction, AiUserRole } from "./aiTypes";

type Props = {
  mode: AiAssistantMode;
  title: string;
  compactTitle?: string;
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole?: AiUserRole;
  disabledReason?: string | null;
  attentionCount?: number;
};

export function AiAssistantCard({
  mode,
  title,
  compactTitle = "VetBot",
  quickActions,
  buildContext,
  userRole = "unknown",
  disabledReason,
  attentionCount = 0,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const disabled = Boolean(disabledReason);

  return (
    <>
      <div className="inline-flex items-center" dir="rtl">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          title={disabledReason || "פתיחת VetBot"}
          className={`group inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-bold shadow-sm transition-all ${
            disabled
              ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
              : "cursor-pointer border-blue-100 bg-white text-[#1e40af] hover:bg-blue-50 hover:border-blue-200 hover:shadow-md"
          }`}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#1e40af] to-[#6366f1] text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span>{compactTitle}</span>
          {attentionCount > 0 && !disabled && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-extrabold text-red-700 ring-1 ring-red-100" aria-label={`${attentionCount} נושאים לבדיקה`}>
              {attentionCount > 99 ? "99+" : attentionCount}
            </span>
          )}
          <ChevronLeft className="h-4 w-4 opacity-70 transition-transform group-hover:-translate-x-0.5" />
        </button>
      </div>

      <AiAssistantDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mode={mode}
        title={title}
        quickActions={quickActions}
        buildContext={buildContext}
        userRole={userRole}
      />
    </>
  );
}
