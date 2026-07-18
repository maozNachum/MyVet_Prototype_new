import { Accessibility, ArrowRight, Eye, Keyboard, Mail, MessageCircleWarning } from "lucide-react";
import { Link } from "react-router";
import { MyVetLogo } from "../components/MyVetLogo";

const accessibilityAdjustments = [
  {
    icon: Keyboard,
    title: "מקלדת ומיקוד",
    body: "הוספנו קישור דילוג לתוכן המרכזי, חיווי מיקוד ברור ותמיכה בהפעלת פעולות מרכזיות באמצעות המקלדת.",
  },
  {
    icon: Eye,
    title: "קריאות ותצוגה",
    body: "המערכת משתמשת בכותרות, תוויות, ניגודיות וריווח עקביים, ומתאימה את הפריסה למסכים ולרמות הגדלה שונות.",
  },
  {
    icon: Accessibility,
    title: "טכנולוגיות מסייעות",
    body: "רכיבים מרכזיים משתמשים במבנה סמנטי, בשמות נגישים ובהודעות מצב שנועדו להיות מובנות גם לקוראי מסך.",
  },
];

export function AccessibilityStatement() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 text-slate-900 outline-none"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <header className="border-b border-blue-100 bg-[#1e40af] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/login" className="inline-flex items-center gap-2 rounded-lg text-[13px] font-bold text-blue-100 hover:text-white focus-visible:outline-none">
            <ArrowRight className="h-4 w-4" aria-hidden="true" /> חזרה ל־MyVet
          </Link>
          <div className="h-14 w-24 text-white">
            <MyVetLogo color="#ffffff" showTagline={false} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-[12px] font-bold text-[#1e40af] shadow-sm">
            <Accessibility className="h-4 w-4" aria-hidden="true" /> נגישות ב־MyVet
          </span>
          <h1 className="mt-4 text-[32px] font-extrabold leading-tight sm:text-[38px]">הצהרת נגישות</h1>
          <p className="mt-3 text-[15px] leading-7 text-slate-600">
            MyVet היא מערכת הדגמה במסגרת פרויקט גמר ואינה שירות רפואי פעיל. אנחנו פועלים לשפר את נגישות המערכת ולאפשר שימוש נוח ככל האפשר גם לאנשים עם מוגבלות.
          </p>
          <p className="mt-2 text-[13px] font-medium text-slate-500">הצהרה זו עודכנה לאחרונה ב־18 ביולי 2026.</p>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3" aria-labelledby="adjustments-title">
          <h2 id="adjustments-title" className="sr-only">התאמות נגישות שבוצעו</h2>
          {accessibilityAdjustments.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#1e40af]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-[17px] font-extrabold">{title}</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50/80 p-6" aria-labelledby="status-title">
          <div className="flex items-start gap-3">
            <MessageCircleWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 id="status-title" className="text-[18px] font-extrabold text-amber-950">מצב הנגישות ומגבלות ידועות</h2>
              <p className="mt-2 text-[13.5px] leading-7 text-amber-900">
                בוצע סבב נגישות בסיסי בקוד, אך המערכת טרם עברה בדיקת התאמה מלאה בידי מורשה נגישות ולכן איננו מצהירים בשלב זה על עמידה מלאה בתקן ישראלי 5568 או ברמת AA. מסכים מורכבים כגון יומן התורים, תרשימים, חלונות דיאלוג ותוכן של שירותים חיצוניים עשויים עדיין לדרוש שיפורים.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 flex flex-col gap-4 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-labelledby="contact-title">
          <div>
            <h2 id="contact-title" className="text-[18px] font-extrabold">דיווח על בעיית נגישות</h2>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-7 text-slate-600">
              אם נתקלתם במחסום, כתבו לנו באיזה עמוד ובאיזו פעולה נתקלתם בבעיה, ובמידת האפשר ציינו דפדפן וטכנולוגיה מסייעת. אין לשלוח בדיווח מידע רפואי או אישי רגיש.
            </p>
          </div>
          <a
            href="mailto:info@myvet.co.il?subject=דיווח%20נגישות%20-%20MyVet"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#1e40af] px-4 py-3 text-[13px] font-extrabold text-white transition-colors hover:bg-[#1e3a8a]"
          >
            <Mail className="h-4 w-4" aria-hidden="true" /> דיווח נגישות
          </a>
        </section>
      </div>
    </main>
  );
}
