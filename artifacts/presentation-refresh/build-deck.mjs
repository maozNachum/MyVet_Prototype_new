import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "template-starter.pptx";
const output = "../MyVet_Presentation_Updated_HE.pptx";
const deck = await PresentationFile.importPptx(await FileBlob.load(source));

function shape(slideNumber, name) {
  const slide = deck.slides.items[slideNumber - 1];
  const found = slide.shapes.items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name} on slide ${slideNumber}`);
  return found;
}

function setText(slideNumber, name, text, style = {}) {
  const target = shape(slideNumber, name);
  target.text = text;
  target.text.style = {
    alignment: "right",
    autoFit: "shrinkText",
    typeface: "Arial",
    ...style,
  };
  return target;
}

function setNotes(slideNumber, duration, presenter, points) {
  const slide = deck.slides.items[slideNumber - 1];
  slide.speakerNotes.textFrame.setText([
    `זמן מומלץ: ${duration}`,
    `מציג/ה: ${presenter}`,
    ...points,
    "[Sources]",
    "- Internal: MyVet repository, project documentation and supplied source deck",
  ]);
  slide.speakerNotes.setVisible(true);
}

// 1 — title and presenter roles
const titleBox = shape(1, "TextBox 4");
titleBox.frame = { left: 300, top: 500, width: 680, height: 120 };
titleBox.text = [
  [{ run: "מערכת מידע לניהול מרפאה וטרינרית", textStyle: { bold: true, fontSize: "24pt", typeface: "Arial" } }],
  [{ run: "מעוז נחום — אבטחת מידע  |  ניסן קטלן — פיתוח המערכת", textStyle: { fontSize: "17pt", typeface: "Arial" } }],
  [{ run: "פרויקט גמר", textStyle: { fontSize: "14pt", typeface: "Arial", color: "#64748b" } }],
];
titleBox.text.style = { alignment: "center", verticalAlignment: "middle", autoFit: "shrinkText", typeface: "Arial" };
setNotes(1, "1:00", "מעוז וניסן", ["הציגו בקצרה את עצמכם ואת חלוקת התפקידים.", "מעוז מוביל את נושאי האבטחה והפרטיות; ניסן מציג את הפיתוח והזרימות המרכזיות."]);

// 2 — research journey
setText(2, "TextBox 8", "נפגשנו עם וטרינר ואחות וטרינרית בבית החולים ״חוות דעת״ כדי להבין את יום העבודה, העומס והשימוש במערכות המידע.");
setText(2, "TextBox 10", "מהשיחות עלו שלושה צרכים מרכזיים: מידע מפוצל, עומס תפעולי ותקשורת לא רציפה מול בעל חיית המחמד.");
setText(2, "TextBox 12", "תרגמנו את הצרכים למערכת Web אחת: סביבת צוות, פורטל בעלים ונתונים משותפים בזמן אמת.");
setText(2, "TextBox 14", "הצגנו את המערכת שוב למשתמשים וקיבלנו דגשים מעשיים לשיפור חוויית השימוש.");
setNotes(2, "1:30", "ניסן", ["ספרו את הסיפור מהשטח אל הפתרון, בלי להיכנס עדיין לטכנולוגיה."]);

// 3 — systems reviewed, without unsupported market claims
setText(3, "TextBox 5", "ClinicOnline\nמערכת לניהול מרפאה הכוללת תיק רפואי, יומן תורים ותקשורת בסיסית. במסגרת המחקר בחנו את כיסוי התהליכים ואת חוויית העבודה לצוות ולבעלים.", { fontSize: 22, verticalAlignment: "middle" });
setText(3, "TextBox 7", "Provet Cloud\nמערכת SaaS רחבה לניהול מרפאות ובתי חולים וטרינריים. בחנו מולה את היקף הפונקציות, התאמת הממשק לעברית והמורכבות התפעולית.", { fontSize: 22, verticalAlignment: "middle" });
setText(3, "TextBox 13", "מערכות ייחוס שנבחנו");
setNotes(3, "1:10", "ניסן", ["הדגישו שמדובר במערכות ייחוס שנבחנו, לא בדירוג שוק או בטענה מסחרית."]);

// 4 — validated needs and MyVet response
setText(4, "TextBox 4", "הצרכים שזוהו");
setText(4, "TextBox 5", "מידע ותהליכים מפוצלים בין יומן, תיק רפואי, מלאי ותקשורת עם הלקוח.", { fontSize: 20 });
setText(4, "TextBox 6", "שירות לבעלים הנשען לעיתים על שיחות והודעות במקום שירות עצמי מסודר.", { fontSize: 20 });
setText(4, "TextBox 7", "עומס תפעולי שמקשה לאתר במהירות מה דורש טיפול ומהו הצעד הבא.", { fontSize: 20 });
setText(4, "TextBox 8", "המענה של MyVet");
setText(4, "TextBox 9", "מרחב צוות אחיד לניהול תורים, בעלי חיים, תיק רפואי, מלאי ופעילות המרפאה.", { fontSize: 20 });
setText(4, "TextBox 10", "פורטל Web לבעלי חיות המחמד, שתוכנן בגישת Mobile-first ונוח לשימוש מהטלפון.", { fontSize: 20 });
setText(4, "TextBox 11", "VetBot תלוי־הקשר שמציע מידע ופעולות, עם אימות ואישור אנושי לפני ביצוע רגיש.", { fontSize: 20 });
setText(4, "TextBox 14", "מהצורך בשטח למענה אחד");
setNotes(4, "1:30", "ניסן", ["אמרו במפורש: זהו אתר Web, אך פורטל הבעלים תוכנן קודם כול לטלפון."]);

// 5 — goal
setText(5, "TextBox 6", "מערכת מקצועית וקלה לשימוש");
setText(5, "TextBox 7", "לרכז את עבודת המרפאה ואת השירות לבעלים בממשק עברי, ברור ועקבי.");
setText(5, "TextBox 9", "הרשאות לפי תפקיד");
setText(5, "TextBox 10", "להציג לכל משתמש רק את המידע והפעולות המתאימים לתפקידו ולשיוכו.");
setText(5, "TextBox 12", "AI אחראי ומבוקר");
setText(5, "TextBox 13", "להיעזר ב־VetBot לצמצום עומס ולהכנת הצעות, בלי להחליף שיקול דעת ואישור אנושי.");
setText(5, "TextBox 17", "מטרת המערכת");
setNotes(5, "1:20", "ניסן", ["חברו בין שלושת היעדים: יעילות, הרשאות ו-AI מבוקר."]);

// 6 — users, manager marked Admin
setText(6, "TextBox 3", "המערכת משרתת ארבע קבוצות משתמשים מרכזיות:");
setText(6, "TextBox 5", "מנהל/ת המרפאה (Admin): תפעול, דוחות, ניהול צוות ובקרה כוללת.");
setText(6, "TextBox 7", "וטרינר/ית מטפל/ת: תיק רפואי, ביקורים, מעבדה, אשפוזים והחלטות רפואיות.");
setText(6, "TextBox 9", "צוות מסייע ומזכירות: תורים, קבלת קהל, מלאי ושירות שוטף בהתאם להרשאות.");
setText(6, "TextBox 11", "בעלי חיות המחמד: פורטל Mobile-first לתורים, מסמכים ותוכן שאושר ושוחרר עבורם.");
const audienceTitle = setText(6, "TextBox 13", "קהל היעד", { fontSize: 40, verticalAlignment: "middle" });
audienceTitle.frame = { left: 2, top: 82, width: 1218, height: 70 };
setNotes(6, "1:20", "ניסן", ["הבהירו את ההפרדה בין Admin, וטרינר, צוות מסייע ובעלים."]);

// 7 — differentiators, accurately described
setText(7, "TextBox 2", "VetBot: עוזר תלוי־הקשר שמבין עברית, מסייע באיתור מידע ומכין פעולות במערכת. פעולות רגישות מוצגות לאישור לפני ביצוע.", { fontSize: 20 });
setText(7, "TextBox 3", "ניהול מידע קליני: ייבוא וייצוא נתונים בקובצי Excel/CSV עם אימות, הצגת שגיאות ויכולת חזרה בטוחה במקרה הצורך.", { fontSize: 20 });
setText(7, "TextBox 4", "DigitalCare: ניהול פניות דיגיטליות, קבצים, סטטוסים, ארכיון וקישור לשיחת וידאו כחלק מתהליך הטיפול.", { fontSize: 20 });
setText(7, "TextBox 5", "פורטל בעלים: אתר רספונסיבי שתוכנן Mobile-first לקביעת תורים, צפייה במידע ששוחרר ותקשורת דיגיטלית עם המרפאה.", { fontSize: 20 });
setText(7, "TextBox 10", "מה מייחד את MyVet");
setNotes(7, "2:20", "ניסן", ["שלבו כאן הדגמה קצרה של פורטל הבעלים מהטלפון ושל מעבר מפנייה לתיק בעל החיים."]);

setNotes(8, "0:20", "ניסן", ["מעבר קצר לחלק הטכנולוגי."]);

// 9 — larger, shorter text
setText(9, "TextBox 3", "React + TypeScript", { fontSize: 28, bold: true, alignment: "center" });
setText(9, "TextBox 4", "ממשק מודולרי, יציב ונוח לתחזוקה. הטיפוסים מסייעים לשמור על עקביות במודלים רפואיים ותפעוליים.", { fontSize: 23, verticalAlignment: "middle" });
setText(9, "TextBox 5", "Tailwind CSS 4\nתמיכה בעברית, במסכי צוות רחבים ובפורטל שתוכנן קודם כול לטלפון.", { fontSize: 23, verticalAlignment: "middle" });
setText(9, "TextBox 6", "פיתוח, גרסאות ופריסה", { fontSize: 28, bold: true });
setText(9, "TextBox 8", "Git + GitHub\nניהול ענפים והיסטוריית שינויים.\nVite + Vercel + Supabase\nבנייה, פריסה ושירותי צד שרת.", { fontSize: 23, verticalAlignment: "middle" });
setText(9, "TextBox 10", "סביבת הפיתוח בצד הלקוח");
setNotes(9, "1:30", "ניסן", ["הציגו את הבחירות הטכנולוגיות דרך הערך שלהן למערכת, לא כרשימת שמות בלבד."]);

// 10 — backend
setText(10, "TextBox 6", "נתונים בזמן אמת");
setText(10, "TextBox 7", "PostgreSQL + Realtime\nמסד נתונים רלציוני וסנכרון מיידי, כך שהמסכים התפעוליים עובדים מול אותו מקור מידע.", { fontSize: 20 });
setText(10, "TextBox 9", "אימות והרשאות");
setText(10, "TextBox 10", "Supabase Auth + RLS\nהאימות והגישה לנתונים נאכפים גם ברמת מסד הנתונים לפי משתמש, תפקיד ושיוך.", { fontSize: 20 });
setText(10, "TextBox 12", "לוגיקה בצד השרת");
setText(10, "TextBox 13", "Edge Functions + AI Gateway\nקריאות רגישות רצות בשרת. מפתחות ספקים, בחירת מודל והרשאות אינם נחשפים לדפדפן.", { fontSize: 20 });
setText(10, "TextBox 17", "צד השרת והנתונים");
setNotes(10, "1:30", "ניסן", ["הסבירו בקצרה את החלוקה בין Frontend, מסד הנתונים ופונקציות השרת."]);

// 11 — dedicated security slide
setText(11, "TextBox 6", "זהות ובידוד הרשאות");
setText(11, "TextBox 7", "זהות המשתמש, תפקידו והמרפאה שלו נקבעים בצד השרת. RLS מצמצם גישה בין מרפאות ובין בעלים שאינם משויכים לבעל החיים.", { fontSize: 19 });
setText(11, "TextBox 9", "הגנת מידע וקבצים");
setText(11, "TextBox 10", "Secrets נשמרים בצד השרת. קבצים רפואיים מיועדים ל־Storage פרטי עם קישורים חתומים קצרי תוקף וצמצום מידע לפני שליחה ל־AI.", { fontSize: 19 });
setText(11, "TextBox 12", "בקרה וכשל בטוח");
setText(11, "TextBox 13", "קלט ופלט עוברים Validation. יכולות AI ניתנות להשבתה בנפרד, נשמר Audit מצומצם, ותמיד נשאר מסלול עבודה ידני.", { fontSize: 19 });
setText(11, "TextBox 17", "אבטחה ופרטיות במערכת");
setNotes(11, "2:00", "מעוז", ["הציגו את מודל ההגנה בשכבות: זהות, הרשאות, הגנת מידע ובקרה.", "אין לטעון לעמידה משפטית מלאה; יש לציין שהגדרות Retention ובדיקת חדירה הן שלבי Production."]);

// 12 — VetBot without invented model version
setText(12, "TextBox 3", "AI Gateway + Provider Adapters", { alignment: "center" });
setText(12, "TextBox 4", "הבוט מקבל הקשר מאומת מהמסך, מבין בקשה בעברית ומחזיר תשובה או הצעת פעולה מובנית. בחירת הספק והמודל מתבצעת בצד השרת וניתנת להחלפה.", { fontSize: 21 });
setText(12, "TextBox 5", "אישור אנושי לפני ביצוע");
setText(12, "TextBox 6", "לפני שינוי עסקי או רפואי, המערכת מאמתת הרשאות ונתונים ומציגה את הפעולה לאישור. במקרה של כשל נשמר מסלול ידני, ללא שמירה אוטומטית של פלט לא מאושר.", { fontSize: 21 });
setText(12, "TextBox 8", "העוזר החכם של המערכת", { fontSize: 42, verticalAlignment: "middle" });
setNotes(12, "1:45", "מעוז", ["הדגישו שהמודל אינו מקבל שליטה ישירה במסד הנתונים ושאין תלות קשיחה בספק אחד."]);

// 13 — status, no stale test count
setText(13, "TextBox 3", "איכות פיתוח וסטטוס המערכת");
setText(13, "TextBox 5", "בדיקות ורגרסיה\nבפרויקט קיימת חבילת בדיקות רחבה לזרימות הבוט, הרשאות, פרטיות, נגישות ואינטגרציות מסד נתונים.", { fontSize: 22 });
setText(13, "TextBox 7", "ליבת המוצר\nניהול המרפאה, התיק הרפואי ופורטל הבעלים מחוברים למסד הנתונים ומוכנים להצגת דמו מבוקרת.", { fontSize: 22 });
setText(13, "TextBox 8", "יכולות מתקדמות\nיכולות שלא אומתו מול ספק חי נשארות כבויות באמצעות דגלי הפעלה ואינן מוצגות כמוכנות לסביבת ייצור.", { fontSize: 22 });
setNotes(13, "1:10", "מעוז", ["הציגו בכנות מה מוכן לדמו ומה עדיין דורש אימות סביבת Production."]);

// 14 — honest future business direction
setText(14, "TextBox 3", "הכיוון העסקי העתידי", { fontSize: 42, verticalAlignment: "middle" });
setText(14, "TextBox 13", "מנוי למרפאה");
setText(14, "TextBox 14", "הכיוון המוצע הוא מנוי חודשי או שנתי למרפאות ולבתי חולים וטרינריים, לפי גודל המרפאה והמודולים הנבחרים.", { fontSize: 20 });
setText(14, "TextBox 15", "מרכיבי העלות המרכזיים: תשתיות ענן, אחסון, שימוש בשירותי AI, תמיכה, תחזוקה ואבטחת מידע.", { fontSize: 20 });
setText(14, "TextBox 16", "לפני השקה מסחרית נדרש לאמת נכונות לתשלום, לתמחר חבילות ולבחון את עלויות ההפעלה בפועל.", { fontSize: 20 });
setText(14, "TextBox 17", "עלויות ותפעול");
setText(14, "TextBox 18", "אימות המודל העסקי");
setNotes(14, "1:00", "ניסן", ["הציגו זאת ככיוון עתידי ולא כתחזית הכנסות או התחייבות מסחרית."]);

// 15 — close
setText(15, "TextBox 2", "שאלות?");
setText(15, "TextBox 3", "תודה רבה\nMyVet מחברת בין הטיפול, התפעול והשירות לבעלים במערכת אחת.", { alignment: "center", fontSize: 24, verticalAlignment: "middle" });
setNotes(15, "0:15", "מעוז וניסן", ["סיימו במשפט אחד והזמינו שאלות. משך כולל מתוכנן: כ־20 דקות, כולל הדגמה קצרה ומעברים."]);

const file = await PresentationFile.exportPptx(deck);
await file.save(output);
console.log(`saved ${output}; slides=${deck.slides.items.length}`);
