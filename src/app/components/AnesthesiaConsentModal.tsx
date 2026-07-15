import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Tablet, CheckCircle2,
  PenLine, Trash2, ArrowRight, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";

interface AnesthesiaConsentModalProps {
  patientId: number;
  ownerId: string;
  petName?: string;
  ownerName?: string;
  onClose: () => void;
}

type SignMethod = "clinic" | null;
type View = "select" | "form" | "success";

// ─── Signature Canvas ─────────────────────────────────────────────────────────
function SignatureCanvas({ onSignatureChange }: { onSignatureChange: (signature: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if (e instanceof TouchEvent) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e, canvas);
    if (!lastPos.current) { lastPos.current = pos; return; }

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    lastPos.current = pos;
    setIsEmpty(false);
    onSignatureChange(canvas.toDataURL("image/png"));
  }, [onSignatureChange]);

  const stopDrawing = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set internal resolution higher for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseleave", stopDrawing);
    canvas.addEventListener("touchstart", startDrawing, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stopDrawing);

    return () => {
      canvas.removeEventListener("mousedown", startDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDrawing);
      canvas.removeEventListener("mouseleave", stopDrawing);
      canvas.removeEventListener("touchstart", startDrawing);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stopDrawing);
    };
  }, [startDrawing, draw, stopDrawing]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-gray-600 text-[13px]" style={{ fontWeight: 600 }}>
          <PenLine className="w-4 h-4 text-[#1e40af]" />
          חתימת הלקוח
          <span className="text-red-400">*</span>
        </div>
        {!isEmpty && (
          <button
            onClick={clearCanvas}
            className="flex items-center gap-1 text-gray-500 font-medium hover:text-red-500 text-[12px] transition-colors cursor-pointer"
            style={{ fontWeight: 500 }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            נקה חתימה
          </button>
        )}
      </div>

      <div className="relative rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/60 overflow-hidden"
        style={{ height: 160 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          style={{ touchAction: "none" }}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
            <PenLine className="w-8 h-8 text-gray-300" />
            <p className="text-gray-500 font-medium text-[13px]" style={{ fontWeight: 500 }}>
              חתום כאן בעזרת העכבר או האצבע
            </p>
          </div>
        )}
      </div>

      <p className="text-gray-500 font-medium text-[13px]">
        גרור את העכבר (או האצבע על מסך מגע) כדי לחתום
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] || char);
}

