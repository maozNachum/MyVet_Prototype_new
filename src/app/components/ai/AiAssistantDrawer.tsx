import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ChevronDown, Info, Loader2, RefreshCw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router";
import { askAiAssistant, decideAiAction, recordAiFeedback } from "./aiClient";
import { buildLocalProactiveBriefing } from "./aiProactiveEngine";
import { AiStructuredAnswer } from "./AiStructuredAnswer";
import { buildAiContinuationQuestion, getAiContextTransitionMessage, loadAiConversation, saveAiConversation } from "./aiConversationStorage";
import type { AiConversationContextIdentity } from "./aiConversationStorage";
import type {
  AiAssistantMode,
  AiAssistantResult,
  AiActionPlan,
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
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole?: AiUserRole;
  contextIdentity: AiConversationContextIdentity;
  desktopDocked?: boolean;
};

export function AiAssistantDrawer({
  isOpen,
  onClose,
  mode,
  title,
  quickActions,
  buildContext,
  userRole = "unknown",
  contextIdentity,
  desktopDocked = false,
}: Props) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadAiConversation<AiChatMessage>("main").messages);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isPreparingBriefing, setIsPreparingBriefing] = useState(false);
  const [proactiveBriefing, setProactiveBriefing] = useState<AiAssistantResult | null>(null);
  const [isBriefingExpanded, setIsBriefingExpanded] = useState(false);
  const [memorySummary, setMemorySummary] = useState(() => loadAiConversation<AiChatMessage>("main").memorySummary || "");
  const [activeContext, setActiveContext] = useState<AiConversationContextIdentity | undefined>(() => loadAiConversation<AiChatMessage>("main").activeContext);
  const [historyStartIndex, setHistoryStartIndex] = useState(() => loadAiConversation<AiChatMessage>("main").historyStartIndex || 0);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const contextRef = useRef<unknown>(null);
  const messagesRef = useRef(messages);
  const activeContextRef = useRef(activeContext);
  const historyStartIndexRef = useRef(historyStartIndex);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    let active = true;
    contextRef.current = null;
    const transitionMessage = getAiContextTransitionMessage(activeContextRef.current, contextIdentity);
    if (transitionMessage) {
      const nextHistoryStart = messagesRef.current.length;
      historyStartIndexRef.current = nextHistoryStart;
      setHistoryStartIndex(nextHistoryStart);
      setMemorySummary("");
      setContextNotice(transitionMessage);
      setIsBriefingExpanded(false);
    }
    activeContextRef.current = contextIdentity;
    setActiveContext(contextIdentity);
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
  }, [isOpen, mode, buildContext, contextIdentity.key, contextIdentity.label]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking, error]);

  useEffect(() => {
    saveAiConversation("main", messages, memorySummary, { activeContext, historyStartIndex });
  }, [activeContext, historyStartIndex, memorySummary, messages]);

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
    if (!trimmed || isThinking || actionLoadingId) return;

    setError(null);
    setLastFailedQuestion("");
    setContextNotice(null);
    setInput("");
    const nextMessages: AiChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setIsThinking(true);

    try {
      const context = contextRef.current ?? await buildContext();
      contextRef.current = context;
      const requestHistory = nextMessages.slice(historyStartIndexRef.current).slice(-8);
      const result = await askAiAssistant({
        mode,
        question: buildAiContinuationQuestion(requestHistory, trimmed),
        context,
        history: requestHistory,
        memorySummary,
        userRole,
      });
      setMemorySummary(result.memorySummary || memorySummary);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer, result }]);
    } catch (err: any) {
      console.error(err);
      const failureMessage =
        err instanceof Error && err.message
          ? err.message
          : "לא הצלחנו לקבל תשובה מ־VetBot";
      const fallback = buildLocalProactiveBriefing(mode, contextRef.current);
      if (fallback) {
        const fallbackResult: AiAssistantResult = {
          ...fallback,
          answer: "החיבור לשירות החיצוני אינו זמין כרגע. הנה תמונת מצב מקומית שנוצרה בתוך MyVet בלבד.",
          summary: "לא נשלח מידע לספק AI בתשובה החלופית הזו.",
        };
        setMessages((prev) => [...prev, { role: "assistant", content: fallbackResult.answer, result: fallbackResult }]);
        setError(`${failureMessage} אפשר להחזיר את השאלה ולנסות שוב.`);
      } else {
        setError(failureMessage);
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

  async function handleActionDecision(plan: AiActionPlan, decision: "approve" | "reject") {
    if (!plan.requestId || actionLoadingId) return;
    setError(null);
    setActionLoadingId(plan.requestId);
    try {
      const result = await decideAiAction({ mode, requestId: plan.requestId, decision, userRole });
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer, result }]);
      if (result.actionPlan?.status === "executed") {
        contextRef.current = await buildContext();
        window.dispatchEvent(new CustomEvent("myvet:vetbot-action", { detail: { actionType: plan.type } }));
      }
    } catch (actionError: any) {
      setError(actionError instanceof Error ? actionError.message : "לא הצלחנו לעדכן את הפעולה.");
    } finally {
      setActionLoadingId(null);
    }
  }

  return createPortal(
    <div className="myvet-vetbot pointer-events-none fixed inset-0 z-[260]" dir="rtl">
      <button
        type="button"
        aria-label="סגירת VetBot"
        onClick={onClose}
        className={`pointer-events-auto absolute inset-0 cursor-default bg-gray-900/25 backdrop-blur-[1px] ${
          desktopDocked ? "min-[1440px]:hidden" : ""
        }`}
      />

      <aside
        role="dialog"
        aria-label={title}
        className={`pointer-events-auto absolute left-0 top-0 flex h-full w-full flex-col border-r border-gray-100 bg-white shadow-2xl animate-in slide-in-from-left duration-200 ${
          desktopDocked ? "max-w-[480px] min-[1440px]:max-w-[440px]" : "max-w-[480px]"
        }`}
      >
        <div className="min-h-[105px] shrink-0 border-b border-gray-100 bg-gradient-to-l from-slate-950 to-blue-900 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[18px] font-bold">{title}</h2>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold">AI</span>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="סגירת VetBot" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/15 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-blue-100 bg-blue-50/70 px-5 py-2.5">
          <p className="flex items-start gap-2 text-[12.5px] font-semibold leading-6 text-blue-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ת״ז, כתובת ופרטי קשר מוסרים לפני העיבוד. VetBot עשוי לטעות; החלטות רפואיות ושליחה ללקוח דורשות אישור אנושי.
            <a href="/privacy#vetbot" target="_blank" rel="noreferrer" className="shrink-0 font-extrabold text-[#1e40af] underline underline-offset-2">פרטים</a>
          </p>
        </div>

        <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-2">
          <p className="truncate text-[11.5px] font-semibold text-slate-500">
            <span className="font-extrabold text-[#1e40af]">הקשר פעיל:</span> {contextIdentity.label}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 px-5 py-4">
          <div className="space-y-4 pb-4">
            {contextNotice && (
              <div className="flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-[12.5px] font-semibold leading-6 text-blue-950" role="status">
                <Info className="mt-1 h-4 w-4 shrink-0 text-blue-600" />
                <span>{contextNotice}</span>
              </div>
            )}
            {(isPreparingBriefing || proactiveBriefing) && (
              <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => proactiveBriefing && setIsBriefingExpanded((current) => !current)}
                  disabled={isPreparingBriefing || !proactiveBriefing}
                  aria-expanded={isBriefingExpanded}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-right disabled:cursor-wait"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {isPreparingBriefing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" /> : <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />}
                    <span className="min-w-0">
                      <span className="block text-[13px] font-extrabold text-slate-900">{isPreparingBriefing ? "בודק מה חשוב עכשיו..." : "מה כדאי לבדוק היום"}</span>
                      {!isPreparingBriefing && proactiveBriefing && (
                        <span className="block truncate text-[11.5px] font-medium text-slate-500">
                          {proactiveBriefing.findings.length > 0 ? `${proactiveBriefing.findings.length} נושאים מחכים לבדיקה · לחץ להצגה` : "אין כרגע נושאים חריגים · לחץ לפרטים"}
                        </span>
                      )}
                    </span>
                  </span>
                  {!isPreparingBriefing && <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isBriefingExpanded ? "rotate-180" : ""}`} />}
                </button>
                {isBriefingExpanded && proactiveBriefing && (
                  <div className="border-t border-blue-50 px-4 py-3">
                    <AiStructuredAnswer result={proactiveBriefing} onAction={handleAction} compact />
                  </div>
                )}
              </div>
            )}

            {messages.length === 0 && (
              <>
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
                  <div className={`max-w-[94%] overflow-visible rounded-2xl px-4 py-3.5 text-[15px] shadow-sm break-words ${isUser ? "bg-[#1e40af] text-white" : "border border-blue-100 bg-white text-slate-900"}`}>
                    {isUser ? (
                      <p className="whitespace-pre-wrap font-medium leading-7 text-white">{message.content}</p>
                    ) : message.result ? (
                      <AiStructuredAnswer
                        result={message.result}
                        onAction={handleAction}
                        onActionDecision={handleActionDecision}
                        actionLoadingId={actionLoadingId}
                        feedback={feedbackByMessage[index]}
                        onFeedback={(helpful) => handleFeedback(index, message.result!, helpful)}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap font-medium leading-7 text-slate-800">{message.content}</p>
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
              className="max-h-32 min-h-[48px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] font-medium leading-7 text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
            />
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-gray-400">Enter לשליחה</p>
              <button type="button" onClick={() => send(input)} disabled={!input.trim() || isThinking || Boolean(actionLoadingId)} aria-label="שליחה ל-VetBot" className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-[#1e40af] text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-gray-300">
                {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
