import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileCheck2, Loader2, Mic, MicOff, ShieldCheck, Sparkles } from "lucide-react";
import { VisitAiSummaryPanel } from "./VisitAiSummaryPanel";
import {
  beginDigitalCareCapture,
  completeDigitalCareTranscription,
  createDigitalCareSummary,
  loadDigitalCareAiStatus,
  uploadDigitalCareAudio,
  type DigitalCareAiStatus,
} from "../../services/digitalCareTranscription";

const MAX_CAPTURE_MS = 15 * 60 * 1000;

export function DigitalCareTranscriptionPanel({
  videoSessionId,
  appointmentId,
}: {
  videoSessionId: number;
  appointmentId: number | null;
}) {
  const [state, setState] = useState<DigitalCareAiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [retainRecording, setRetainRecording] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const uploadRef = useRef<{ path: string; token: string } | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loadDigitalCareAiStatus(videoSessionId);
      setState(next);
      setVisitId(next.session.visit_id || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא ניתן לטעון את מצב התמלול.");
    } finally {
      setLoading(false);
    }
  }, [videoSessionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCapture() {
    if (!state || !appointmentId || !consent || (retainRecording && !recordingConsent)) return;
    setBusy(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm" : "audio/webm";
      const started = await beginDigitalCareCapture({
        videoSessionId,
        appointmentId,
        noticeVersion: state.noticeVersion,
        transcriptionConsent: true,
        retainRecording,
        recordingConsent,
        mimeType: preferredMime,
      });
      streamRef.current = stream;
      uploadRef.current = started.upload;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 64_000 });
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => { setError("הקלטת השמע נכשלה. שיחת הווידאו ממשיכה כרגיל."); setActive(false); };
      recorderRef.current = recorder;
      recorder.start(1_000);
      setActive(true);
      stopTimerRef.current = window.setTimeout(() => { void stopAndTranscribe(); }, MAX_CAPTURE_MS);
      await refresh();
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setError(cause instanceof Error ? cause.message : "לא ניתן להפעיל את המיקרופון.");
    } finally {
      setBusy(false);
    }
  }

  async function stopAndTranscribe() {
    const recorder = recorderRef.current;
    const upload = uploadRef.current;
    if (!recorder || !upload) return;
    setBusy(true);
    setError(null);
    try {
      if (recorder.state !== "inactive") {
        const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
        recorder.stop();
        await stopped;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      setActive(false);
      const audio = new Blob(chunksRef.current, { type: "audio/webm" });
      if (!audio.size) throw new Error("לא נקלט שמע לתמלול. שיחת הווידאו לא הושפעה.");
      await uploadDigitalCareAudio(upload, audio);
      await completeDigitalCareTranscription(videoSessionId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "התמלול לא הושלם.");
    } finally {
      setBusy(false);
      recorderRef.current = null;
      uploadRef.current = null;
      chunksRef.current = [];
    }
  }

  async function generateSummary() {
    setBusy(true);
    setError(null);
    try {
      const result = await createDigitalCareSummary(videoSessionId);
      setVisitId(result.visitId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "טיוטת הסיכום לא נוצרה.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 flex items-center gap-2 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" /> בודק זמינות תמלול מאובטח…</div>;
  if (!state?.flags.transcription) return null;

  const ready = state.session.transcription_status === "ready";
  return (
    <section className="rounded-3xl border border-blue-200 bg-gradient-to-l from-blue-50 via-white to-white p-5 space-y-4" dir="rtl" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-2xl bg-blue-600 text-white flex items-center justify-center"><Sparkles className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-bold text-slate-900">תמלול וסיכום מאובטח</h4>
          <p className="mt-1 text-[12px] leading-5 text-slate-600">התמלול הוא טיוטה אוטומטית. רק וטרינר יכול לערוך ולאשר אותה לתיק הרפואי.</p>
        </div>
        {active && <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-700"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> תמלול פעיל</span>}
      </div>

      {!appointmentId && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-800 flex gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> ניתן להפעיל תמלול רק בשיחת DigitalCare המקושרת לתור וידאו מאומת.</div>}
      {!ready && !active && appointmentId && (
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" />
            <span className="text-[12px] leading-5 text-slate-700"><strong>אישור הסכמה:</strong> המשתתף קיבל הסבר והסכים במפורש לתמלול לצורך הכנת טיוטת סיכום. ניתן להמשיך בשיחה גם ללא הסכמה.</span>
          </label>
          {state.flags.recording && <>
            <label className="flex items-center gap-3 text-[12px] text-slate-700"><input type="checkbox" checked={retainRecording} onChange={(event) => { setRetainRecording(event.target.checked); if (!event.target.checked) setRecordingConsent(false); }} className="h-4 w-4 accent-blue-600" /> שמור גם את קובץ השמע הפרטי לזמן מוגבל</label>
            {retainRecording && <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 cursor-pointer"><input type="checkbox" checked={recordingConsent} onChange={(event) => setRecordingConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span className="text-[12px] leading-5 text-amber-900">המשתתף הסכים במפורש גם לשמירת הקלטה. ברירת המחדל היא מחיקת קובץ השמע לאחר התמלול.</span></label>}
          </>}
          <p className="text-[11px] text-slate-500">בגרסת Preview זו נקלט המיקרופון של המכשיר בלבד; איכות קליטת הצד המרוחק תלויה בהתקן ובדפדפן.</p>
          <button type="button" onClick={() => void startCapture()} disabled={busy || !consent || (retainRecording && !recordingConsent)} className="w-full min-h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2"><Mic className="h-4 w-4" /> התחל תמלול בהסכמה</button>
        </div>
      )}

      {active && <button type="button" onClick={() => void stopAndTranscribe()} disabled={busy} className="w-full min-h-11 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center justify-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicOff className="h-4 w-4" />} עצור והכן תמלול</button>}
      {state.session.transcription_status === "processing" && <div className="rounded-2xl bg-blue-50 p-3 flex items-center gap-2 text-sm text-blue-700"><Loader2 className="h-4 w-4 animate-spin" /> התמלול בעיבוד. שיחת הווידאו ממשיכה ללא הפרעה.</div>}
      {ready && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> נוצר תמלול אוטומטי לא מאושר. הוא אינו מוצג ללקוח.</div>}
      {ready && state.flags.summary && !visitId && <button type="button" onClick={() => void generateSummary()} disabled={busy} className="w-full min-h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} צור טיוטת סיכום לווטרינר</button>}
      {visitId && <div className="space-y-3"><div className="flex items-center gap-2 text-[12px] font-bold text-blue-800"><ShieldCheck className="h-4 w-4" /> עריכה ואישור וטרינר</div><VisitAiSummaryPanel visitId={visitId} /></div>}
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[12px] leading-5 text-red-700 flex gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}</div>}
    </section>
  );
}
