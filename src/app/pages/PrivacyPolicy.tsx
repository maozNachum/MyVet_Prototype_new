import { Link } from "react-router";
import { ArrowRight, Database, Eye, Mail, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { MyVetLogo } from "../components/MyVetLogo";

const sections = [
  {
    icon: Database,
    title: "איזה מידע נאסף ולמה",
    body: "פרטי חשבון וקשר, נתוני תורים ושירות, מידע על בעלי החיים והתיק הווטרינרי, מסמכים ונתוני חיוב — רק לצורך הפעלת המרפאה, מתן השירות, תיעוד הטיפול, אבטחה ועמידה בדין. שדות שאינם מסומנים כחובה נמסרים לפי בחירתך; אי מסירת מידע הכרחי עלולה למנוע ביצוע של אותה פעולה.",
  },
  {
    icon: ShieldCheck,
    title: "צמצום ואבטחת מידע",
    body: "הגישה למידע מוגבלת לפי תפקיד, פעולות רגישות מתועדות, והמערכת נועדה לאסוף ולהציג רק את המידע הדרוש. אין להזין סיסמאות, מספרי כרטיס אשראי מלאים או מידע שאינו נדרש לשירות.",
  },
  {
    icon: UserCheck,
    title: "מסירה לספקים וזכויותיך",
    body: "מידע עשוי להימסר לספקי אחסון, תקשורת ועיבוד הפועלים עבור MyVet ולמטרות השירות בלבד, בכפוף להרשאה ולהתחייבויות מתאימות. ניתן לבקש לעיין במידע אישי או לתקן מידע שגוי, חלקי, לא ברור או לא מעודכן באמצעות כתובת הקשר שלהלן.",
  },
];

export function PrivacyPolicy() {
  return (
    <main id="main-content" tabIndex={-1} dir="rtl" className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 text-slate-900 outline-none" style={{ fontFamily: "'Heebo', sans-serif" }}>
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
          <p className="mt-3 text-[15px] leading-7 text-slate-600">עודכן לאחרונה: 15 ביולי 2026. המדיניות מסבירה כיצד MyVet משתמשת במידע, למי הוא עשוי להימסר ומהן הזכויות שלך.</p>
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
              <h3 className="text-[15px] font-extrabold text-slate-950">מה אינו נשלח למודל</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">המערכת מסירה לפני עיבוד חיצוני שמות בעלים ולקוחות, תעודת זהות, כתובת, טלפון, דוא״ל, פרטי תשלום, קישורים ומזהים פנימיים. הסינון מתבצע שוב בצד השרת.</p>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-950">פעולות יזומות ואישור אנושי</h3>
              <p className="mt-2 text-[13.5px] leading-7 text-slate-600">תדריכים מקומיים נוצרים ללא העברה לספק AI. כלים המחוברים ל־VetBot הם לקריאה בלבד. שליחת הודעה, שינוי רשומה, קביעת טיפול או כל פעולה מהותית דורשים פעולה ואישור מפורשים של המשתמש המורשה.</p>
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

        <section className="mt-6 flex flex-col gap-3 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[17px] font-extrabold text-emerald-950">עיון, תיקון ושאלות פרטיות</h2>
            <p className="mt-1 text-[13px] leading-6 text-emerald-800">בעל השליטה במאגר: MyVet. ניתן לפנות בבקשה לעיון או תיקון; הבקשה תטופל לאחר אימות זהות מתאים.</p>
          </div>
          <a href="mailto:info@myvet.co.il?subject=בקשת%20פרטיות%20-%20MyVet" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-[13px] font-extrabold text-white hover:bg-emerald-800"><Mail className="h-4 w-4" /> info@myvet.co.il</a>
        </section>
      </div>
    </main>
  );
}

