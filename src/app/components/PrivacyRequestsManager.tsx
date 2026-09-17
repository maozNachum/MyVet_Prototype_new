import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  isPrivacyRequestClosed, listClinicPrivacyRequests, managePrivacyRequest,
  type ManagedPrivacyRequest, type ManagedPrivacyStatus, type PrivacyQueue,
} from "../../services/privacyRequestManagement";
import type { PrivacyRequestStatus, PrivacyRequestType } from "../../services/privacyRequests";

const typeLabels: Record<PrivacyRequestType, string> = {
  access: "עיון במידע", correction: "תיקון מידע", export: "קבלת עותק", deletion: "מחיקת מידע", consent_withdrawal: "ביטול הסכמה",
};
const statusLabels: Record<PrivacyRequestStatus, string> = {
  submitted: "בקשה חדשה", identity_review: "אימות זהות", in_review: "בטיפול", completed: "הטיפול הושלם", rejected: "הבקשה נדחתה", cancelled: "הבקשה בוטלה",
};
const statuses: ManagedPrivacyStatus[] = ["identity_review", "in_review", "completed", "rejected", "cancelled"];
const button = "min-h-11 rounded-xl px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "לא זמין" : new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function PrivacyRequestsManager({ clinicId }: { clinicId: string }) {
  return clinicId ? <PrivacyQueuePanel key={clinicId} clinicId={clinicId} /> : null;
}

