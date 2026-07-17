import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, ThumbsDown, ThumbsUp, TriangleAlert, XCircle } from "lucide-react";
import type { AiActionPlan, AiAssistantResult, AiSuggestedAction } from "./aiTypes";

function cleanupAnswer(text: string) {
  return text
    .replace(/(?:^|\n)\s*מקור\s*:.*(?=\n|$)/giu, "\n")
    .replace(/\*\*/g, "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function AnswerText({ text }: { text: string }) {
  const blocks = cleanupAnswer(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="space-y-3 break-words text-right text-[15px] font-medium leading-7 text-slate-800">
      {blocks.map((line, index) => {
        const isBullet = /^[-•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
        const normalized = line.replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, "");
        const isHeading = /^[^:]{2,35}:$/.test(normalized) || /^(שורה תחתונה|מה ראיתי|מה לעשות עכשיו|שים לב|המלצה|סיכום):/.test(normalized);
        if (isBullet) {
          return (
            <div key={`${line}-${index}`} className="relative pr-5 text-[15px] leading-7 text-slate-800">
              <span className="absolute right-0 top-0 text-[#1e40af]">•</span>
              <span>{normalized}</span>
            </div>
          );
        }
        return <p key={`${line}-${index}`} className={`${isHeading ? "font-extrabold text-slate-950" : "text-slate-800"} whitespace-pre-wrap text-[15px] leading-7`}>{normalized}</p>;
      })}
    </div>
  );
}

const urgencyStyles = {
  normal: "border-blue-100 bg-blue-50/60 text-blue-800",
  important: "border-amber-200 bg-amber-50 text-amber-900",
  urgent: "border-red-200 bg-red-50 text-red-900",
};

export function AiStructuredAnswer({
  result,
  onAction,
  onFeedback,
  feedback,
  compact = false,
  onActionDecision,
  actionLoadingId,
}: {
  result: AiAssistantResult;
  onAction?: (action: AiSuggestedAction) => void;
  onFeedback?: (helpful: boolean) => void;
  feedback?: boolean | null;
  compact?: boolean;
  onActionDecision?: (plan: AiActionPlan, decision: "approve" | "reject") => void;
  actionLoadingId?: string | null;
}) {
  return (
    <div className="space-y-3">
      <AnswerText text={result.answer} />

      {result.findings.length > 0 && (
        <div className="space-y-2">
          {result.findings.slice(0, compact ? 2 : 4).map((item) => (
            <div key={item.id} className={`rounded-xl border px-3 py-2.5 ${urgencyStyles[item.urgency]}`}>
              <div className="flex items-start gap-2">
                {item.urgency === "urgent" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[13px] font-extrabold">{item.title}</p>
                  <p className="mt-0.5 text-[12px] font-medium leading-5 opacity-85">{item.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.actionPlan && (
        <ActionPlanCard
          plan={result.actionPlan}
          onDecision={onActionDecision}
          loading={Boolean(result.actionPlan.requestId && actionLoadingId === result.actionPlan.requestId)}
        />
      )}

      {result.suggestedActions.length > 0 && onAction && (
        <div className="flex flex-wrap gap-2">
          {result.suggestedActions.slice(0, 3).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action)}
              title={action.reason}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-extrabold text-[#1e40af] transition-colors hover:border-blue-200 hover:bg-blue-100"
            >
              {action.label} <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          {result.privacy.externalProcessing ? "נשלח מידע מצומצם ללא מזהים ישירים" : "הניתוח בוצע מקומית"}
        </span>
        {onFeedback && (
          <div className="flex items-center gap-1" aria-label="משוב על תשובת VetBot">
            <button type="button" onClick={() => onFeedback(true)} className={`flex h-7 w-7 items-center justify-center rounded-lg ${feedback === true ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-slate-100"}`} aria-label="התשובה עזרה">
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onFeedback(false)} className={`flex h-7 w-7 items-center justify-center rounded-lg ${feedback === false ? "bg-red-100 text-red-700" : "text-slate-400 hover:bg-slate-100"}`} aria-label="התשובה לא עזרה">
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionPlanCard({
  plan,
  onDecision,
  loading,
}: {
  plan: AiActionPlan;
  onDecision?: (plan: AiActionPlan, decision: "approve" | "reject") => void;
  loading: boolean;
}) {
  const style = plan.status === "executed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : plan.status === "needs_confirmation"
      ? plan.destructive ? "border-amber-200 bg-amber-50 text-amber-950" : "border-blue-200 bg-blue-50 text-blue-950"
      : plan.status === "needs_details"
        ? "border-violet-200 bg-violet-50 text-violet-950"
        : plan.status === "rejected"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : "border-red-200 bg-red-50 text-red-950";
  const Icon = plan.status === "executed" ? CheckCircle2 : plan.status === "rejected" ? XCircle : TriangleAlert;
  const statusLabel = plan.status === "executed"
    ? "בוצע במערכת"
    : plan.status === "needs_confirmation"
      ? "ממתין לאישור — טרם בוצע"
      : plan.status === "needs_details"
        ? "חסרים פרטים — טרם בוצע"
        : plan.status === "rejected"
          ? "בוטל"
          : "לא בוצע";

  return (
    <section className={`rounded-2xl border p-3.5 ${style}`} aria-label={plan.title}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="mb-1.5 inline-flex rounded-full border border-current/15 bg-white/70 px-2 py-1 text-[10.5px] font-black">
            {statusLabel}
          </span>
          <p className="text-[14px] font-black leading-6">{plan.title}</p>
          <p className="mt-1 text-[12.5px] font-medium leading-6 opacity-85">{plan.summary}</p>

          {plan.missingFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.missingFields.map((field) => <span key={field} className="rounded-full border border-current/15 bg-white/70 px-2 py-1 text-[11px] font-bold">{field}</span>)}
            </div>
          )}

          {plan.details.length > 0 && (
            <dl className="mt-3 grid gap-1.5 rounded-xl border border-current/10 bg-white/70 p-2.5">
              {plan.details.map((detail) => (
                <div key={`${detail.label}-${detail.value}`} className="flex items-start justify-between gap-3 text-[12px] leading-5">
                  <dt className="shrink-0 font-bold opacity-65">{detail.label}</dt>
                  <dd className="min-w-0 text-left font-extrabold break-words" dir="auto">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {plan.status === "needs_confirmation" && plan.requestId && onDecision && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => onDecision(plan, "approve")}
                className={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-black text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${plan.destructive ? "bg-amber-600 hover:bg-amber-700" : "bg-[#1e40af] hover:bg-[#1e3a8a]"}`}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {plan.confirmationLabel || "אישור וביצוע"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => onDecision(plan, "reject")}
                className="min-h-10 cursor-pointer rounded-xl border border-current/15 bg-white px-3 py-2 text-[12px] font-black hover:bg-white/70 disabled:cursor-wait disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

