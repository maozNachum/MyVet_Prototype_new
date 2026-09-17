import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCircle2, Database, Eye, Loader2, Send, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Footer } from "../components/Footer";
import { MyVetLogo } from "../components/MyVetLogo";
import { supabase } from "../../services/supabaseClient";
import { hasLinkedOwnerProfile, listMyPrivacyRequests, submitPrivacyRequest, type PrivacyRequestSummary, type PrivacyRequestType } from "../../services/privacyRequests";

const requestTypes: Array<{ value: PrivacyRequestType; label: string }> = [
  { value: "access", label: "עיון במידע" },
  { value: "correction", label: "תיקון מידע" },
  { value: "export", label: "ייצוא מידע" },
  { value: "deletion", label: "בקשת מחיקה" },
  { value: "consent_withdrawal", label: "ביטול הסכמה" },
];

const requestStatusLabels: Record<PrivacyRequestSummary["status"], string> = {
  submitted: "התקבלה",
  identity_review: "באימות זהות",
  in_review: "בטיפול",
  completed: "הושלמה",
  rejected: "נסגרה ללא ביצוע",
  cancelled: "בוטלה",
};

const sections = [
  {
    icon: Database,
    title: "איזה מידע נאסף ולמה",
    body: "פרטי חשבון וקשר, נתוני תורים ושירות, מידע על בעלי החיים והתיק הווטרינרי, מסמכים ונתוני חיוב — רק לצורך הפעלת המרפאה, מתן השירות, תיעוד הטיפול, אבטחה ועמידה בדין. שדות שאינם מסומנים כחובה נמסרים לפי בחירתך; אי מסירת מידע הכרחי עלולה למנוע ביצוע של אותה פעולה.",
  },
  {
    icon: ShieldCheck,
    title: "צמצום ואבטחת מידע",
    body: "הגישה למידע מוגבלת לפי תפקיד, פעולות מסוימות מתועדות, והמערכת נועדה לאסוף ולהציג רק את המידע הדרוש. אין להזין סיסמאות, מספרי כרטיס אשראי מלאים או מידע שאינו נדרש לשירות.",
  },
  {
    icon: UserCheck,
    title: "מסירה לספקים וזכויותיך",
    body: "מידע עשוי להימסר לספקי אחסון, תקשורת ועיבוד הפועלים עבור MyVet ולמטרות השירות בלבד, בכפוף להרשאה ולהתחייבויות מתאימות. ניתן לבקש לעיין במידע אישי או לתקן מידע שגוי, חלקי, לא ברור או לא מעודכן באמצעות בקשה מקוונת או פנייה למרפאה.",
  },
];