function PrivacyQueuePanel({ clinicId }: { clinicId: string }) {
  const titleId = useId();
  const [queue, setQueue] = useState<PrivacyQueue>("open");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [requests, setRequests] = useState<ManagedPrivacyRequest[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [selected, setSelected] = useState<ManagedPrivacyRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const detailRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setSelected(null);
    void listClinicPrivacyRequests(clinicId, queue, page).then((result) => {
      if (!current) return;
      setRequests(result.requests); setHasNext(result.hasNext);
    }).catch(() => {
      if (current) { setRequests([]); setError("לא הצלחנו לטעון את הבקשות. נסו שוב."); }
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [clinicId, queue, page, revision]);
  useEffect(() => { if (selected) detailRef.current?.focus(); }, [selected]);
  function changeQueue(value: PrivacyQueue) { setQueue(value); setPage(0); }
  return (
    <section dir="rtl" aria-labelledby={titleId} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-black text-slate-950">בקשות פרטיות</h2>
        <button type="button" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)} className={`${button} inline-flex items-center gap-2 text-blue-800 hover:bg-blue-50`}><RefreshCw className="h-4 w-4" aria-hidden="true" />רענון</button>
      </div>
      <div className="mt-3 flex gap-2" role="group" aria-label="סינון בקשות">
        {(["open", "closed"] as const).map((value) => <button key={value} type="button" disabled={saving} aria-pressed={queue === value} onClick={() => changeQueue(value)} className={`${button} ${queue === value ? "bg-blue-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{value === "open" ? "פתוחות" : "סגורות"}</button>)}
      </div>
      {loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-slate-600"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />טוען בקשות...</p> : error ? <div className="mt-5"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)} className={`${button} mt-2 bg-blue-50 text-blue-800`}>ניסיון נוסף</button></div> : <>
        {requests.length === 0 ? <p role="status" className="mt-5 text-sm text-slate-600">{page > 0 ? "אין בקשות נוספות בעמוד הזה." : queue === "open" ? "אין בקשות שממתינות לטיפול." : "אין בקשות סגורות."}</p> : <ul className="mt-4 divide-y divide-slate-200">
          {requests.map((request) => <li key={request.id}><button type="button" disabled={saving} aria-expanded={selected?.id === request.id} onClick={() => setSelected(request)} className={`w-full rounded-lg px-3 py-3 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 ${selected?.id === request.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
            <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-slate-900">{typeLabels[request.type] || "בקשת פרטיות"}</span><span className="text-sm text-blue-800">{statusLabels[request.status]}</span></span>
            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span>בעלים: <bdi>{request.ownerId}</bdi></span><span>{dateLabel(request.submittedAt)}</span></span>
          </button></li>)}
        </ul>}
        {(page > 0 || hasNext) && <nav aria-label="עמודי בקשות" className="mt-4 flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={page === 0 || saving} onClick={() => setPage((value) => value - 1)} className={`${button} bg-slate-100 text-slate-700`}>הקודם</button><span className="text-sm text-slate-600">עמוד {page + 1} · עד 20 בקשות</span><button type="button" disabled={!hasNext || saving} onClick={() => setPage((value) => value + 1)} className={`${button} bg-slate-100 text-slate-700`}>הבא</button></nav>}
      </>}
      {!loading && selected && <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 ref={detailRef} tabIndex={-1} className="font-black text-slate-950 focus:outline-none">{typeLabels[selected.type]} — <bdi>{selected.ownerId}</bdi></h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{selected.details || "לא צורף פירוט לבקשה."}</p>
        {isPrivacyRequestClosed(selected.status) ? <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-bold">{statusLabels[selected.status]}{selected.completedAt ? ` · ${dateLabel(selected.completedAt)}` : ""}</p><p className="mt-2 whitespace-pre-wrap break-words leading-6">{selected.resolutionNotes || "לא תועד סיכום טיפול."}</p><p className="mt-2 text-slate-600">הבקשה סגורה ואינה ניתנת לשינוי.</p></div> : <RequestEditor key={selected.id} request={selected} onSaving={setSaving} onSaved={() => { setSelected(null); setRevision((value) => value + 1); }} />}
      </div>}
    </section>
  );
}

function RequestEditor({ request, onSaving, onSaved }: { request: ManagedPrivacyRequest; onSaving: (value: boolean) => void; onSaved: () => void }) {
  const fieldId = useId();
  const [status, setStatus] = useState<ManagedPrivacyStatus>(request.status === "submitted" ? "identity_review" : request.status as ManagedPrivacyStatus);
  const [notes, setNotes] = useState(request.resolutionNotes || "");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [invalidNotes, setInvalidNotes] = useState(false);
  const [invalidConfirmation, setInvalidConfirmation] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const terminal = isPrivacyRequestClosed(status);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current) return;
    setError(""); setInvalidNotes(false); setInvalidConfirmation(false);
    if (notes.trim().length < 10 || notes.trim().length > 2000) { setInvalidNotes(true); notesRef.current?.focus(); return; }
    if (terminal && !confirmed) { setInvalidConfirmation(true); confirmationRef.current?.focus(); return; }
    lock.current = true; setSaving(true); onSaving(true);
    try {
      await managePrivacyRequest(request.id, status, notes);
      if (mounted.current) { onSaving(false); toast.success("הטיפול בבקשה עודכן."); onSaved(); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.name === "PrivacyManagementError" ? cause.message : "לא הצלחנו לשמור את הטיפול. הפרטים נשמרו במסך ואפשר לנסות שוב.");
    } finally {
      lock.current = false;
      if (mounted.current) { setSaving(false); onSaving(false); }
    }
  }
  return <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
    <label className="block text-sm font-bold text-slate-700">מצב הטיפול<select disabled={saving} value={status} onChange={(event) => { setStatus(event.target.value as ManagedPrivacyStatus); setConfirmed(false); setInvalidConfirmation(false); }} className={`${field} min-h-11`}>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
    <label className="block text-sm font-bold text-slate-700" htmlFor={fieldId}>סיכום הטיפול<textarea ref={notesRef} id={fieldId} disabled={saving} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} aria-invalid={invalidNotes} aria-describedby={invalidNotes ? `${fieldId}-error` : undefined} className={field} placeholder="אילו בדיקות ופעולות בוצעו, ומה נמסר לפונה?" /></label>
    {invalidNotes && <p id={`${fieldId}-error`} role="alert" className="text-sm text-red-700">פרטו את הטיפול בבקשה ב־10 עד 2,000 תווים.</p>}
    {terminal && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-slate-800"><p>סגירת הבקשה מתעדת את תוצאת הטיפול בלבד. מחיקה, תיקון או מסירת מידע יש לבצע בנפרד לפני סימון הטיפול כהושלם. לאחר הסגירה לא ניתן לערוך את הבקשה.</p><label className="mt-2 flex min-h-11 cursor-pointer items-start gap-2 py-2"><input ref={confirmationRef} type="checkbox" disabled={saving} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} aria-invalid={invalidConfirmation} aria-describedby={invalidConfirmation ? `${fieldId}-confirmation-error` : undefined} className="mt-1 h-5 w-5 shrink-0 accent-blue-800" /><span>בדקתי את תוצאת הטיפול ואני מאשר/ת לסגור את הבקשה במצב ״{statusLabels[status]}״.</span></label>{invalidConfirmation && <p id={`${fieldId}-confirmation-error`} role="alert" className="text-red-700">יש לאשר את סגירת הבקשה לפני השמירה.</p>}</div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={saving} className={`${button} inline-flex w-full items-center justify-center gap-2 bg-blue-800 text-white hover:bg-blue-900 sm:w-auto`}>{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{saving ? "שומר..." : terminal ? "שמירה וסגירת הבקשה" : "שמירת הטיפול"}</button>
  </form>;
}
