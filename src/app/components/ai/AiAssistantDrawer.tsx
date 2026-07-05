import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, Loader2, Send, ShieldCheck, Sparkles, X } from "lucide-react";
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

function cleanupAnswer(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatAnswer(text: string) {
  const clean = cleanupAnswer(text);
  const blocks = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-2.5 text-right leading-7 break-words overflow-visible">
      {blocks.map((line, index) => {
        const isBullet = /^[-•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
        const normalized = line.replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, "");
        const isHeading = /^[^:]{2,35}:$/.test(normalized) || /^(שורה תחתונה|מה ראיתי|מה לעשות עכשיו|שים לב|המלצה|סיכום):/.test(normalized);

        if (isBullet) {
          return (
            <div key={`${line}-${index}`} className="relative pr-5 text-[14px] text-gray-700">
              <span className="absolute right-0 top-0 text-[#1e40af]">•</span>
              <span>{normalized}</span>
            </div>
          );
        }

        return (
          <p
            key={`${line}-${index}`}
            className={`${isHeading ? "font-bold text-gray-900" : "text-gray-700"} text-[14px] whitespace-pre-wrap`}
          >
            {normalized}
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
  const endRef = useRef<HTMLDivElement | null>(null);

  const intro = useMemo(() => {
    if (mode === "portal") return "אני יכול לעזור בניווט בפורטל, קביעת תור, פתיחת פנייה וצירוף מסמכים. אני לא מחליף וטרינר.";
    if (mode === "medical-record") return "אני יכול לעזור לסכם, לנסח ולהבליט שדות חסרים. החלטה רפואית נשארת אצל הצוות.";
    if (mode === "digital-care") return "אני יכול לסכם שיחה, להציע תשובה ולזהות דחיפות — בלי לשלוח הודעה לבד.";
    if (mode === "inventory") return "אני יכול לעזור לזהות חוסרים, פריטים קריטיים וסדר עדיפויות להזמנה.";
    if (mode === "schedule") return "אני יכול לבדוק עומסים, חלונות פנויים והתנגשויות ביומן.";
    return "אני כאן כדי לתת תובנות קצרות ופעולות מומלצות בלי להשתלט על המסך.";
  }, [mode]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking, error]);

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
      <button
        type="button"
        aria-label="סגירת עוזר"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-gray-900/25 backdrop-blur-[1px]"
      />

      <aside className="absolute left-0 top-0 flex h-full w-full max-w-[460px] flex-col border-r border-gray-100 bg-white shadow-2xl animate-in slide-in-from-left duration-200">
        <div className="shrink-0 border-b border-gray-100 bg-gradient-to-l from-slate-950 to-blue-900 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold">
                <Sparkles className="h-3.5 w-3.5" /> עוזר חכם
              </div>
              <h2 className="truncate text-[18px] font-bold">{title}</h2>
              {subtitle && <p className="mt-1 text-[12px] leading-5 text-white/70">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-gray-100 bg-blue-50/70 px-5 py-3">
          <div className="flex items-start gap-2 text-[12px] font-medium leading-5 text-blue-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{privacyNote}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 px-5 py-4">
          <div className="space-y-4 pb-4">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
                  <Bot className="h-5 w-5 text-[#1e40af]" />
                </div>
                <p className="text-[14px] font-semibold leading-6 text-gray-800">{intro}</p>
                {quickActions.length > 0 && (
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => send(action.prompt)}
                        className="cursor-pointer rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-right text-[13px] font-semibold text-gray-700 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-800"
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
                  <div
                    className={`max-w-[90%] overflow-visible rounded-2xl px-4 py-3 text-[14px] shadow-sm break-words ${
                      isUser ? "bg-[#1e40af] text-white" : "border border-gray-100 bg-white text-gray-800"
                    }`}
                  >
                    {isUser ? <p className="whitespace-pre-wrap leading-7 text-white">{message.content}</p> : formatAnswer(message.content)}
                  </div>
                </div>
              );
            })}

            {isThinking && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-500 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> חושב ומסנן מידע רגיש...
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-medium leading-6 text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white p-4">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              placeholder="שאל את העוזר..."
              className="max-h-32 min-h-[48px] w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-6 text-gray-800 outline-none placeholder:text-gray-400"
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-gray-400">Enter לשליחה · Shift+Enter לשורה חדשה</p>
              <button
                type="button"
                onClick={() => send(input)}
                disabled={!input.trim() || isThinking}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-[#1e40af] text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
