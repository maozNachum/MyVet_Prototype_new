import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { supabase } from "../../services/supabaseClient";
import { requiresStaffMfa } from "../../services/authSecurity";
import { clearStaffSession, type StaffType } from "../data/staffAuth";
import { MyVetLogo } from "../components/MyVetLogo";

type TotpEnrollment = {
  qrCode: string;
  secret: string;
};

const ALLOWED_STAFF_ROLES: StaffType[] = [
  "clinic_admin",
  "vet",
  "nurse",
  "secretary",
];

function mfaErrorMessage(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";

  if (/expired|challenge.*not found/i.test(message)) {
    return "הקוד פג תוקף. הזינו את הקוד העדכני מהיישומון.";
  }
  if (/invalid|incorrect|verify/i.test(message)) {
    return "הקוד אינו תקין. בדקו את הקוד העדכני ונסו שוב.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "בוצעו יותר מדי ניסיונות. המתינו מעט ונסו שוב.";
  }
  return "לא הצלחנו להשלים את האימות. נסו שוב בעוד רגע.";
}

export function StaffMfa() {
  const navigate = useNavigate();
  const [isPreparing, setIsPreparing] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function prepareMfa() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error("NO_SESSION");

        const { data: staffProfile, error: staffError } = await supabase
          .from("staff")
          .select("role, is_active")
          .eq("auth_user_id", authData.user.id)
          .eq("is_active", true)
          .maybeSingle();

        const staffRole = String(staffProfile?.role || "") as StaffType;
        if (
          staffError ||
          !staffProfile ||
          !ALLOWED_STAFF_ROLES.includes(staffRole)
        ) {
          throw new Error("NO_STAFF_ACCESS");
        }

        if (!requiresStaffMfa(staffRole)) {
          navigate("/", { replace: true });
          return;
        }

        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (assurance.currentLevel === "aal2") {
          navigate("/", { replace: true });
          return;
        }

        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const verifiedTotp = factors.totp[0];
        if (verifiedTotp) {
          if (active) setFactorId(verifiedTotp.id);
          return;
        }

        const abandonedTotp = factors.all.filter(
          (factor) => factor.factor_type === "totp" && factor.status === "unverified",
        );
        for (const factor of abandonedTotp) {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (unenrollError) throw unenrollError;
        }

        const { data: enrolled, error: enrollError } =
          await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: "MyVet",
          });
        if (enrollError) throw enrollError;

        if (active) {
          setFactorId(enrolled.id);
          setEnrollment({
            qrCode: enrolled.totp.qr_code,
            secret: enrolled.totp.secret,
          });
        }
      } catch (preparationError) {
        if (!active) return;
        if (
          preparationError instanceof Error &&
          ["NO_SESSION", "NO_STAFF_ACCESS"].includes(preparationError.message)
        ) {
          clearStaffSession();
          navigate("/login", { replace: true });
          return;
        }
        setError(mfaErrorMessage(preparationError));
      } finally {
        if (active) setIsPreparing(false);
      }
    }

    void prepareMfa();
    return () => {
      active = false;
    };
  }, [navigate]);

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("הזינו קוד בן 6 ספרות מהיישומון.");
      return;
    }

    setIsVerifying(true);
    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw verifyError;

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") {
        throw new Error("MFA_LEVEL_NOT_UPDATED");
      }

      navigate("/", { replace: true });
    } catch (verificationError) {
      setError(mfaErrorMessage(verificationError));
    } finally {
      setIsVerifying(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearStaffSession();
    navigate("/login", { replace: true });
  };

  return (
    <main
      dir="rtl"
      className="myvet-app-canvas flex min-h-screen items-center justify-center px-4 py-10"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <section className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-6 shadow-xl shadow-blue-950/10 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <MyVetLogo className="h-11 w-auto" />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1e40af]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">אימות נוסף לצוות</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          להגנת המידע הרפואי, יש להזין קוד מיישומון אימות לפני הכניסה.
        </p>

        {isPreparing ? (
          <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl bg-blue-50 px-4 py-6 text-sm font-semibold text-slate-700">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
            מכין אימות מאובטח...
          </div>
        ) : (
          <form onSubmit={verifyCode} className="mt-6" noValidate>
            {enrollment && (
              <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-center">
                <p className="mb-3 text-sm font-semibold text-slate-800">
                  סרקו את הקוד ב־Google Authenticator, Microsoft Authenticator או יישומון תואם.
                </p>
                <img
                  src={enrollment.qrCode}
                  alt="קוד QR להגדרת אימות דו־שלבי"
                  className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
                />
                <p className="mt-3 text-xs text-slate-600">אם הסריקה אינה זמינה, הזינו את המפתח:</p>
                <code dir="ltr" className="mt-1 block break-all rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                  {enrollment.secret}
                </code>
              </div>
            )}

            <label htmlFor="mfa-code" className="mb-2 block text-sm font-semibold text-slate-800">
              קוד אימות
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="mfa-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "mfa-error" : undefined}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-center text-xl tracking-[0.35em] outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                placeholder="000000"
                autoFocus
              />
            </div>

            {error && (
              <p id="mfa-error" role="alert" className="mt-3 text-sm font-semibold text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isVerifying || isPreparing}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isVerifying && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {isVerifying ? "מאמת..." : "כניסה למערכת"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-100"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          יציאה וחזרה למסך ההתחברות
        </button>
      </section>
    </main>
  );
}
