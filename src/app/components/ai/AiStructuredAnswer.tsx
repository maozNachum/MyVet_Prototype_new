import { ArrowLeft, CheckCircle2, ShieldCheck, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import type { AiAssistantResult, AiSuggestedAction } from "./aiTypes";

function cleanupAnswer(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function AnswerText({ text }: { text: string }) {
  const blocks = cleanupAnswer(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="space-y-2.5 break-words text-right leading-7">
      {blocks.map((line, index) => {
        const isBullet = /^[-•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
        const normalized = line.replace(/^[-•]\s+/, "").replace(/^\d+[.)]\s+/, "");
        const isHeading = /^[^:]{2,35}:$/.test(normalized) || /^(שורה תחתונה|מה ראיתי|מה לעשות עכשיו|שים לב|המלצה|סיכום):/.test(normalized);
        if (isBullet) {
          return (
            <div key={`${line}-${index}`} className="relative pr-5 text-[14px] text-slate-700">
              <span className="absolute right-0 top-0 text-[#1e40af]">•</span>
              <span>{normalized}</span>
            </div>
          );
        }
        return <p key={`${line}-${index}`} className={`${isHeading ? "font-bold text-slate-950" : "text-slate-700"} whitespace-pre-wrap text-[14px]`}>{normalized}</p>;
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
}: {
  result: AiAssistantResult;
  onAction?: (action: AiSuggestedAction) => void;
  onFeedback?: (helpful: boolean) => void;
  feedback?: boolean | null;
  compact?: boolean;
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
                  {item.source && <p className="mt-1 text-[10px] font-bold opacity-60">מקור: {item.source}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
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