export function PrivacyPolicy() {
  const [isOwnerSignedIn, setIsOwnerSignedIn] = useState(false);
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [details, setDetails] = useState("");
  const [requests, setRequests] = useState<PrivacyRequestSummary[]>([]);
  const [requestWorkflowAvailable, setRequestWorkflowAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const submissionLock = useRef(false);

  const loadRequests = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError(null);
    setRequests([]);
    setIsOwnerSignedIn(false);
    setRequestWorkflowAvailable(false);
    try {
      const hasOwnerProfile = await hasLinkedOwnerProfile();
      if (generation !== requestGeneration.current) return;
      setIsOwnerSignedIn(hasOwnerProfile);
      if (!hasOwnerProfile) return;
      const existing = await listMyPrivacyRequests();
      if (generation !== requestGeneration.current) return;
      if (existing === null) {
        setLoadError("שליחת בקשות אינה זמינה כרגע. פנו למרפאה בערוץ הקשר המוכר לכם.");
      } else {
        setRequests(existing);
        setRequestWorkflowAvailable(true);
      }
    } catch {
      if (generation === requestGeneration.current) setLoadError("לא הצלחנו לטעון את הבקשות. נסו שוב או פנו למרפאה.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeUserId: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user.id ?? null;
      if (event === "INITIAL_SESSION") { activeUserId = nextUserId; return; }
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_IN" && activeUserId === nextUserId) return;
      activeUserId = nextUserId;
      ++requestGeneration.current;
      setRequests([]);
      setDetails("");
      setMessage(null);
      setError(null);
      setIsOwnerSignedIn(false);
      setRequestWorkflowAvailable(false);
      clearTimeout(timer);
      timer = setTimeout(() => void loadRequests(), 0);
    });
    return () => { ++requestGeneration.current; clearTimeout(timer); subscription.unsubscribe(); };
  }, [loadRequests]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submissionLock.current) return;
    if (requests.some((request) => request.type === requestType && ["submitted", "identity_review", "in_review"].includes(request.status))) {
      setError("כבר קיימת בקשה פתוחה מסוג זה. הפירוט שהקלדתם לא נשלח; לתוספת פרטים פנו למרפאה.");
      setMessage(null);
      return;
    }
    submissionLock.current = true;
    const generation = requestGeneration.current;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const requestId = await submitPrivacyRequest(requestType, details);
      if (generation !== requestGeneration.current) return;
      setMessage("הבקשה התקבלה לבדיקה לאחר אימות זהות. אפשר לעקוב אחר מצבה ברשימה.");
      try {
        const refreshed = await listMyPrivacyRequests();
        if (refreshed && generation === requestGeneration.current) {
          setRequests(refreshed);
          const saved = refreshed.find((request) => request.id === requestId);
          if (saved && saved.details === details.trim()) setDetails("");
          else setMessage("קיימת בקשה פתוחה מסוג זה. הפירוט שהקלדתם נשאר בטופס; ודאו מול המרפאה שהפרטים התקבלו.");
        }
      } catch {
        if (generation === requestGeneration.current) setLoadError("הבקשה נשמרה, אך הרשימה לא התעדכנה. רעננו את הרשימה כדי לראות אותה.");
      }
    } catch (submitError) {
      if (generation === requestGeneration.current) setError(submitError instanceof Error ? submitError.message : "לא הצלחנו לשלוח את הבקשה.");
    } finally {
      setSubmitting(false);
      submissionLock.current = false;
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50 via-white to-slate-50 text-slate-900" style={{ fontFamily: "'Heebo', sans-serif" }}>
    <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
      <header className="border-b border-blue-100 bg-[#1e40af] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-[13px] font-bold text-blue-100 hover:text-white">
            <ArrowRight className="h-4 w-4" /> חזרה ל־MyVet
          </Link>
          <div className="h-14 w-24 text-white"><MyVetLogo color="#ffffff" showTagline={false} /></div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <div className="mb-8 max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-[12px] font-bold text-[#1e40af] shadow-sm"><Eye className="h-4 w-4" /> שקיפות והגנת פרטיות</span>
          <h1 className="mt-4 text-[32px] font-extrabold leading-tight sm:text-[38px]">מדיניות פרטיות ושימוש ב־VetBot</h1>
          <p className="mt-3 text-[15px] leading-7 text-slate-600">עודכן לאחרונה: 17 בספטמבר 2026. המדיניות מסבירה כיצד MyVet משתמשת במידע, למי הוא עשוי להימסר ומהן הזכויות שלך.</p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {sections.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#1e40af]"><Icon className="h-5 w-5" /></div>
              <h2 className="text-[17px] font-extrabold">{title}</h2>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">{body}</p>
            </article>
          ))}
        </section>

        <section id="vetbot" className="mt-6 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm scroll-mt-6">
          <div className="bg-gradient-to-l from-slate-950 to-blue-900 px-6 py-5 text-white">
            <div className="flex items-center gap-3"><Sparkles className="h-5 w-5" /><h2 className="text-[21px] font-extrabold">איך VetBot משתמש במידע</h2></div>
          </div>
          <div className="grid gap-5 p-6 md:grid-cols-2">
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-950">מטרת העיבוד</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">סיוע לצוות בסיכום, תעדוף תפעולי, איתור פרטים חסרים, ניסוח טיוטות והכוונה בתוך המערכת. VetBot אינו מחליף שיקול דעת וטרינרי ואינו מקבל החלטה רפואית סופית.</p>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-950">צמצום מידע לפני עיבוד</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">לפני עיבוד חיצוני מופעלים מנגנונים לצמצום מידע ולסינון מזהים, גם בצד השרת. אין להזין מידע אישי שאינו נדרש; הסינון אינו מבטיח זיהוי של כל פרט אישי בטקסט חופשי או במסמך.</p>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-950">פעולות יזומות ואישור אנושי</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">תדריכים מקומיים נוצרים ללא העברה לספק AI. VetBot יכול להציג מידע ולהכין הצעות לפעולות. שליחת הודעה, שינוי רשומה, קביעת טיפול או כל פעולה מהותית דורשים פעולה ואישור מפורשים של המשתמש המורשה.</p>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-950">עיבוד אצל ספק חיצוני</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">כאשר נדרשת תשובה יצירתית, מידע מצומצם וללא מזהים ישירים עשוי להיות מעובד בשירות ענן חיצוני. MyVet אינה מיועדת לאפשר שימוש במידע זה לאימון מודלים, והתקשרות ייצור תופעל רק לאחר בדיקת תנאי העיבוד, האבטחה והעברת המידע מחוץ לישראל.</p>
            </div>
          </div>
        </section>

        <section id="terms" className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm scroll-mt-6">
          <h2 className="text-[20px] font-extrabold">תנאי שימוש מרכזיים</h2>
          <ul className="mt-3 space-y-2 text-[13.5px] leading-7 text-slate-600">
            <li>• המידע וההמלצות ב־VetBot הם כלי מסייע בלבד ואינם תחליף לבדיקה, אבחון או הנחיה של וטרינר.</li>
            <li>• במקרה חירום אין להמתין לתשובת הבוט; יש לפנות מיד לצוות המרפאה או למוקד חירום וטרינרי.</li>
            <li>• משתמשים מחויבים לפעול בהרשאה, לשמור על סודיות ולא להזין מידע עודף או מידע שאינו נחוץ.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
            <h2 className="text-[17px] font-extrabold text-emerald-950">עיון, תיקון ושאלות פרטיות</h2>
            <p className="mt-1 text-[13px] leading-6 text-emerald-800">ניתן לבקש לעיין במידע, לתקנו, לייצאו או לבחון את מחיקתו. כל בקשה מטופלת לאחר אימות זהות ובכפוף לחובות שמירה החלות על הרשומות.</p>
            </div>
            <p className="text-[13px] leading-6 text-emerald-800">לפנייה ישירה, פנו למרפאה בערוץ הקשר המוכר לכם.</p>
          </div>

          {loading && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-900"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />טוען בקשות...</p>}
          {loadError && <div className="mt-4"><p role="alert" className="text-sm text-red-700">{loadError}</p><button type="button" onClick={() => void loadRequests()} disabled={loading || submitting} className="mt-2 min-h-11 rounded-xl border border-emerald-300 px-4 text-sm font-bold text-emerald-900 disabled:opacity-50">רענון הבקשות</button></div>}
          {!loading && !isOwnerSignedIn && !loadError && <p className="mt-4 text-sm leading-7 text-emerald-900">שליחת בקשה מקוונת זמינה לבעלי חיות עם חשבון מקושר למרפאה. <Link to="/login?role=owner" className="font-bold underline">כניסה לאזור האישי</Link></p>}

          {isOwnerSignedIn && requestWorkflowAvailable && (
            <form onSubmit={handleSubmit} className="mt-5 border-t border-emerald-200 pt-5" aria-label="שליחת בקשת פרטיות">
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <label className="text-[13px] font-bold text-emerald-950">
                  סוג הבקשה
                  <select disabled={submitting} value={requestType} onChange={(event) => setRequestType(event.target.value as PrivacyRequestType)} className="mt-2 min-h-11 w-full rounded-xl border border-emerald-200 bg-white px-3 text-[13px] outline-none focus:ring-2 focus:ring-emerald-500">
                    {requestTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-[13px] font-bold text-emerald-950">
                  פירוט קצר — אין לצרף מידע רפואי או מסמכים
                  <textarea disabled={submitting} value={details} maxLength={1000} onChange={(event) => setDetails(event.target.value)} className="mt-2 min-h-24 w-full resize-y rounded-xl border border-emerald-200 bg-white p-3 text-[13px] outline-none focus:ring-2 focus:ring-emerald-500" placeholder="מה תרצו שנבדוק או נתקן?" />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-5 text-[13px] font-extrabold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? "שולח..." : "שליחת הבקשה"}
                </button>
                {message && <p role="status" className="inline-flex items-center gap-2 text-[13px] font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{message}</p>}
                {error && <p role="alert" className="text-[13px] font-bold text-red-700">{error}</p>}
              </div>
              {requests.length === 0 && <p className="mt-4 text-sm text-emerald-900">אין בקשות קודמות.</p>}
              {requests.length > 0 && (
                <div className="mt-5 rounded-2xl border border-emerald-100 bg-white/80 p-4">
                  <h3 className="text-[13px] font-extrabold text-slate-900">הבקשות האחרונות שלי</h3>
                  <ul className="mt-2 divide-y divide-emerald-100">
                    {requests.map((request) => (
                      <li key={request.id} className="flex items-center justify-between gap-3 py-2 text-[12px] text-slate-600">
                        <span>{requestTypes.find((option) => option.value === request.type)?.label}</span>
                        <span className="font-bold text-emerald-800">{requestStatusLabels[request.status]}</span>
                        <time dateTime={request.submittedAt}>{new Date(request.submittedAt).toLocaleDateString("he-IL")}</time>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
    <Footer />
    </div>
  );
}
