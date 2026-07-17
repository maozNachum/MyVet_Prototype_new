import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getStaffType } from "../data/staffAuth";
import {
  generateVisitSummary,
  loadVisitSummary,
  transitionVisitSummary,
  type VisitSummaryContent,
  type VisitSummaryState,
} from "../../services/visitSummary";

const arrayFields: Array<{ key: keyof VisitSummaryContent; label: string; placeholder: string }> = [
  { key: "symptoms", label: "תסמינים", placeholder: "כל תסמין בשורה נפרדת" },
  { key: "relevant_history", label: "היסטוריה רלוונטית", placeholder: "רק מידע שתועד בביקור" },
  { key: "examination_findings", label: "ממצאי בדיקה", placeholder: "כל ממצא בשורה נפרדת" },
  { key: "tests", label: "בדיקות", placeholder: "בדיקות ותוצאות שתועדו" },
  { key: "treatments", label: "טיפולים", placeholder: "טיפולים שבוצעו או תועדו" },
  { key: "medications", label: "תרופות", placeholder: "תרופות ומינונים כפי שתועדו בלבד" },
  { key: "follow_up", label: "המשך מעקב", placeholder: "הנחיות מעקב שתועדו" },
  { key: "warnings", label: "אזהרות", placeholder: "אזהרות שתועדו" },
  { key: "unresolved_items", label: "פרטים שדורשים השלמה", placeholder: "מה חסר או לא צוין" },
];

function toLines(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function fromLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 20);
}

function ApprovedSummary({ content }: { content: VisitSummaryContent }) {
  const sections = [
    ["סיבת הביקור", content.chief_complaint ? [content.chief_complaint] : []],
    ["תסמינים", content.symptoms],
    ["ממצאי בדיקה", content.examination_findings],
    ["הערכה קלינית", content.clinical_assessment ? [content.clinical_assessment] : []],
    ["טיפול ותרופות", [...content.treatments, ...content.medications]],
    ["המשך מעקב", content.follow_up],
    ["אזהרות", content.warnings],
  ].filter(([, values]) => (values as string[]).length > 0) as Array<[string, string[]]>;

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      {sections.map(([label, values]) => (
        <div key={label} className="rounded-lg bg-emerald-50/50 p-3">
          <p className="text-[12px] font-bold text-emerald-800 mb-1">{label}</p>
          <div className="text-[13px] text-gray-700 leading-6 whitespace-pre-wrap">{values.join("\n")}</div>
        </div>
      ))}
    </div>
  );
}

