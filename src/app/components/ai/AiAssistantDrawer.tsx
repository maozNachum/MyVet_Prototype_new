import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router";
import { askAiAssistant, recordAiFeedback } from "./aiClient";
import { buildLocalProactiveBriefing } from "./aiProactiveEngine";
import { AiStructuredAnswer } from "./AiStructuredAnswer";
import type {
  AiAssistantMode,
  AiAssistantResult,
  AiChatMessage,
  AiQuickAction,
  AiSuggestedAction,
  AiUserRole,
} from "./aiTypes";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode: AiAssistantMode;
  title: string;
  subtitle?: string;
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole?: AiUserRole;
};

export function AiAssistantDrawer({
  isOpen,
  onClose,
  mode,
  title,
  subtitle,
  quickActions,
  buildContext,
  userRole = "unknown",
}: Props) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isPreparingBriefing, setIsPreparingBriefing] = useState(false);
  const [proactiveBriefing, setProactiveBriefing] = useState<AiAssistantResult | null>(null);
  const [memorySummary, setMemorySummary] = useState("");
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const contextRef = useRef<unknown>(null);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    let active = true;
    setIsPreparingBriefing(true);
    Promise.resolve(buildContext())
      .then((context) => {
        if (!active) return;
        contextRef.current = context;
        setProactiveBriefing(buildLocalProactiveBriefing(mode, context));
      })
      .catch((briefingError) => {
        console.warn("VetBot local briefing was not prepared", briefingError);
        if (active) setProactiveBriefing(null);
      })
      .finally(() => active && setIsPreparingBriefing(false));

    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [isOpen, mode, buildContext]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking, error]);

  if (!isOpen) return null;

  function handleAction(action: AiSuggestedAction) {
    if (action.route) {
      onClose();
      navigate(action.route);
      return;
    }
    setInput(action.reason || action.label);
    inputRef.current?.focus();
  }

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;

    setError(null);
    setLastFailedQuestion("");
    setInput("");
    const nextMessages: AiChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setIsThinking(true);

    try {
      const context = contextRef.current ?? await buildContext();
      contextRef.current = context;
      const result = await askAiAssistant({
        mode,
        question: trimmed,
        context,
        history: nextMessages.slice(-8),
        memorySummary,
        userRole,
      });
      setMemorySummary(result.memorySummary || memorySummary);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer, result }]);
    } catch (err: any) {
      console.error(err);
      const fallback = buildLocalProactiveBriefing(mode, contextRef.current);
      if (fallback) {
        const fallbackResult: AiAssistantResult = {
          ...fallback,
          answer: "החיבור לשירות החיצוני אינו זמין כרגע. הנה תמונת מצב מקומית שנוצרה בתוך MyVet בלבד.",
          summary: "לא נשלח מידע לספק AI בתשובה החלופית הזו.",
        };
        setMessages((prev) => [...prev, { role: "assistant", content: fallbackResult.answer, result: fallbackResult }]);
        setError("אפשר להמשיך לעבוד עם התובנות המקומיות או להחזיר את השאלה ולנסות שוב.");
      } else {
        setError(err?.message || "לא הצלחנו לקבל תשובה מ־VetBot");
      }
      setLastFailedQuestion(trimmed);
    } finally {
      setIsThinking(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleFeedback(index: number, result: AiAssistantResult, helpful: boolean) {
    setFeedbackByMessage((prev) => ({ ...prev, [index]: helpful }));
    void recordAiFeedback({ mode, helpful, usedTools: result.usedTools });
  }

  return (
    <div className="fixed inset-0 z-[260]" dir="rtl">
      <button type="button" aria-label="סגירת VetBot" onClick={onClose} className="absolute inset-0 cursor-default bg-gray-900/25 backdrop-blur-[1px]" />

      <aside className="absolute left-0 top-0 flex h-full w-full max-w-[480px] flex-col border-r border-gray-100 bg-white shadow-2xl animate-in slide-in-from-left duration-200">
        <div className="shrink-0 border-b border-gray-100 bg-gradient-to-l from-slate-950 to-blue-900 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[18px] font-bold">{title}</h2>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold">AI</span>
              </div>
              {subtitle && <p className="mt-1 text-[13px] leading-5 text-white/70">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="סגירת VetBot" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/15 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-blue-100 bg-blue-50/70 px-5 py-2.5">
          <p className="flex items-start gap-2 text-[11.5px] font-semibold leading-5 text-blue-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ת״ז, כתובת ופרטי קשר מוסרים לפני העיבוד. VetBot עשוי לטעות; החלטות רפואיות ושליחה ללקוח דורשות אישור אנושי.
            <a href="/privacy#vetbot" target="_blank" rel="noreferrer" className="shrink-0 font-extrabold text-[#1e40af] underline underline-offset-2">פרטים</a>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 px-5 py-4">
          <div className="space-y-4 pb-4">
            {messages.length === 0 && (
              <>
                {isPreparingBriefing && (
                  <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-[13px] font-semibold text-slate-500 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> מכין תדריך מקומי ומוגן...
                  </div>
                )}
                {!isPreparingBriefing && proactiveBriefing && (
                  <div className="rounded-2xl border border-blue-100 bg-white px-4 py-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-[13px] font-extrabold text-slate-900"><Sparkles className="h-4 w-4 text-blue-600" /> תדריך יזום</p>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">בוצע מקומית</span>
                    </div>
                    <AiStructuredAnswer result={proactiveBriefing} onAction={handleAction} compact />
                  </div>
                )}
                {quickActions.length > 0 && (
                  <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
                    <p className="mb-2.5 text-[13px] font-bold text-gray-500">פעולות מהירות</p>
                    <div className="grid grid-cols-1 gap-2">
                      {quickActions.slice(0, 3).map((action) => (
                        <button key={action.label} type="button" onClick={() => send(action.prompt)} className="cursor-pointer rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-right text-[14px] font-semibold text-gray-700 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-800">
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {messages.map((message, index) => {
              const isUser = message.role === "user";
              return (
                <div key={`${message.role}-${index}`} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[94%] overflow-visible rounded-2xl px-4 py-3 text-[14px] shadow-sm break-words ${isUser ? "bg-[#1e40af] text-white" : "border border-gray-100 bg-white text-gray-800"}`}>
                    {isUser ? (
                      <p className="whitespace-pre-wrap leading-7 text-white">{message.content}</p>
                    ) : message.result ? (
                      <AiStructuredAnswer result={message.result} onAction={handleAction} feedback={feedbackByMessage[index]} onFeedback={(helpful) => handleFeedback(index, message.result!, helpful)} />
                    ) : (
                      <p className="whitespace-pre-wrap leading-7 text-slate-700">{message.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {isThinking && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-500 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> בודק נתונים ומכין תשובה...
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium leading-6 text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span>{error}</span>
                  {lastFailedQuestion && (
                    <button
                      type="button"
                      onClick={() => {
                        setInput(lastFailedQuestion);
                        setError(null);
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-amber-900 hover:bg-amber-100"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> החזר את השאלה
                    </button>
                  )}
                </div>
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
              placeholder="שאל את VetBot — אין להזין ת״ז, כתובת או פרטי קשר"
              className="max-h-32 min-h-[48px] w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-6 text-gray-800 outline-none placeholder:text-gray-400"
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-gray-400">Enter לשליחה · המידע עובר צמצום אוטומטי</p>
              <button type="button" onClick={() => send(input)} disabled={!input.trim() || isThinking} aria-label="שליחה ל-VetBot" className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-[#1e40af] text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-gray-300">
                {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