export function AnesthesiaConsentModal({
  patientId,
  ownerId,
  petName = "החיה",
  ownerName = "משפחת ישראלי",
  onClose,
}: AnesthesiaConsentModalProps) {
  const [selected, setSelected] = useState<SignMethod>(null);
  const [view, setView] = useState<View>("select");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = new Date().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const handleConfirm = () => {
    if (selected === "clinic") setView("form");
  };

  const handleSubmitForm = async () => {
    if (!signatureData) {
      setSignatureError(true);
      setTimeout(() => setSignatureError(false), 3000);
      return;
    }
    if (!agreedToTerms || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    const safeOwnerId = String(ownerId || "unknown-owner").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = `consents/${safeOwnerId}/${patientId}/${Date.now()}-anesthesia-consent.html`;

    try {
      const safePetName = escapeHtml(petName);
      const safeOwnerName = escapeHtml(ownerName);
      const consentHtml = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>טופס הסכמה להרדמה - ${safePetName}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 28px;color:#172033;line-height:1.75}h1{color:#1e40af}.box{background:#f8fafc;border:1px solid #dbe4f0;border-radius:12px;padding:16px;margin:18px 0}.warning{background:#fffbeb;border-color:#fde68a}img{max-width:420px;border:1px solid #cbd5e1;border-radius:10px;background:white}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}</style></head><body><h1>טופס הסכמה לביצוע הרדמה כללית</h1><div class="box meta"><div><strong>שם החיה:</strong><br>${safePetName}</div><div><strong>בעלים:</strong><br>${safeOwnerName}</div><div><strong>תאריך:</strong><br>${escapeHtml(today)}</div></div><p>אני החתום/ה מטה מאשר/ת לצוות מרפאת MyVet לבצע הרדמה כללית לצורך הטיפול הרפואי הנדרש בחיה המצוינת לעיל.</p><div class="box warning"><strong>סיכונים והסבר רפואי</strong><p>הוסברו לי הסיכונים הכרוכים בהרדמה כללית, לרבות תגובות אלרגיות, הפרעות בקצב הלב, ירידה בלחץ הדם וסיכון נשימתי. ידוע לי כי ייתכנו סיבוכים בלתי צפויים שידרשו טיפול נוסף.</p></div><p>אני מצהיר/ה שמסרתי לצוות מידע מלא על מצב החיה, תרופות, אלרגיות והיסטוריה רפואית, שקיבלתי הזדמנות לשאול שאלות ושניתן לי מענה מספק.</p><p><strong>חתימת הבעלים:</strong></p><img src="${signatureData}" alt="חתימת הבעלים"><p>המסמך נחתם ונשמר במערכת MyVet בתאריך ${escapeHtml(today)}.</p></body></html>`;
      const file = new Blob([consentHtml], { type: "text/html;charset=utf-8" });
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { contentType: "text/html;charset=utf-8", upsert: false });
      if (uploadError) throw uploadError;

      const { error: documentError } = await supabase.from("documents").insert({
        owner_id: ownerId,
        pet_id: patientId,
        visit_id: null,
        file_name: `טופס הסכמה להרדמה - ${petName}.html`,
        file_path: filePath,
        file_url: null,
        mime_type: "text/html",
        file_size: file.size,
        category: "anesthesia_consent",
      });
      if (documentError) {
        await supabase.storage.from("documents").remove([filePath]);
        throw documentError;
      }

      setView("success");
      setTimeout(onClose, 2800);
    } catch (error) {
      console.error("Failed saving anesthesia consent", error);
      setSaveError("לא הצלחנו לשמור את טופס ההסכמה בתיק הרפואי. נסו שוב.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── VIEW: select ─────────────────────────────────────────────────────────
  if (view === "select") {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4"
        style={{ fontFamily: "'Heebo', sans-serif" }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl overflow-hidden"
          style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-7 pt-7 pb-5 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 text-[#1e40af] text-[13px] px-3 py-1 rounded-full border border-blue-100" style={{ fontWeight: 600 }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1e40af] inline-block" />
                    טופס הסכמה להרדמה
                  </span>
                </div>
                <h2 className="text-gray-900 text-[21px] leading-snug" style={{ fontWeight: 700 }}>
                  החתמת טופס הסכמה להרדמה
                </h2>
                <p className="text-gray-500 font-medium text-[13.5px] mt-1.5" style={{ lineHeight: 1.55 }}>
                  פתחו טופס מאובטח לחתימה ושמירה בתיק הרפואי של{" "}
                  <span className="text-gray-600" style={{ fontWeight: 600 }}>{petName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור חלון"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer shrink-0 mr-1 -mt-1"
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="px-7 py-6">
            {/* Card 1 — Clinic */}
            <button
              onClick={() => setSelected("clinic")}
              className={`relative group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 p-6 transition-all duration-200 cursor-pointer ${
                selected === "clinic"
                  ? "border-emerald-500 bg-emerald-50/60 shadow-md shadow-emerald-500/10"
                  : "border-gray-200 bg-gray-50/70 hover:border-emerald-400 hover:bg-emerald-50/30 hover:shadow-sm"
              }`}
              style={{ minHeight: 210 }}
            >
              {selected === "clinic" && (
                <span className="absolute top-3 left-3 text-emerald-500">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
              )}
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
                selected === "clinic" ? "bg-emerald-100" : "bg-white shadow-sm border border-gray-100 group-hover:bg-emerald-50"
              }`}>
                <Tablet className={`w-8 h-8 transition-colors ${selected === "clinic" ? "text-emerald-600" : "text-gray-500 font-medium group-hover:text-emerald-500"}`} />
              </div>
              <div className="text-center">
                <p className={`text-[15px] mb-1.5 ${selected === "clinic" ? "text-emerald-800" : "text-gray-800"}`} style={{ fontWeight: 700 }}>
                  החתמה על מסך זה
                </p>
                <p className={`text-[12px] leading-relaxed ${selected === "clinic" ? "text-emerald-700/70" : "text-gray-500 font-medium"}`}>
                  פתח את הטופס כעת על גבי המסך/טאבלט להחתמת הלקוח במקום
                </p>
              </div>
              <span className={`text-[13px] px-3 py-1 rounded-full ${
                selected === "clinic" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"
              }`} style={{ fontWeight: 600 }}>
                החתמה במרפאה
              </span>
            </button>

          </div>

          {/* Footer */}
          <div className="px-7 pb-7 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="text-gray-500 font-medium hover:text-gray-600 text-[13px] hover:bg-gray-100 px-4 py-2.5 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-gray-200"
              style={{ fontWeight: 500 }}
            >
              ביטול
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className={`flex items-center gap-2 text-[14px] px-6 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm ${
                selected ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20" : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
              style={{ fontWeight: 600 }}
            >
              {selected === "clinic" ? <><Tablet className="w-4 h-4" />פתח טופס</> : "המשך"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW: form ───────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-[3px] px-4 py-6"
        style={{ fontFamily: "'Heebo', sans-serif" }}
      >
        <div
          className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "94vh", boxShadow: "0 32px 80px rgba(0,0,0,0.18)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Form Header */}
          <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-7 py-5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white text-[18px]" style={{ fontWeight: 700 }}>
                    טופס הסכמה להרדמה כללית
                  </h2>
                  <p className="text-white/70 text-[12px]">MyVet — מרפאה וטרינרית | {today}</p>
                </div>
              </div>
              <button
                onClick={() => setView("select")}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-[12px] transition-colors cursor-pointer bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
                style={{ fontWeight: 500 }}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                חזרה
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">

            {/* Patient info strip */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 grid grid-cols-3 gap-4 text-[13px]">
              {[
                { label: "שם החיה", value: petName },
                { label: "בעלים", value: ownerName },
                { label: "תאריך", value: today },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-blue-400 text-[13px]" style={{ fontWeight: 500 }}>{f.label}</p>
                  <p className="text-blue-900 text-[14px]" style={{ fontWeight: 700 }}>{f.value}</p>
                </div>
              ))}
            </div>

            {/* Consent text */}
            <div className="space-y-4">
              <h3 className="text-gray-900 text-[16px] border-b border-gray-100 pb-2" style={{ fontWeight: 700 }}>
                טופס הסכמה לביצוע הרדמה כללית
              </h3>

              <div className="text-gray-600 text-[13.5px] space-y-3" style={{ lineHeight: 1.75 }}>
                <p>
                  אני הח"מ, <span className="text-gray-900" style={{ fontWeight: 600 }}>{ownerName}</span>,
                  בעלים של החיה <span className="text-gray-900" style={{ fontWeight: 600 }}>{petName}</span>,
                  מאשר/ת בזאת לצוות מרפאת MyVet לבצע הרדמה כללית לצורך ביצוע הטיפול הרפואי הנדרש.
                </p>

                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-amber-800 text-[13px]" style={{ fontWeight: 600 }}>
                    <AlertTriangle className="w-4 h-4 inline-block ml-1 mb-0.5" />
                    סיכונים והסבר רפואי
                  </p>
                  <ul className="mt-2 text-amber-700 text-[12.5px] space-y-1 list-disc list-inside">
                    <li>הוסברו לי הסיכונים הכרוכים בהרדמה כללית, לרבות: תגובות אלרגיות, הפרעות קצב לב, ירידה בלחץ דם וסיכון נשימתי.</li>
                    <li>הובהר לי כי הסיכון לסיבוכים קיים בכל הרדמה, גם בחיות בריאות לכאורה.</li>
                    <li>ידוע לי כי ייתכנו סיבוכים בלתי צפויים שדורשים טיפול נוסף.</li>
                  </ul>
                </div>

                <p>
                  אני מצהיר/ה כי עניתי בכנות על כל שאלות הצוות הרפואי הנוגעות לבריאות החיה, כולל היסטוריה רפואית, תרופות קיימות ובעיות ידועות.
                </p>

                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1.5 text-[12.5px]">
                  <p className="text-gray-700" style={{ fontWeight: 600 }}>הצהרת הבעלים:</p>
                  {[
                    "החיה לא אכלה ולא שתתה לפחות 8 שעות לפני ההרדמה (צום מלא)",
                    "אין לחיה אלרגיות ידועות לתרופות הרדמה",
                    "קיבלתי הסבר מלא אודות הטיפול המתוכנן ומטרותיו",
                    "ניתנה לי הזדמנות לשאול שאלות וקיבלתי מענה מניח את הדעת",
                    "אני מאשר/ת ביצוע פרוצדורות נוספות הנדרשות לשמירת חיי החיה",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-gray-600">{item}</span>
                    </div>
                  ))}
                </div>

                <p className="text-gray-500 text-[12px]">
                  הטופס הוזן ונחתם בתאריך {today} במרפאת MyVet. עותק מהטופס החתום יישמר בתיקו הרפואי של {petName}.
                </p>
              </div>
            </div>

            {/* Agreement checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(event) => setAgreedToTerms(event.target.checked)}
                className="sr-only"
              />
              <div
                aria-hidden="true"
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all cursor-pointer ${
                  agreedToTerms ? "bg-emerald-500 border-emerald-500" : "border-gray-300 group-hover:border-emerald-400"
                }`}
              >
                {agreedToTerms && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <span className="text-gray-600 text-[13px]" style={{ lineHeight: 1.6 }}>
                קראתי, הבנתי ואני מסכים/ה לכל האמור בטופס הסכמה זה, ומאשר/ת ביצוע ההרדמה הכללית
                עבור <span style={{ fontWeight: 600 }}>{petName}</span>.
              </span>
            </label>

            {/* Signature pad */}
            <SignatureCanvas onSignatureChange={setSignatureData} />

            {/* Signature error */}
            {signatureError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-[13px]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                יש לחתום על הטופס לפני האישור
              </div>
            )}
            {saveError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-[13px]" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {saveError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-7 py-5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="text-gray-500 font-medium hover:text-gray-600 text-[13px] px-4 py-2.5 rounded-xl transition-colors cursor-pointer hover:bg-gray-100 border border-transparent hover:border-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontWeight: 500 }}
            >
              ביטול
            </button>
            <button
              onClick={() => void handleSubmitForm()}
              disabled={!agreedToTerms || !signatureData || isSaving}
              className={`flex items-center gap-2 text-[14px] px-7 py-3 rounded-xl transition-all cursor-pointer shadow-md ${
                agreedToTerms && signatureData && !isSaving
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
              style={{ fontWeight: 700 }}
            >
              <ShieldCheck className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              {isSaving ? "שומר בתיק הרפואי..." : "אשר ושמור את הטופס"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── VIEW: success ────────────────────────────────────────────────────────
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden text-center px-10 py-12"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.14)" }}
      >
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <ShieldCheck className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-gray-900 text-[22px] mb-2" style={{ fontWeight: 700 }}>
          הטופס נחתם בהצלחה!
        </h2>
        <p className="text-gray-500 font-medium text-[14px]" style={{ lineHeight: 1.6 }}>
          טופס ההסכמה להרדמה עבור <span className="text-gray-700" style={{ fontWeight: 600 }}>{petName}</span> נחתם
          ונשמר בתיק הרפואי. ניתן להמשיך לטיפול.
        </p>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-emerald-600 text-[13px]">
          <CheckCircle2 className="w-4 h-4" />
          <span style={{ fontWeight: 500 }}>תאריך חתימה: {today}</span>
        </div>
      </div>
    </div>
  );
}