export function VisitAiSummaryPanel({ visitId }: { visitId: number }) {
  const [state, setState] = useState<VisitSummaryState | null>(null);
  const [draft, setDraft] = useState<VisitSummaryContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"generate" | "save" | "approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const isVeterinarian = getStaffType() === "vet";

  useEffect(() => {
    if (!isVeterinarian) return;
    let active = true;
    setIsLoading(true);
    loadVisitSummary(visitId)
      .then((next) => {
        if (!active) return;
        setState(next);
        setDraft(next.editable?.content || null);
        setError("");
      })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "לא הצלחנו לטעון את הסיכום."))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [isVeterinarian, visitId]);

  if (!isVeterinarian) return null;

  const generate = async () => {
    setBusyAction("generate");
    setError("");
    try {
      const next = await generateVisitSummary(visitId);
      setState(next);
      setDraft(next.editable?.content || null);
      toast.success(next.reusedDraft ? "הטיוטה הקיימת נטענה" : "טיוטת הסיכום מוכנה לבדיקה");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "יצירת הסיכום נכשלה.");
    } finally {
      setBusyAction(null);
    }
  };

  const transition = async (action: "save" | "approve" | "reject") => {
    if (!state?.editable || !draft) return;
    if (action === "reject" && !rejectionReason.trim()) {
      setError("יש לציין סיבה קצרה לדחיית הטיוטה.");
      return;
    }
    setBusyAction(action);
    setError("");
    try {
      const next = await transitionVisitSummary({
        action,
        artifactId: state.editable.artifact_id,
        content: action === "reject" ? undefined : draft,
        rejectionReason: action === "reject" ? rejectionReason.trim() : undefined,
      });
      setState(next);
      setDraft(next.editable?.content || null);
      setShowReject(false);
      setRejectionReason("");
      toast.success(action === "approve" ? "הסיכום אושר ונוסף לביקור" : action === "reject" ? "הטיוטה נדחתה" : "גרסת העריכה נשמרה");
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "שמירת הסיכום נכשלה.");
    } finally {
      setBusyAction(null);
    }
  };

  const setText = (key: keyof VisitSummaryContent, value: string) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };
  const setList = (key: keyof VisitSummaryContent, value: string) => {
    setDraft((current) => current ? { ...current, [key]: fromLines(value) } : current);
  };

  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-l from-blue-50/80 to-white p-4 md:p-5 space-y-4" aria-label="סיכום ביקור בעזרת VetBot">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></span>
          <div>
            <h4 className="text-gray-900 text-[16px] font-bold">סיכום ביקור עם VetBot</h4>
            <p className="text-gray-600 text-[13px] mt-1 leading-5">הסיכום נוצר כטיוטה בלבד. הוא הופך לחלק מאושר מהביקור רק לאחר בדיקה ואישור שלך.</p>
          </div>
        </div>
        {state?.versionCount ? <span className="px-3 py-1.5 rounded-full bg-white border border-blue-100 text-blue-700 text-[12px] font-bold">{state.versionCount} גרסאות</span> : null}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-blue-700 text-[13px] font-semibold"><Loader2 className="w-4 h-4 animate-spin" /> טוען סיכומים...</div>
      ) : null}

      {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-[13px] font-semibold">{error}</div> : null}

      {state?.approved ? (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-2 text-emerald-800">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div><p className="font-bold text-[14px]">סיכום וטרינר מאושר (גרסה {state.approved.version_number})</p><p className="text-[12px] mt-1">הגרסה המאושרת היא חלק מתצוגת הביקור ואינה נדרסת כאשר יוצרים טיוטה חדשה.</p></div>
          </div>
          <ApprovedSummary content={state.approved.content} />
        </>
      ) : null}

      {!draft && !isLoading ? (
        <button type="button" onClick={() => void generate()} disabled={busyAction !== null} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a] disabled:bg-gray-300 text-[14px] font-bold">
          {busyAction === "generate" ? <Loader2 className="w-4 h-4 animate-spin" /> : state?.rejected || state?.approved ? <RotateCcw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {busyAction === "generate" ? "VetBot יוצר טיוטה..." : state?.rejected || state?.approved ? "צור טיוטה חדשה" : "צור טיוטת סיכום"}
        </button>
      ) : null}

      {draft && state?.editable ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-800 text-[13px] font-bold flex items-center gap-2"><Sparkles className="w-4 h-4" /> טיוטת AI — גרסה {state.editable.version_number}. יש לבדוק ולערוך לפני אישור.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5"><span className="text-[13px] font-bold text-gray-700">סיבת הביקור</span><textarea value={draft.chief_complaint} onChange={(event) => setText("chief_complaint", event.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y" /></label>
            <label className="space-y-1.5"><span className="text-[13px] font-bold text-gray-700">הערכה קלינית</span><textarea value={draft.clinical_assessment} onChange={(event) => setText("clinical_assessment", event.target.value)} rows={3} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y" /></label>
            {arrayFields.map((field) => (
              <label key={field.key} className="space-y-1.5"><span className="text-[13px] font-bold text-gray-700">{field.label}</span><textarea value={toLines(draft[field.key])} onChange={(event) => setList(field.key, event.target.value)} rows={3} placeholder={field.placeholder} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-y" /></label>
            ))}
          </div>

          {showReject ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2"><label className="block text-[13px] font-bold text-red-800">סיבת הדחייה</label><textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} rows={2} className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-red-100" placeholder="מה דורש תיקון לפני יצירת טיוטה חדשה?" /></div>
          ) : null}

          <div className="flex items-center gap-2 flex-wrap border-t border-blue-100 pt-4">
            <button type="button" onClick={() => void transition("save")} disabled={busyAction !== null} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 bg-white text-blue-800 hover:bg-blue-50 disabled:text-gray-400 text-[13px] font-bold">{busyAction === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} שמור טיוטה</button>
            <button type="button" onClick={() => void transition("approve")} disabled={busyAction !== null} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 text-[13px] font-bold">{busyAction === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} אשר סיכום</button>
            <button type="button" onClick={() => showReject ? void transition("reject") : setShowReject(true)} disabled={busyAction !== null} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-gray-400 text-[13px] font-bold">{busyAction === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} {showReject ? "אשר דחייה" : "דחה טיוטה"}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
