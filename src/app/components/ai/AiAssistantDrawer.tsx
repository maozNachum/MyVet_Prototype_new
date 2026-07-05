import { useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { askAiAssistant } from "./aiClient";
import type { AiAssistantMode, AiChatMessage, AiQuickAction, AiUserRole } from "./aiTypes";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode: AiAssistantMode;
  title: string;
  subtitle?: string;
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole?: AiUserRole;
  privacyNote?: string;
};

function formatAnswer(text: string) {
  const clean = text.replace(/\*\*/g, "").trim();
  const lines = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-2 leading-7">
      {lines.map((line, index) => {
        const isBullet = /^[-•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
        return (
          <p key={`${line}-${index}`} className={isBullet ? "pr-4 relative" : ""}>
            {isBullet && <span className="absolute right-0 top-0 text-blue-500">•</span>}
            {line.replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, "")}
          </p>
        );
      })}
    </div>
  );
}

export function AiAssistantDrawer({
  isOpen,
  onClose,
  mode,
  title,
  subtitle,
  quickActions,
  buildContext,
  userRole = "unknown",
  privacyNote = "העוזר מקבל רק מידע מצומצם ומנוקה מפרטים מזהים.",
}: Props) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const intro = useMemo(() => {
    if (mode === "portal") return "אני יכול לעזור בניווט בפורטל, קביעת תור, פתיחת פנייה וצירוף מסמכים. אני לא מחליף וטרינר.";
    if (mode === "medical-record") return "אני יכול לעזור לסכם, לנסח ולהבליט שדות חסרים. החלטה רפואית נשארת אצל הצוות.";
    if (mode === "digital-care") return "אני יכול לסכם שיחה, להציע תשובה ולזהות דחיפות — בלי לשלוח הודעה לבד.";
    return "אני כאן כדי לתת תובנות קצרות ופעולות מומלצות בלי להשתלט על המסך.";
  }, [mode]);

  if (!isOpen) return null;

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;

    setError(null);
    setInput("");
    const nextMessages: AiChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setIsThinking(true);

    try {
      const context = await buildContext();
      const answer = await askAiAssistant({
        mode,
        question: trimmed,
        context,
        history: nextMessages.slice(-6),
        userRole,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "לא הצלחנו לקבל תשובה מהעוזר");
    } finally {
      setIsThinking(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="fixed inset-0 z-[260]" dir="rtl">
      <button type="button" aria-label="סגירת עוזר" onClick={onClose} className="absolute inset-0 bg-gray-900/25 backdrop-blur-[1px] cursor-default" />

      <aside className="absolute top-0 left-0 h-full w-full max-w-[430px] bg-white shadow-2xl border-r border-gray-100 flex flex-col animate-in slide-in-from-left duration-200">
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-l from-slate-900 to-blue-900 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5" /> עוזר חכם
              </div>
              <h2 className="text-[18px] font-bold truncate">{title}</h2>
              {subtitle && <p className="text-white/70 text-[12px] mt-1 leading-5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 bg-blue-50/60">
          <div className="flex items-start gap-2 text-blue-800 text-[12px] leading-5 font-medium">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{privacyNote}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50/50">
          {messages.length === 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                <Bot className="w-5 h-5 text-[#1e40af]" />
              </div>
              <p className="text-gray-800 text-[14px] font-semibold leading-6">{intro}</p>
              {quickActions.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => send(action.prompt)}
                      className="text-right rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-100 px-3 py-2.5 text-[13px] text-gray-700 hover:text-blue-800 font-semibold transition-colors cursor-pointer"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] shadow-sm break-words ${isUser ? "bg-[#1e40af] text-white" : "bg-white border border-gray-100 text-gray-800"}`}>
                  {isUser ? <p className="whitespace-pre-wrap leading-7">{message.content}</p> : formatAnswer(message.content)}
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div className="flex justify-end">
              <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 text-gray-500 text-[13px] shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> חושב ומסנן מידע רגיש...
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-[13px] font-semibold">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white">
          {messages.length > 0 && quickActions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
              {quickActions.slice(0, 4).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => send(action.prompt)}
                  className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-100 px-3 py-1.5 text-[12px] text-gray-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="שאל שאלה קצרה..."
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim() || isThinking}
              className="w-11 h-11 rounded-2xl bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-gray-300 text-white flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
