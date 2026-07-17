import { useCallback, useEffect, useState } from "react";
import { BellPlus, CalendarClock, CheckCircle2, Loader2, Save, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  generateFollowUpSuggestions,
  loadFollowUpSuggestions,
  startManualFollowUpSuggestion,
  transitionFollowUpSuggestion,
  type FollowUpSuggestionArtifact,
  type FollowUpSuggestionContent,
  type FollowUpSuggestionState,
} from "../../services/followUpSuggestions";

const reminderTypes = [
  { value: "return_visit", label: "ביקורת חוזרת" },
  { value: "future_vaccination", label: "חיסון עתידי" },
  { value: "general_follow_up", label: "מעקב רפואי כללי" },
] as const;

const statusLabels: Record<FollowUpSuggestionArtifact["status"], string> = {
  draft: "טיוטה",
  edited: "נערך",
  approved: "אושר ונוצר",
  rejected: "נדחה",
  superseded: "גרסה קודמת",
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function editableSuggestions(state: FollowUpSuggestionState | null) {
  return (state?.suggestions || []).filter((item) => item.status === "draft" || item.status === "edited");
}

export function FollowUpSuggestionsPanel({ visitId }: { visitId: number }) {
  const [state, setState] = useState<FollowUpSuggestionState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FollowUpSuggestionContent>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const applyState = useCallback((next: FollowUpSuggestionState) => {
    setState(next);
    setDrafts((current) => {
      const updated = { ...current };
      for (const item of editableSuggestions(next)) updated[item.artifact_id] = item.content;
      return updated;
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadFollowUpSuggestions(visitId)
      .then((next) => active && applyState(next))
      .catch(() => active && setState({ suggestions: [] }));
    return () => { active = false; };
  }, [applyState, visitId]);

  const create = async (manual: boolean) => {
    setBusy(manual ? "manual" : "generate");
    setError("");
    try {
      const next = manual
        ? await startManualFollowUpSuggestion(visitId)
        : await generateFollowUpSuggestions(visitId);
      applyState(next);
      toast.success(manual ? "נפתחה הצעת מעקב ידנית" : next.noSuggestions ? "לא נמצאה הנחיית מעקב ברורה בסיכום" : "הצעות המעקב מוכנות לבדיקה");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "יצירת ההצעות נכשלה.");
    } finally {
      setBusy(null);
    }
  };

  const setDraft = (artifactId: string, patch: Partial<FollowUpSuggestionContent>) => {
    setDrafts((current) => ({ ...current, [artifactId]: { ...current[artifactId], ...patch } }));
  };

  const transition = async (item: FollowUpSuggestionArtifact, action: "save" | "approve" | "reject", duplicateConfirmed = false) => {
    const draft = drafts[item.artifact_id];
    if (!draft) return;
    if (action === "approve" && (!draft.scheduled_at || draft.requires_manual_date)) {
      setError("יש לבחור תאריך ושעה לפני אישור התזכורת.");
      return;
    }
    if (action === "reject" && rejectionReason.trim().length < 2) {
      setError("יש לכתוב סיבה קצרה לדחיית ההצעה.");
      return;
    }
    setBusy(`${action}:${item.artifact_id}`);
    setError("");
    try {
      const next = await transitionFollowUpSuggestion({
        action,
        visitId,
        artifactId: item.artifact_id,
        content: action === "reject" ? undefined : draft,
        rejectionReason: action === "reject" ? rejectionReason.trim() : undefined,
        duplicateConfirmed,
      });
      if (next.result?.possible_duplicate) {
        setDuplicateId(item.artifact_id);
        setError("כבר קיימת תזכורת זהה למועד הזה. בדקו אותה לפני יצירת תזכורת נוספת.");
        return;
      }
      setDuplicateId(null);
      setRejectingId(null);
      setRejectionReason("");
      applyState(next);
      toast.success(action === "approve" ? "התזכורת אושרה ונוצרה" : action === "reject" ? "ההצעה נדחתה" : "השינויים נשמרו");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "הפעולה נכשלה.");
    } finally {
      setBusy(null);
    }
  };

  const items = state?.suggestions || [];
  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-l from-blue-50 to-white p-4 space-y-4" aria-label="מעקבים ותזכורות מוצעים">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e40af] text-white"><CalendarClock className="h-5 w-5" /></span>
          <div>
            <h5 className="text-[15px] font-extrabold text-slate-900">מעקבים ותזכורות מוצעים</h5>
            <p className="mt-1 text-[12px] leading-5 text-slate-600">VetBot מציע מתוך הסיכום המאושר בלבד. שום תזכורת לא נוצרת לפני בדיקה ואישור שלך.</p>
          </div>
        </div>
        <span className="rounded-full border border-blue-100 bg-white px-3 py-1 text-[11px] font-bold text-blue-800">מקור: סיכום ביקור מאושר</span>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] font-semibold text-amber-900">{error}</div> : null}

      {items.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void create(false)} disabled={busy !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1e40af] px-4 text-[13px] font-bold text-white disabled:bg-slate-300">
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} צור הצעות מעקב
          </button>
          <button type="button" onClick={() => void create(true)} disabled={busy !== null} className="min-h-11 rounded-xl border border-blue-200 bg-white px-4 text-[13px] font-bold text-blue-800 disabled:text-slate-400">צור מעקב ידני</button>
        </div>
      ) : null}

      {items.map((item) => {
        const draft = drafts[item.artifact_id] || item.content;
        const editable = item.status === "draft" || item.status === "edited";
        const itemBusy = busy?.endsWith(item.artifact_id) ?? false;
        return (
          <article key={item.artifact_id} className="rounded-xl border border-blue-100 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2"><BellPlus className="h-4 w-4 text-blue-700" /><strong className="text-[13px] text-slate-900">{draft.title || "הצעת מעקב"}</strong></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === "approved" ? "bg-emerald-100 text-emerald-800" : item.status === "rejected" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>{statusLabels[item.status]}</span>
            </div>

            {editable ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block"><span className="text-[12px] font-bold text-slate-700">סוג המעקב</span><select value={draft.reminder_type} onChange={(event) => setDraft(item.artifact_id, { reminder_type: event.target.value as FollowUpSuggestionContent["reminder_type"] })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px]">{reminderTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                  <label className="block"><span className="text-[12px] font-bold text-slate-700">כותרת</span><input value={draft.title} onChange={(event) => setDraft(item.artifact_id, { title: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px]" /></label>
                  <label className="block md:col-span-2"><span className="text-[12px] font-bold text-slate-700">תיאור</span><textarea value={draft.description} onChange={(event) => setDraft(item.artifact_id, { description: event.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-[14px]" /></label>
                  <label className="block"><span className="text-[12px] font-bold text-slate-700">תאריך ושעה</span><input type="datetime-local" value={toLocalDateTime(draft.scheduled_at)} onChange={(event) => setDraft(item.artifact_id, { scheduled_at: toIsoDateTime(event.target.value), requires_manual_date: !event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px]" />{draft.requires_manual_date ? <span className="mt-1 block text-[11px] font-semibold text-amber-700">לא נמצא תאריך חד-משמעי; נדרשת בחירה ידנית.</span> : null}</label>
                  <label className="block"><span className="text-[12px] font-bold text-slate-700">יעד התזכורת</span><select value={draft.target_type} onChange={(event) => { const owner = event.target.value === "owner"; setDraft(item.artifact_id, { target_type: owner ? "owner" : "staff", release_to_client: owner }); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px]"><option value="staff">צוות המרפאה</option><option value="owner">בעלים בפורטל</option></select></label>
                </div>

                {rejectingId === item.artifact_id ? <label className="block"><span className="text-[12px] font-bold text-red-700">סיבת הדחייה</span><textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-red-200 p-3 text-[14px]" /></label> : null}
                <div className="flex flex-wrap gap-2 border-t border-blue-50 pt-3">
                  <button type="button" onClick={() => void transition(item, "save")} disabled={busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-[13px] font-bold text-blue-800 disabled:text-slate-400"><Save className="h-4 w-4" /> שמור עריכה</button>
                  <button type="button" onClick={() => void transition(item, "approve", duplicateId === item.artifact_id)} disabled={busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-[13px] font-bold text-white disabled:bg-slate-300">{itemBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{duplicateId === item.artifact_id ? "אשר יצירה נוספת" : "אשר וצור תזכורת"}</button>
                  <button type="button" onClick={() => rejectingId === item.artifact_id ? void transition(item, "reject") : setRejectingId(item.artifact_id)} disabled={busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-[13px] font-bold text-red-700 disabled:text-slate-400"><XCircle className="h-4 w-4" />{rejectingId === item.artifact_id ? "אשר דחייה" : "דחה"}</button>
                </div>
              </>
            ) : <p className="text-[13px] leading-6 text-slate-600">{draft.description}</p>}
          </article>
        );
      })}

      {items.length > 0 && !editableSuggestions(state).length ? <button type="button" onClick={() => void create(true)} disabled={busy !== null} className="min-h-10 rounded-xl border border-blue-200 bg-white px-4 text-[13px] font-bold text-blue-800">צור מעקב ידני נוסף</button> : null}
    </section>
  );
}
