import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Dog,
  Eye,
  EyeOff,
  Heart,
  Lock,
  Phone,
  Pill,
  Shield,
  Stethoscope,
  Syringe,
  User,
} from "lucide-react";
import { MyVetLogo } from "../components/MyVetLogo";
import { supabase } from "../../services/supabaseClient";
import type { StaffType } from "../data/staffAuth";

const heroImage =
  "https://images.unsplash.com/photo-1681779876669-50709aa75025?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMGRvZyUyMGNhdCUyMHRvZ2V0aGVyJTIwc29mdCUyMGxpZ2h0JTIwcG9ydHJhaXR8ZW58MXx8fHwxNzcyNDU2MTg0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

type LoginRole = null | "owner" | "staff";

type FormField =
  | "fullName"
  | "idNumber"
  | "phoneNumber"
  | "email"
  | "password"
  | "confirmPassword"
  | "acceptedTerms"
  | "general";

type FormErrors = Partial<Record<FormField, string>>;

const ISRAELI_ID_REGEX = /^\d{9}$/;
const ISRAELI_PHONE_REGEX = /^05\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
const MIN_PASSWORD_LENGTH = 6;
const TERMS_VERSION = "myvet-owner-portal-v1";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getErrorMessage(error: unknown) {
  const rawMessage =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : "";

  if (/[\u0590-\u05ff]/.test(rawMessage)) return rawMessage;
  if (/already registered|user already exists/i.test(rawMessage)) {
    return "כבר קיים חשבון עבור האימייל הזה. נסו להתחבר או לאפס סיסמה.";
  }
  if (/signup.*disabled/i.test(rawMessage)) {
    return "ההרשמה אינה זמינה כרגע. פנו למרפאה לקבלת עזרה.";
  }
  if (/rate limit|too many requests/i.test(rawMessage)) {
    return "בוצעו יותר מדי ניסיונות הרשמה. המתינו כמה דקות ונסו שוב.";
  }
  if (/invalid.*email|email.*invalid/i.test(rawMessage)) {
    return "כתובת האימייל אינה תקינה. בדקו אותה ונסו שוב.";
  }
  if (/database error saving new user|owner_signup_/i.test(rawMessage)) {
    return "לא ניתן להשלים את ההרשמה. ודאו שתעודת הזהות והאימייל תואמים לפרטי הלקוח במרפאה, או פנו לצוות המרפאה.";
  }

  return "אירעה שגיאה. נסו שוב בעוד רגע.";
}

function getFirstError(errors: FormErrors) {
  return (
    errors.fullName ||
    errors.idNumber ||
    errors.phoneNumber ||
    errors.email ||
    errors.password ||
    errors.confirmPassword ||
    errors.acceptedTerms ||
    errors.general ||
    null
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-[12px] font-semibold text-red-600">{message}</p>
  );
}

