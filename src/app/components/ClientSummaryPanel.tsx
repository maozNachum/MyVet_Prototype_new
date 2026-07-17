import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, Send, Sparkles, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  generateClientSummary, loadClientSummary, startManualClientSummary, transitionClientSummary,
  type ClientSummaryContent, type ClientSummaryState,
} from "../../services/clientSummary";

const fields: Array<{ key: keyof ClientSummaryContent; label: string; protectedFact?: boolean }> = [
  { key: "what_was_found", label: "מה נמצא" },
  { key: "treatment_given", label: "טיפול שניתן", protectedFact: true },
  { key: "medications_and_instructions", label: "תרופות והוראות", protectedFact: true },
  { key: "home_care", label: "טיפול בבית", protectedFact: true },
  { key: "follow_up", label: "המשך מעקב", protectedFact: true },
  { key: "warning_signs", label: "סימנים שמצריכים תשומת לב", protectedFact: true },
  { key: "next_steps", label: "הצעדים הבאים", protectedFact: true },
];
const toLines = (value: string[]) => value.join("\n");
const fromLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 20);

export function ClientSummaryPanel({ visitId }: { visitId: number }) {
  const [state, setState] = useState<ClientSummaryState | null>(null);
  const [draft, setDraft] = useState<ClientSummaryContent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [manualDraft, setManualDraft] = useState(false);

  useEffect(() => {
    let active = true;
    loadClientSummary(visitId).then((next) => {
      if (!active) return;
      setState(next); setDraft(next.editable?.content || null);
      setManualDraft(next.editable?.model_version === "manual");
    }).catch(() => active && setState(null));
    return () => { active = false; };
  }, [visitId]);

  const create = async (manual = false) => {
    setBusy(manual ? "manual" : "generate"); setError("");
    try {
      const next = manual ? await startManualClientSummary(visitId) : await generateClientSummary(visitId);
      setState(next); setDraft(next.editable?.content || null);
      setManualDraft(manual);
      toast.success(manual ? "נפתחה טיוטה ידנית ללקוח" : "טיוטת הסיכום ללקוח מוכנה לבדיקה");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "יצירת הטיוטה נכשלה."); }
    finally { setBusy(null); }
  };

  const transition = async (action: "save" | "approve" | "reject" | "release" | "revoke_release") => {
    const artifact = action === "release" || action === "revoke_release" ? state?.approved : state?.editable;
    if (!artifact) return;
    if (action === "reject" && rejectionReason.trim().length < 2) { setError("יש לכתוב סיבה קצרה לדחיית הטיוטה."); return; }
    setBusy(action); setError("");
    try {
      const next = await transitionClientSummary({
        action, artifactId: artifact.artifact_id,
        content: action === "save" || action === "approve" ? draft || undefined : undefined,
        rejectionReason: action === "reject" ? rejectionReason.trim() : undefined,
      });
      setState(next); setDraft(next.editable?.content || null); setRejecting(false); setRejectionReason("");
      const messages = { save: "הטיוטה נשמרה", approve: "הסיכום אושר", reject: "הטיוטה נדחתה", release: "הסיכום שוחרר לפורטל", revoke_release: "השחרור לפורטל בוטל" };
      toast.success(messages[action]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "הפעולה נכשלה."); }
    finally { setBusy(null); }
  };

  if (!state?.sourceApproved) return null;
  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 space-y-4" aria-label="סיכום פשוט לבעל חיית המחמד">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h5 className="text-[15px] font-extrabold text-slate-900">סיכום ברור ללקוח</h5><p className="text-[12px] text-slate-600 mt-1">נוצר רק מהסיכום הרפואי המאושר. תרופות, מינונים, תאריכים, מעקב ואזהרות נשמרים ללא שינוי.</p></div>
        {state.released ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-bold text-emerald-800">מוצג בפורטל</span> : state.approved ? <span className="rounded-full bg-blue-100 px-3 py-1 text-[12px] font-bold text-blue-800">מאושר — טרם שוחרר</span> : null}
      </div>
      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] font-semibold text-amber-900">{error}</div>}

      {!draft && !state.approved && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void create(false)} disabled={busy !== null} className="h-11 rounded-xl bg-[#1e40af] px-4 text-[13px] font-bold text-white disabled:bg-slate-300 inline-flex items-center gap-2">{busy === "generate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} צור סיכום ללקוח</button>
          <button type="button" onClick={() => void create(true)} disabled={busy !== null} className="h-11 rounded-xl border border-blue-200 bg-white px-4 text-[13px] font-bold text-blue-800 disabled:text-slate-400">התחל טיוטה ידנית</button>
        </div>
      )}

      {draft && state.editable && (
        <div className="space-y-3">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[12px] font-bold text-indigo-800">
            {manualDraft ? "טיוטה ידנית — אינה מוצגת ללקוח עד אישור ושחרור מפורש." : "טיוטה שנוצרה בסיוע AI — אינה מוצגת ללקוח עד אישור ושחרור מפורש."}
          </div>
          {busy && <p role="status" className="text-[12px] font-semibold text-blue-800">הפעולה מתבצעת, נא להמתין…</p>}
          <label className="block"><span className="text-[13px] font-bold text-slate-700">סיבת הביקור</span><textarea value={draft.reason_for_visit} onChange={(event) => setDraft({ ...draft, reason_for_visit: event.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-[14px]" /></label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map((field) => <label key={field.key} className="block"><span className="text-[13px] font-bold text-slate-700">{field.label}</span>{field.protectedFact && <span className="block text-[11px] text-slate-500">יש להשאיר פרטים רפואיים בדיוק כפי שאושרו.</span>}<textarea value={toLines(draft[field.key] as string[])} onChange={(event) => setDraft({ ...draft, [field.key]: fromLines(event.target.value) })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-[14px]" /></label>)}
          </div>
          {rejecting && <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={2} maxLength={500} placeholder="סיבת הדחייה" className="w-full rounded-xl border border-red-200 bg-white p-3 text-[14px]" />}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void transition("save")} disabled={busy !== null} className="h-10 px-4 rounded-xl border border-blue-200 bg-white text-blue-800 text-[13px] font-bold inline-flex items-center gap-2"><Save className="w-4 h-4" /> שמור עריכה</button>
            <button type="button" onClick={() => void transition("approve")} disabled={busy !== null} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-[13px] font-bold inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> אשר סיכום</button>
            <button type="button" onClick={() => rejecting ? void transition("reject") : setRejecting(true)} disabled={busy !== null} className="h-10 px-4 rounded-xl border border-red-200 bg-white text-red-700 text-[13px] font-bold inline-flex items-center gap-2"><XCircle className="w-4 h-4" /> {rejecting ? "אשר דחייה" : "דחה טיוטה"}</button>
          </div>
        </div>
      )}

      {state.approved && (
        <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3">
          <p className="text-[13px] font-bold text-emerald-900">הסיכום נבדק ואושר על ידי וטרינר.</p>
          {state.approved.content.reason_for_visit && <p className="text-[13px] text-slate-700">{state.approved.content.reason_for_visit}</p>}
          <button type="button" onClick={() => void transition(state.released ? "revoke_release" : "release")} disabled={busy !== null} className={`h-10 px-4 rounded-xl text-[13px] font-bold inline-flex items-center gap-2 ${state.released ? "border border-slate-200 bg-white text-slate-700" : "bg-[#1e40af] text-white"}`}>{state.released ? <Undo2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}{state.released ? "בטל שחרור לפורטל" : "שחרר לפורטל הלקוח"}</button>
        </div>
      )}
    </section>
  );
}
