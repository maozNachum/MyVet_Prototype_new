import { useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpenCheck, Database, Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { Link } from "react-router";
import {
  askMedicalRecordRag,
  loadMedicalRecordRagStatus,
  refreshMedicalRecordRag,
  type MedicalRecordRagAnswer,
  type MedicalRecordRagStatus,
} from "../../services/medicalRecordRag";

type Props = { petId: number; petName: string };

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "RAG_UNAVAILABLE";
  if (code.includes("REQUEST_TIMEOUT")) return "החיפוש בתיק לא הספיק להשיב. אפשר לנסות שוב.";
  if (code.includes("FEATURE_DISABLED")) return "החיפוש החכם אינו פעיל כרגע במרפאה.";
  if (code.includes("ACCESS_DENIED")) return "אין לך הרשאה לשאול על התיק הזה.";
  if (code.includes("RATE_LIMITED")) return "נשלחו יותר מדי שאלות. אפשר לנסות שוב בעוד רגע.";
  if (code.includes("REQUEST_BLOCKED")) return "לא ניתן לבצע את הבקשה הזו מטעמי פרטיות ואבטחה.";
  return "לא הצלחנו להשלים את החיפוש בתיק. אפשר לנסות שוב.";
}

function serviceIsUnavailable(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return code.includes("RAG_SERVICE_NOT_DEPLOYED") || code === "RAG_UNAVAILABLE";
}

export function MedicalRecordRagPanel({ petId, petName }: Props) {
  const [status, setStatus] = useState<MedicalRecordRagStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<MedicalRecordRagAnswer | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [isServiceUnavailable, setIsServiceUnavailable] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setIsLoadingStatus(true);
    setStatus(null);
    setError("");
    setAnswer(null);
    setQuestion("");
    setIsAsking(false);
    setIsRefreshing(false);
    setIsServiceUnavailable(false);
    void loadMedicalRecordRagStatus(petId)
      .then((nextStatus) => {
        if (sequence === requestSequence.current) {
          setStatus(nextStatus);
          setIsServiceUnavailable(false);
        }
      })
      .catch((loadError) => {
        if (sequence === requestSequence.current) {
          if (serviceIsUnavailable(loadError)) {
            // The feature is rolled out fail-closed: do not advertise a control whose
            // authenticated server endpoint is not installed or cannot be reached.
            setIsServiceUnavailable(true);
          } else {
            setError(errorMessage(loadError));
          }
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setIsLoadingStatus(false);
      });
    return () => { requestSequence.current += 1; };
  }, [petId]);

  if ((isLoadingStatus && !status) || isServiceUnavailable) return null;

  async function handleRefresh() {
    if (!status?.canIndex || isRefreshing) return;
    const sequence = requestSequence.current;
    setIsRefreshing(true);
    setError("");
    try {
      await refreshMedicalRecordRag(petId);
      const nextStatus = await loadMedicalRecordRagStatus(petId);
      if (sequence === requestSequence.current) setStatus(nextStatus);
    } catch (refreshError) {
      if (sequence === requestSequence.current) setError(errorMessage(refreshError));
    } finally {
      if (sequence === requestSequence.current) setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || isAsking || !status?.canQuery) return;
    const sequence = requestSequence.current;
    setIsAsking(true);
    setError("");
    setAnswer(null);
    try {
      const result = await askMedicalRecordRag(petId, normalizedQuestion);
      const nextStatus = await loadMedicalRecordRagStatus(petId);
      if (sequence === requestSequence.current) {
        setAnswer(result);
        setStatus(nextStatus);
      }
    } catch (askError) {
      if (sequence === requestSequence.current) setError(errorMessage(askError));
    } finally {
      if (sequence === requestSequence.current) setIsAsking(false);
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm" dir="rtl" aria-labelledby="medical-record-rag-title">
      <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-5 py-5 text-white sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15" aria-hidden="true">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 id="medical-record-rag-title" className="text-[18px] font-bold">שאלות מתוך התיק הרפואי</h2>
              <p className="mt-1 text-[13px] leading-6 text-blue-100">
                תשובות שמבוססות רק על מקורות מאושרים בתיק של {petName}.
              </p>
            </div>
          </div>
          {status?.canIndex && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isAsking}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-[13px] font-bold text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isRefreshing ? "מעדכן מקורות..." : "עדכון מקורות"}
            </button>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {isLoadingStatus ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-[14px] text-gray-500" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> בודק הרשאות ומקורות...
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor={`medical-record-question-${petId}`} className="block text-[14px] font-bold text-gray-800">
                מה תרצה לדעת מההיסטוריה הרפואית?
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <textarea
                  id={`medical-record-question-${petId}`}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value.slice(0, 1_200))}
                  disabled={!status?.canQuery || isAsking}
                  rows={3}
                  placeholder="לדוגמה: אילו חיסונים ניתנו ומתי החיסון הבא?"
                  className="min-h-24 flex-1 resize-y rounded-xl border border-gray-200 bg-blue-50/30 px-4 py-3 text-[15px] leading-6 text-gray-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50"
                />
                <button
                  type="submit"
                  disabled={!status?.canQuery || !question.trim() || isAsking}
                  className="inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-xl bg-[#1e40af] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1e3a8a] disabled:cursor-not-allowed disabled:bg-gray-300 sm:self-end"
                >
                  {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isAsking ? "מחפש בתיק..." : "שאל את התיק"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500">
                <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> {status?.indexedChunks || 0} קטעים מאושרים זמינים</span>
                <span>המערכת אינה מאבחנת ואינה משנה את התיק.</span>
              </div>
            </form>

            {!status?.canQuery && !error && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                החיפוש החכם עדיין לא הופעל במרפאה.
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {answer && (
              <div className={`mt-5 rounded-2xl border p-4 sm:p-5 ${answer.status === "conflict" ? "border-amber-200 bg-amber-50/60" : "border-blue-100 bg-blue-50/45"}`} aria-live="polite">
                <div className="flex items-center gap-2 text-[14px] font-bold text-gray-900">
                  <BookOpenCheck className="h-5 w-5 text-blue-700" /> תשובה מבוססת תיק
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-gray-800">{answer.answer}</p>
                {answer.sources.length > 0 && (
                  <div className="mt-4 border-t border-blue-100 pt-4">
                    <p className="mb-2 text-[12px] font-bold text-gray-500">מקורות ששימשו לתשובה</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {answer.sources.map((source, index) => (
                        <li key={`${source.type}-${source.date || "no-date"}-${source.title}-${index}`}>
                          <Link to={source.route} className="block min-h-11 rounded-xl border border-white bg-white px-3 py-2.5 text-[13px] shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                            <span className="font-bold text-blue-800">{source.typeLabel}</span>
                            <span className="mx-1.5 text-gray-300">•</span>
                            <span className="text-gray-700">{source.title}</span>
                            {source.date && <span className="mt-0.5 block text-[12px] text-gray-500">{new Date(`${source.date}T00:00:00`).toLocaleDateString("he-IL")}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