function LoginLegalNotice() {
  return (
    <div className="mt-5 text-center text-[12px] leading-6 text-slate-500">
      <p>© {new Date().getFullYear()} MyVet — מערכת הדגמה במסגרת פרויקט גמר</p>
      <nav aria-label="קישורי מידע בכניסה" className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link to="/privacy" className="font-semibold text-[#1e40af] underline-offset-2 hover:underline">פרטיות</Link>
        <Link to="/privacy#terms" className="font-semibold text-[#1e40af] underline-offset-2 hover:underline">תנאי שימוש</Link>
        <Link to="/accessibility" className="font-semibold text-[#1e40af] underline-offset-2 hover:underline">נגישות</Link>
      </nav>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState<LoginRole>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [idNumber, setIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const recoveryRole = searchParams.get("role");
    const recoveryRequested = searchParams.get("mode") === "recovery";

    const openRecoveryForm = () => {
      setRole(recoveryRole === "staff" ? "staff" : "owner");
      setIsSignUp(false);
      setIsPasswordRecovery(true);
      setFormMessage("בחרו סיסמה חדשה לחשבון שלכם.");
      setFormErrors({});
    };

    if (recoveryRequested) openRecoveryForm();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") openRecoveryForm();
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearFieldError = (field: FormField) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const inputClass = (
    field: FormField,
    tone: "owner" | "staff" = role === "staff" ? "staff" : "owner",
  ) => {
    if (formErrors[field]) {
      return "border-red-300 bg-red-50 focus:ring-red-500/20 focus:border-red-400";
    }
    if (tone === "owner")
      return "border-gray-200 focus:ring-rose-500/20 focus:border-rose-300";
    return "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400";
  };

  const resetForm = () => {
    setIdNumber("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setPhoneNumber("");
    setAcceptedTerms(false);
    setFormMessage(null);
    setFormErrors({});
  };

  const validateOwnerSignup = () => {
    const errors: FormErrors = {};
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedId = onlyDigits(idNumber);
    const normalizedPhone = onlyDigits(phoneNumber);

    if (fullName.trim().length < 2)
      errors.fullName = "הזינו שם מלא כדי ליצור חשבון.";
    if (!ISRAELI_ID_REGEX.test(normalizedId))
      errors.idNumber = "תעודת זהות חייבת להכיל בדיוק 9 ספרות.";
    if (!ISRAELI_PHONE_REGEX.test(normalizedPhone))
      errors.phoneNumber = "מספר טלפון חייב להתחיל ב־05 ולהכיל 10 ספרות.";
    if (!EMAIL_REGEX.test(normalizedEmail))
      errors.email = "הזינו כתובת אימייל תקינה.";
    if (!PASSWORD_POLICY_REGEX.test(password)) {
      errors.password = `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים, אות באנגלית ומספר.`;
    }
    if (!confirmPassword)
      errors.confirmPassword = "הזינו שוב את הסיסמה לאימות.";
    else if (password !== confirmPassword)
      errors.confirmPassword = "הסיסמאות לא תואמות. בדקו והזינו שוב.";
    if (!acceptedTerms)
      errors.acceptedTerms =
        "יש לאשר את תנאי השימוש ומדיניות הפרטיות לפני יצירת חשבון.";

    setFormErrors(errors);
    setFormMessage(getFirstError(errors));
    return Object.keys(errors).length === 0;
  };

  const validateLogin = () => {
    const errors: FormErrors = {};
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      errors.email =
        role === "owner"
          ? "הזן/י מייל תקין"
          : "הזינו אימייל צוות תקין.";
    }
    if (!password.trim()) errors.password = "הזינו סיסמה.";

    setFormErrors(errors);
    setFormMessage(getFirstError(errors));
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (
    event?: React.FormEvent | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event?.preventDefault();
    setFormMessage(null);
    setFormErrors({});

    if (!role) {
      setFormErrors({ general: "בחרו סוג כניסה לפני המשך." });
      setFormMessage("בחרו סוג כניסה לפני המשך.");
      return;
    }

    const isValid =
      role === "owner" && isSignUp ? validateOwnerSignup() : validateLogin();
    if (!isValid) return;

    setFormMessage(
      role === "owner" && isSignUp
        ? "בודק את הפרטים ויוצר חשבון..."
        : "בודק פרטי התחברות...",
    );

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedId = onlyDigits(idNumber);
    const normalizedPhone = onlyDigits(phoneNumber);

    try {
      if (role === "owner" && isSignUp) {
        setIsLoading(true);

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/portal`,
            data: {
              role: "owner",
              owner_id: normalizedId,
              full_name: fullName.trim(),
              phone: normalizedPhone,
              terms_version: TERMS_VERSION,
            },
          },
        });

        if (error) throw error;
        if (!data.user) throw new Error("המשתמש לא נוצר במערכת האימות.");

        if (
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        ) {
          throw new Error(
            "כבר קיים חשבון עבור האימייל הזה. נסו להתחבר או לאפס סיסמה.",
          );
        }

        if (data.session) {
          const { data: createdOwner, error: createdOwnerError } = await supabase
            .from("owners")
            .select("owner_id")
            .eq("auth_user_id", data.user.id)
            .maybeSingle();

          if (createdOwnerError || !createdOwner) {
            throw new Error(
              "החשבון נוצר, אך פרופיל הלקוח לא הושלם. פנו למרפאה לפני ניסיון נוסף.",
            );
          }

          setFormMessage("החשבון נוצר בהצלחה! מעביר אותך לאזור האישי...");
          setTimeout(() => navigate("/portal"), 900);
        } else {
          setFormMessage(
            "החשבון נוצר. אם נשלח אליכם מייל אימות, אשרו אותו ואז התחברו לאזור האישי.",
          );
          setIsSignUp(false);
          setPassword("");
          setConfirmPassword("");
          setAcceptedTerms(false);
          setFormErrors({});
        }
        return;
      }

      setIsLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw new Error("פרטי ההתחברות שגויים או שהמשתמש אינו קיים.");
      if (!data.user) throw new Error("שגיאה בתהליך ההתחברות.");

      if (role === "owner") {
        const { data: ownerByAuth, error: ownerByAuthError } = await supabase
          .from("owners")
          .select("owner_id, auth_user_id, email")
          .eq("auth_user_id", data.user.id)
          .maybeSingle();

        if (ownerByAuthError) throw ownerByAuthError;

        if (!ownerByAuth) {
          const { data: claimedOwnerId, error: claimOwnerError } =
            await supabase.rpc("claim_owner_profile");

          if (claimOwnerError) throw claimOwnerError;

          if (!claimedOwnerId) {
            await supabase.auth.signOut();
            throw new Error(
              "לא נמצא אזור אישי שמחובר לחשבון הזה. פנו למרפאה לחיבור החשבון.",
            );
          }

          const { data: claimedOwner, error: claimedOwnerError } = await supabase
            .from("owners")
            .select("owner_id, auth_user_id, email")
            .eq("auth_user_id", data.user.id)
            .maybeSingle();

          if (claimedOwnerError) throw claimedOwnerError;
          if (!claimedOwner) throw new Error("פרופיל הלקוח לא קושר לחשבון.");
        }

        navigate("/portal");
        return;
      }

      const { data: ownerCheck, error: ownerCheckError } = await supabase
        .from("owners")
        .select("owner_id")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (ownerCheckError) throw ownerCheckError;

      if (ownerCheck) {
        await supabase.auth.signOut();
        throw new Error("חשבון זה מוגדר כלקוח. התחברו דרך האזור האישי.");
      }

      const { data: staffProfile, error: staffProfileError } = await supabase
        .from("staff")
        .select("staff_id, auth_user_id, email, full_name, role, is_active")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (staffProfileError) throw staffProfileError;

      if (!staffProfile) {
        await supabase.auth.signOut();
        throw new Error(
          "החשבון התחבר, אבל לא נמצא כמשתמש צוות פעיל. פנו למנהל המרפאה.",
        );
      }

      if (staffProfile.is_active !== true) {
        await supabase.auth.signOut();
        throw new Error("משתמש הצוות הזה אינו פעיל. פנו למנהל המרפאה.");
      }

      const staffRole = String(staffProfile.role || "").trim() as StaffType;
      const allowedRoles: StaffType[] = [
        "clinic_admin",
        "vet",
        "nurse",
        "secretary",
      ];

      if (!allowedRoles.includes(staffRole)) {
        await supabase.auth.signOut();
        throw new Error("לתפקיד המשתמש אין הרשאה להיכנס לממשק הצוות.");
      }

      localStorage.setItem("myvet_staff_type", staffRole);
      localStorage.setItem(
        "myvet_staff_name",
        staffProfile.full_name || "צוות מרפאה",
      );
      localStorage.setItem(
        "myvet_staff_email",
        staffProfile.email || normalizedEmail,
      );
      localStorage.setItem("myvet_staff_id", staffProfile.staff_id || "");

      navigate("/");
    } catch (error) {
      const message = getErrorMessage(error);
      setFormErrors((prev) => ({ ...prev, general: message }));
      setFormMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setFormMessage(null);
    setFormErrors({});

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      const message = "הזינו כתובת אימייל תקינה כדי לקבל קישור לאיפוס סיסמה.";
      setFormErrors({ email: message });
      setFormMessage(message);
      return;
    }

    setIsSendingPasswordReset(true);
    setFormMessage("שולח קישור מאובטח לאיפוס הסיסמה...");

    try {
      const recoveryRole = role === "staff" ? "staff" : "owner";
      const redirectTo = `${window.location.origin}/login?mode=recovery&role=${recoveryRole}`;
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo },
      );

      if (error) throw error;

      setFormMessage(
        "אם קיים חשבון עבור הכתובת הזו, יישלח אליה קישור לאיפוס הסיסמה. בדקו גם בתיקיית הספאם.",
      );
    } catch (error) {
      console.error("Failed to request password reset", error);
      const message =
        "לא הצלחנו לשלוח כרגע קישור לאיפוס סיסמה. נסו שוב בעוד כמה דקות.";
      setFormErrors({ general: message });
      setFormMessage(message);
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const handlePasswordRecovery = async (
    event?: React.FormEvent | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event?.preventDefault();
    const errors: FormErrors = {};

    if (!PASSWORD_POLICY_REGEX.test(password)) {
      errors.password = `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים, אות באנגלית ומספר.`;
    }
    if (!confirmPassword) {
      errors.confirmPassword = "הזינו שוב את הסיסמה לאימות.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "הסיסמאות לא תואמות. בדקו והזינו שוב.";
    }

    setFormErrors(errors);
    setFormMessage(getFirstError(errors));
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    setFormMessage("מעדכן את הסיסמה...");

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      window.history.replaceState({}, "", window.location.pathname);
      setPassword("");
      setConfirmPassword("");
      setFormErrors({});
      setIsPasswordRecovery(false);
      setFormMessage("הסיסמה עודכנה בהצלחה. אפשר להתחבר כעת עם הסיסמה החדשה.");
    } catch (error) {
      console.error("Failed to update recovered password", error);
      const message =
        "לא הצלחנו לעדכן את הסיסמה. ייתכן שהקישור פג תוקף; בקשו קישור חדש ונסו שוב.";
      setFormErrors({ general: message });
      setFormMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const leavePasswordRecovery = async () => {
    await supabase.auth.signOut();
    window.history.replaceState({}, "", window.location.pathname);
    setIsPasswordRecovery(false);
    setPassword("");
    setConfirmPassword("");
    setFormErrors({});
    setFormMessage(null);
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden h-screen sticky top-0">
        <img
          src={heroImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#1e40af]/60 via-[#1e40af]/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/50 via-transparent to-transparent" />
        <div className="relative z-100 flex flex-col justify-end p-12 pb-16 text-white">
          <div className="max-w-md">
            <div className="bg-white/20 backdrop-blur-md rounded-xl p-2.5 border border-white/20 inline-flex">
              <MyVetLogo color="white" className="w-85 h-60" />
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" tabIndex={-1} className="flex-1 flex items-center justify-center bg-[radial-gradient(circle_at_85%_10%,rgba(59,130,246,0.12),transparent_34%),linear-gradient(180deg,#f7faff_0%,#ffffff_100%)] px-4 py-5 outline-none sm:px-6 lg:h-screen lg:overflow-y-auto lg:py-4">
        <div
          className={`w-full transition-[max-width] duration-300 ${
            role === null ? "max-w-[520px]" : "max-w-[440px]"
          }`}
        >
          <div className={`flex items-center justify-center gap-2.5 ${role === null ? "mb-6" : "mb-3"}`}>
            <div className="bg-[#1e40af] rounded-xl p-2 shadow-lg shadow-blue-500/20">
              <MyVetLogo color="white" className="w-48 h-26" />
            </div>
          </div>

          {role === null && (
            <div>
              <div className="text-center mb-4">
                <h1
                  className="text-gray-900 text-[24px] mb-1.5"
                  style={{ fontWeight: 700 }}
                >
                  ברוכים הבאים
                </h1>
                <p className="text-gray-500 font-medium text-[14px]">
                  בחרו את סוג הכניסה שלכם
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setRole("owner");
                    setIsSignUp(false);
                    resetForm();
                  }}
                  className="group relative bg-white border-2 border-gray-100 hover:border-rose-300 rounded-2xl p-4 pt-5 transition-all cursor-pointer hover:shadow-lg hover:shadow-rose-500/10 text-center overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-l from-pink-400 to-rose-500 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-100 group-hover:from-rose-100 group-hover:to-pink-200 flex items-center justify-center transition-colors shadow-sm mx-auto mb-4">
                    <Heart className="w-8 h-8 text-rose-500" />
                  </div>
                  <h3
                    className="text-gray-900 text-[18px] mb-1.5"
                    style={{ fontWeight: 700 }}
                  >
                    אזור אישי
                  </h3>
                  <div className="space-y-1.5 mt-2.5">
                    <div className="flex items-center gap-2 text-[12px] text-gray-500">
                      <div className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center shrink-0">
                        <Dog className="w-3 h-3 text-rose-400" />
                      </div>
                      <span>צפייה בתיקים רפואיים</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-gray-500">
                      <div className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center shrink-0">
                        <CalendarCheck className="w-3 h-3 text-rose-400" />
                      </div>
                      <span>קביעת תורים ותזכורות</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-gray-500">
                      <div className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center shrink-0">
                        <Syringe className="w-3 h-3 text-rose-400" />
                      </div>
                      <span>מעקב חיסונים וטיפולים</span>
                    </div>
                  </div>
                  <div
                    className="mt-4 bg-gradient-to-l from-pink-500 to-rose-500 text-white text-[13px] py-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2"
                    style={{ fontWeight: 600 }}
                  >
                    כניסה כבעלים <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                  <div
                    className="mt-4 bg-gray-50 text-gray-500 font-medium text-[13px] py-2.5 rounded-xl group-hover:hidden flex items-center justify-center gap-2"
                    style={{ fontWeight: 500 }}
                  >
                    בחרו כניסה זו
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRole("staff");
                    setIsSignUp(false);
                    resetForm();
                  }}
                  className="group relative bg-white border-2 border-gray-100 hover:border-blue-300 rounded-2xl p-4 pt-5 transition-all cursor-pointer hover:shadow-lg hover:shadow-blue-500/10 text-center overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-l from-blue-500 to-indigo-600 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 group-hover:from-blue-100 group-hover:to-indigo-200 flex items-center justify-center transition-colors shadow-sm mx-auto mb-4">
                    <Stethoscope className="w-8 h-8 text-[#1e40af]" />
                  </div>
                  <h3
                    className="text-gray-900 text-[18px] mb-1.5"
                    style={{ fontWeight: 700 }}
                  >
                    צוות מרפאה
                  </h3>
                  <div className="space-y-1.5 mt-2.5">
                    <div className="flex items-center gap-2 text-[12px] text-gray-500">
                      <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                        <ClipboardList className="w-3 h-3 text-blue-500" />
                      </div>
                      <span>לוח בקרה וניהול תורים</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-gray-500">
                      <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                        <Shield className="w-3 h-3 text-blue-500" />
                      </div>
                      <span>ניהול מטופלים ותיקים</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-gray-500">
                      <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
                        <Pill className="w-3 h-3 text-blue-500" />
                      </div>
                      <span>מלאי, מרשמים ודוחות</span>
                    </div>
                  </div>
                  <div
                    className="mt-4 bg-gradient-to-l from-[#1e40af] to-indigo-600 text-white text-[13px] py-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2"
                    style={{ fontWeight: 600 }}
                  >
                    כניסה כצוות <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                  <div
                    className="mt-4 bg-gray-50 text-gray-500 font-medium text-[13px] py-2.5 rounded-xl group-hover:hidden flex items-center justify-center gap-2"
                    style={{ fontWeight: 500 }}
                  >
                    בחרו כניסה זו
                  </div>
                </button>
              </div>

              <LoginLegalNotice />
            </div>
          )}

          {role !== null && (
            <div
              className={`rounded-2xl shadow-sm border-2 p-5 sm:p-6 transition-all ${role === "owner" ? "bg-white border-rose-100" : "bg-white border-blue-100"}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (isPasswordRecovery) {
                    void leavePasswordRecovery();
                    return;
                  }
                  setRole(null);
                  setIsSignUp(false);
                  resetForm();
                }}
                className="flex items-center gap-1.5 text-gray-500 font-medium hover:text-gray-600 text-[13px] mb-4 cursor-pointer transition-colors"
                style={{ fontWeight: 500 }}
              >
                <ArrowRight className="w-4 h-4" />
                {isPasswordRecovery
                  ? "חזרה למסך הכניסה"
                  : "חזרה לבחירת סוג כניסה"}
              </button>

              <div className="text-center mb-5">
                <div
                  className={`w-12 h-12 rounded-xl mx-auto mb-2.5 flex items-center justify-center shadow-sm ${role === "owner" ? "bg-gradient-to-br from-rose-50 to-pink-100" : "bg-gradient-to-br from-blue-50 to-indigo-100"}`}
                >
                  {role === "owner" ? (
                    <Heart className="w-6 h-6 text-rose-500" />
                  ) : (
                    <Stethoscope className="w-6 h-6 text-[#1e40af]" />
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] border ${role === "owner" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-blue-50 text-[#1e40af] border-blue-200"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {role === "owner" ? (
                      <>
                        <Heart className="w-3 h-3" /> אזור אישי
                      </>
                    ) : (
                      <>
                        <Stethoscope className="w-3 h-3" /> אזור צוות מרפאה
                      </>
                    )}
                  </span>
                </div>

                <h1
                  className="text-gray-900 text-[21px] mb-1"
                  style={{ fontWeight: 700 }}
                >
                  {isPasswordRecovery
                    ? "יצירת סיסמה חדשה"
                    : role === "owner"
                    ? isSignUp
                      ? "פתיחת חשבון לקוח"
                      : "שלום, אזור אישי"
                    : "שלום, צוות המרפאה"}
                </h1>
                <p className="text-gray-500 font-medium text-[14px]">
                  {isPasswordRecovery
                    ? "הזינו סיסמה חדשה שתשמש אתכם בכניסה הבאה"
                    : role === "owner"
                    ? isSignUp
                      ? "צרו חשבון חדש לניהול התיק הרפואי והתורים"
                      : "התחברו כדי לצפות בתיק הרפואי ובתורים"
                    : "התחברו כדי לגשת ללוח הבקרה"}
                </p>

                {formMessage && (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-[13px] font-semibold leading-6 ${getFirstError(formErrors) ? "border-red-200 bg-red-50 text-red-700" : "border-blue-100 bg-blue-50 text-[#1e40af]"}`}
                  >
                    {formMessage}
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (isPasswordRecovery) {
                    void handlePasswordRecovery(event);
                    return;
                  }
                  void handleLogin(event);
                }}
                noValidate
                className="space-y-4"
              >
                {role === "staff" && !isPasswordRecovery && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2.5 text-right">
                    <div className="flex items-start gap-3">
                      <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#1e40af]" />
                      <div>
                        <p className="text-[13px] font-bold text-[#1e40af]">
                          ההרשאה נקבעת לפי משתמש הצוות במערכת
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium leading-5 text-slate-600">
                          הזינו אימייל וסיסמה שקיבלתם ממנהל המרפאה. לאחר
                          ההתחברות המערכת תזהה אוטומטית אם אתם מנהל מרפאה,
                          וטרינר, אחות או מזכירות.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {role === "owner" && isSignUp && (
                  <>
                    <div>
                      <label
                        htmlFor="fullName"
                        className="block text-gray-600 text-[13px] mb-2"
                        style={{ fontWeight: 500 }}
                      >
                        שם מלא
                      </label>
                      <div className="relative">
                        <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                        <input
                          type="text"
                          id="fullName"
                        value={fullName}
                        aria-invalid={Boolean(formErrors.fullName)}
                        aria-describedby={formErrors.fullName ? "fullName-error" : undefined}
                          onChange={(event) => {
                            setFullName(event.target.value);
                            clearFieldError("fullName");
                          }}
                          className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("fullName")}`}
                          placeholder="הזינו שם מלא"
                        />
                      </div>
                      <ErrorText id="fullName-error" message={formErrors.fullName} />
                    </div>

                    <div>
                      <label
                        htmlFor="idNumber"
                        className="block text-gray-600 text-[13px] mb-2"
                        style={{ fontWeight: 500 }}
                      >
                        תעודת זהות
                      </label>
                      <div className="relative">
                        <Shield className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                        <input
                          type="text"
                          inputMode="numeric"
                          id="idNumber"
                          value={idNumber}
                          aria-invalid={Boolean(formErrors.idNumber)}
                          aria-describedby={formErrors.idNumber ? "idNumber-error" : undefined}
                          onChange={(event) => {
                            setIdNumber(
                              onlyDigits(event.target.value).slice(0, 9),
                            );
                            clearFieldError("idNumber");
                          }}
                          className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("idNumber")}`}
                          placeholder="הזינו תעודת זהות"
                        />
                      </div>
                      <ErrorText id="idNumber-error" message={formErrors.idNumber} />
                    </div>

                    <div>
                      <label
                        htmlFor="phone"
                        className="block text-gray-600 text-[13px] mb-2"
                        style={{ fontWeight: 500 }}
                      >
                        מספר טלפון
                      </label>
                      <div className="relative">
                        <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                        <input
                          type="tel"
                          inputMode="tel"
                          id="phone"
                          value={phoneNumber}
                          aria-invalid={Boolean(formErrors.phoneNumber)}
                          aria-describedby={formErrors.phoneNumber ? "phone-error" : undefined}
                          onChange={(event) => {
                            setPhoneNumber(
                              onlyDigits(event.target.value).slice(0, 10),
                            );
                            clearFieldError("phoneNumber");
                          }}
                          className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("phoneNumber")}`}
                          placeholder="הזינו מספר טלפון"
                        />
                      </div>
                      <ErrorText id="phone-error" message={formErrors.phoneNumber} />
                    </div>
                  </>
                )}

                {!isPasswordRecovery && (
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-gray-600 text-[13px] mb-2"
                      style={{ fontWeight: 500 }}
                    >
                      {role === "owner" ? "אימייל" : "אימייל צוות"}
                    </label>
                    <div className="relative">
                      <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                      <input
                        type="email"
                        id="email"
                        value={email}
                        aria-invalid={Boolean(formErrors.email)}
                        aria-describedby={formErrors.email ? "email-error" : undefined}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          clearFieldError("email");
                        }}
                        className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("email")}`}
                        placeholder="הזינו כתובת אימייל"
                      />
                    </div>
                    <ErrorText id="email-error" message={formErrors.email} />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="password"
                    className="block text-gray-600 text-[13px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    {isPasswordRecovery ? "סיסמה חדשה" : "סיסמה"}
                  </label>
                  <div className="relative">
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={password}
                      aria-invalid={Boolean(formErrors.password)}
                      aria-describedby={formErrors.password ? "password-error" : undefined}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearFieldError("password");
                        if (confirmPassword) clearFieldError("confirmPassword");
                      }}
                      className={`w-full pr-11 pl-11 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("password")}`}
                      placeholder={
                        isPasswordRecovery
                          ? "הזינו סיסמה חדשה"
                          : "הזינו סיסמה"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 cursor-pointer transition-colors"
                      aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" />
                      )}
                    </button>
                  </div>
                  {((role === "owner" && isSignUp) || isPasswordRecovery) && (
                    <p className="mt-2 text-[12px] font-medium text-gray-500">
                      לפחות 6 תווים, אות באנגלית ומספר.
                    </p>
                  )}
                  <ErrorText id="password-error" message={formErrors.password} />
                </div>

                {((role === "owner" && isSignUp) || isPasswordRecovery) && (
                  <>
                    <div>
                      <label
                        htmlFor="confirmPassword"
                        className="block text-gray-600 text-[13px] mb-2"
                        style={{ fontWeight: 500 }}
                      >
                        אימות סיסמה
                      </label>
                      <div className="relative">
                        <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          id="confirmPassword"
                          value={confirmPassword}
                          aria-invalid={Boolean(formErrors.confirmPassword)}
                          aria-describedby={formErrors.confirmPassword ? "confirmPassword-error" : undefined}
                          onChange={(event) => {
                            setConfirmPassword(event.target.value);
                            clearFieldError("confirmPassword");
                          }}
                          className={`w-full pr-11 pl-11 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("confirmPassword")}`}
                          placeholder="הזינו שוב את הסיסמה"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((prev) => !prev)
                          }
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 cursor-pointer transition-colors"
                          aria-label={showConfirmPassword ? "הסתרת אימות הסיסמה" : "הצגת אימות הסיסמה"}
                          aria-pressed={showConfirmPassword}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-[18px] h-[18px]" />
                          ) : (
                            <Eye className="w-[18px] h-[18px]" />
                          )}
                        </button>
                      </div>
                      <ErrorText id="confirmPassword-error" message={formErrors.confirmPassword} />
                    </div>

                    {role === "owner" && isSignUp && !isPasswordRecovery && (
                      <div>
                        <label
                          className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${formErrors.acceptedTerms ? "border-red-300 bg-red-50" : "border-rose-100 bg-rose-50/40"}`}
                        >
                          <input
                            type="checkbox"
                            checked={acceptedTerms}
                            aria-invalid={Boolean(formErrors.acceptedTerms)}
                            aria-describedby={formErrors.acceptedTerms ? "acceptedTerms-error" : undefined}
                            onChange={(event) => {
                              setAcceptedTerms(event.target.checked);
                              clearFieldError("acceptedTerms");
                            }}
                            className="mt-1 w-4 h-4 accent-rose-500 shrink-0"
                          />
                          <span
                            className="text-gray-600 text-[13px] leading-6"
                            style={{ fontWeight: 500 }}
                          >
                            אני מאשר/ת את <a href="/privacy#terms" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-bold text-[#1e40af] underline underline-offset-2">תנאי השימוש</a> ו<a href="/privacy" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-bold text-[#1e40af] underline underline-offset-2">מדיניות הפרטיות</a> של הפורטל,
                            ומבין/ה שהמידע באזור האישי אינו מחליף פנייה לצוות
                            המרפאה במקרה דחוף.
                          </span>
                        </label>
                        <ErrorText id="acceptedTerms-error" message={formErrors.acceptedTerms} />
                      </div>
                    )}
                  </>
                )}

                {!isSignUp && !isPasswordRecovery && (
                  <div className="text-left">
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={isLoading || isSendingPasswordReset}
                      className={`text-[13px] hover:underline disabled:no-underline disabled:opacity-60 cursor-pointer disabled:cursor-wait transition-colors ${role === "owner" ? "text-rose-500" : "text-[#1e40af]"}`}
                      style={{ fontWeight: 500 }}
                    >
                      {isSendingPasswordReset
                        ? "שולח קישור..."
                        : "שכחת סיסמה?"}
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || isSendingPasswordReset}
                  aria-busy={isLoading}
                  className={`w-full text-white py-3.5 rounded-xl transition-all shadow-lg cursor-pointer text-[16px] flex items-center justify-center gap-2 ${role === "owner" ? "bg-gradient-to-l from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-70 shadow-rose-500/20" : "bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-[#1e40af]/70 shadow-blue-500/20"}`}
                  style={{ fontWeight: 600 }}
                >
                  {isLoading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                      <span className="sr-only">הבקשה מתבצעת, נא להמתין</span>
                    </>
                  ) : (
                    <>
                      {role === "owner" ? (
                        <Heart className="w-5 h-5" />
                      ) : (
                        <Stethoscope className="w-5 h-5" />
                      )}
                      {isPasswordRecovery
                        ? "עדכון סיסמה"
                        : role === "owner"
                        ? isSignUp
                          ? "יצירת חשבון לקוח"
                          : "כניסה לאזור האישי"
                        : "כניסה לממשק הצוות"}
                    </>
                  )}
                </button>

                {role === "owner" && !isPasswordRecovery && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp((prev) => !prev);
                        resetForm();
                      }}
                      className="text-[13px] text-rose-500 hover:text-rose-600 hover:underline transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      {isSignUp
                        ? "כבר יש לכם חשבון? התחברו"
                        : "אין לכם חשבון? הירשמו"}
                    </button>
                  </div>
                )}
              </form>

            </div>
          )}

          {role !== null && (
            <LoginLegalNotice />
          )}
        </div>
      </main>
    </div>
  );
}
