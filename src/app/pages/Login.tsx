import { useState } from "react";
import { useNavigate } from "react-router";
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

const heroImage =
  "https://images.unsplash.com/photo-1681779876669-50709aa75025?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMGRvZyUyMGNhdCUyMHRvZ2V0aGVyJTIwc29mdCUyMGxpZ2h0JTIwcG9ydHJhaXR8ZW58MXx8fHwxNzcyNDU2MTg0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

type LoginRole = null | "owner" | "staff";
export type StaffType = "clinic_admin" | "vet" | "nurse" | "secretary";

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

function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
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

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-[12px] font-semibold text-red-600">{message}</p>
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
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

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
          ? "הזינו אימייל תקין של האזור האישי."
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

        const { data: existingOwner, error: existingOwnerError } =
          await supabase
            .from("owners")
            .select("owner_id, auth_user_id, email")
            .eq("owner_id", normalizedId)
            .maybeSingle();

        if (existingOwnerError) throw existingOwnerError;

        if (existingOwner?.auth_user_id) {
          setFormErrors({ idNumber: "כבר קיים חשבון עבור תעודת הזהות הזו." });
          throw new Error(
            "כבר קיים חשבון עבור תעודת הזהות הזו. נסו להתחבר או פנו למרפאה.",
          );
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/portal`,
            data: {
              role: "owner",
              owner_id: normalizedId,
              full_name: fullName.trim(),
            },
          },
        });

        if (error) throw error;
        if (!data.user) throw new Error("המשתמש לא נוצר במערכת האימות.");

        const { firstName, lastName } = splitFullName(fullName);
        const ownerPayload = {
          owner_id: normalizedId,
          auth_user_id: data.user.id,
          owner_first_name: firstName,
          owner_last_name: lastName,
          phone: normalizedPhone,
          email: normalizedEmail,
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        };

        if (existingOwner) {
          const { error: updateOwnerError } = await supabase
            .from("owners")
            .update(ownerPayload)
            .eq("owner_id", normalizedId);

          if (updateOwnerError) throw updateOwnerError;
        } else {
          const { error: insertOwnerError } = await supabase
            .from("owners")
            .insert(ownerPayload);
          if (insertOwnerError) throw insertOwnerError;
        }

        if (data.session) {
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
          const { data: ownerByEmail, error: ownerByEmailError } =
            await supabase
              .from("owners")
              .select("owner_id, auth_user_id, email")
              .eq("email", normalizedEmail)
              .maybeSingle();

          if (ownerByEmailError) throw ownerByEmailError;

          if (!ownerByEmail) {
            await supabase.auth.signOut();
            throw new Error(
              "לא נמצא אזור אישי שמחובר לחשבון הזה. פנו למרפאה לחיבור החשבון.",
            );
          }

          if (!ownerByEmail.auth_user_id) {
            const { error: linkOwnerError } = await supabase
              .from("owners")
              .update({ auth_user_id: data.user.id })
              .eq("owner_id", ownerByEmail.owner_id);

            if (linkOwnerError) throw linkOwnerError;
          }
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

      if (staffProfile.is_active === false) {
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

  const handleFaceId = () => {
    setFormMessage(
      "התחברות מהירה תיפתח בהמשך. כרגע יש להתחבר עם אימייל וסיסמה.",
    );
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
          alt="Happy pets"
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

      <div className="flex-1 flex items-center justify-center bg-gray-50/50 px-6 py-8 lg:py-6">
        <div className="w-full max-w-[520px]">
          <div className="flex items-center justify-center gap-2.5 mb-6 lg:mb-8">
            <div className="bg-[#1e40af] rounded-xl p-2.5 shadow-lg shadow-blue-500/20">
              <MyVetLogo color="white" className="w-60 h-33" />
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

              <p className="text-center text-gray-300 text-[12px] mt-6">
                © 2026 MyVet. כל הזכויות שמורות.
              </p>
            </div>
          )}

          {role !== null && (
            <div
              className={`rounded-2xl shadow-sm border-2 p-6 sm:p-10 transition-all ${role === "owner" ? "bg-white border-rose-100" : "bg-white border-blue-100"}`}
            >
              <button
                type="button"
                onClick={() => {
                  setRole(null);
                  setIsSignUp(false);
                  resetForm();
                }}
                className="flex items-center gap-1.5 text-gray-500 font-medium hover:text-gray-600 text-[13px] mb-6 cursor-pointer transition-colors"
                style={{ fontWeight: 500 }}
              >
                <ArrowRight className="w-4 h-4" />
                חזרה לבחירת סוג כניסה
              </button>

              <div className="text-center mb-8">
                <div
                  className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-sm ${role === "owner" ? "bg-gradient-to-br from-rose-50 to-pink-100" : "bg-gradient-to-br from-blue-50 to-indigo-100"}`}
                >
                  {role === "owner" ? (
                    <Heart className="w-8 h-8 text-rose-500" />
                  ) : (
                    <Stethoscope className="w-8 h-8 text-[#1e40af]" />
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 mb-3">
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
                  className="text-gray-900 text-[24px] mb-2"
                  style={{ fontWeight: 700 }}
                >
                  {role === "owner"
                    ? isSignUp
                      ? "פתיחת חשבון לקוח"
                      : "שלום, אזור אישי"
                    : "שלום, צוות המרפאה"}
                </h1>
                <p className="text-gray-500 font-medium text-[15px]">
                  {role === "owner"
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
                  void handleLogin(event);
                }}
                noValidate
                className="space-y-5"
              >
                {role === "owner" && isSignUp && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setFormMessage(
                          "אפשרות ההרשמה עם Google תיפתח בהמשך. כרגע אפשר להמשיך בהרשמה רגילה דרך הטופס.",
                        )
                      }
                      disabled={isLoading}
                      className="w-full border-2 border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-70 rounded-xl py-3.5 px-4 transition-all cursor-pointer flex items-center justify-center text-gray-700"
                      style={{ fontWeight: 600 }}
                      aria-label="המשך עם Google להרשמה"
                    >
                      <svg
                        className="w-6 h-6"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fill="#4285F4"
                          d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.18 3.56-8.65Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3a7.2 7.2 0 0 1-10.72-3.79H1.34v3.1A12 12 0 0 0 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.35 14.31a7.18 7.18 0 0 1 0-4.62V6.59H1.34a12 12 0 0 0 0 10.82l4.01-3.1Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.96 1.22 15.24 0 12 0A12 12 0 0 0 1.34 6.59l4.01 3.1A7.2 7.2 0 0 1 12 4.77Z"
                        />
                      </svg>
                    </button>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span
                        className="text-gray-500 text-[13px]"
                        style={{ fontWeight: 500 }}
                      >
                        או
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  </>
                )}

                {role === "staff" && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-right">
                    <div className="flex items-start gap-3">
                      <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#1e40af]" />
                      <div>
                        <p className="text-[13px] font-bold text-[#1e40af]">
                          ההרשאה נקבעת לפי משתמש הצוות במערכת
                        </p>
                        <p className="mt-1 text-[12px] font-medium leading-5 text-slate-600">
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
                          onChange={(event) => {
                            setFullName(event.target.value);
                            clearFieldError("fullName");
                          }}
                          className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("fullName")}`}
                          placeholder="הזינו שם מלא"
                        />
                      </div>
                      <ErrorText message={formErrors.fullName} />
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
                      <ErrorText message={formErrors.idNumber} />
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
                      <ErrorText message={formErrors.phoneNumber} />
                    </div>
                  </>
                )}

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
                      onChange={(event) => {
                        setEmail(event.target.value);
                        clearFieldError("email");
                      }}
                      className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("email")}`}
                      placeholder="הזינו כתובת אימייל"
                    />
                  </div>
                  <ErrorText message={formErrors.email} />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-gray-600 text-[13px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    סיסמה
                  </label>
                  <div className="relative">
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearFieldError("password");
                        if (confirmPassword) clearFieldError("confirmPassword");
                      }}
                      className={`w-full pr-11 pl-11 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${inputClass("password")}`}
                      placeholder="הזינו סיסמה"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 cursor-pointer transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" />
                      )}
                    </button>
                  </div>
                  {role === "owner" && isSignUp && (
                    <p className="mt-2 text-[12px] font-medium text-gray-500">
                      לפחות 6 תווים, אות באנגלית ומספר.
                    </p>
                  )}
                  <ErrorText message={formErrors.password} />
                </div>

                {role === "owner" && isSignUp && (
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
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-[18px] h-[18px]" />
                          ) : (
                            <Eye className="w-[18px] h-[18px]" />
                          )}
                        </button>
                      </div>
                      <ErrorText message={formErrors.confirmPassword} />
                    </div>

                    <div>
                      <label
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${formErrors.acceptedTerms ? "border-red-300 bg-red-50" : "border-rose-100 bg-rose-50/40"}`}
                      >
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
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
                          אני מאשר/ת את תנאי השימוש ומדיניות הפרטיות של הפורטל,
                          ומבין/ה שהמידע באזור האישי אינו מחליף פנייה לצוות
                          המרפאה במקרה דחוף.
                        </span>
                      </label>
                      <ErrorText message={formErrors.acceptedTerms} />
                    </div>
                  </>
                )}

                {!isSignUp && (
                  <div className="text-left">
                    <button
                      type="button"
                      onClick={() =>
                        setFormMessage(
                          role === "owner"
                            ? "לאיפוס סיסמה פנו למרפאה או בקשו קישור התחברות חדש."
                            : "לאיפוס סיסמה פנו למנהל המערכת במרפאה.",
                        )
                      }
                      className={`text-[13px] hover:underline cursor-pointer transition-colors ${role === "owner" ? "text-rose-500" : "text-[#1e40af]"}`}
                      style={{ fontWeight: 500 }}
                    >
                      שכחת סיסמה?
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={(event) => void handleLogin(event)}
                  disabled={isLoading}
                  className={`w-full text-white py-3.5 rounded-xl transition-all shadow-lg cursor-pointer text-[16px] flex items-center justify-center gap-2 ${role === "owner" ? "bg-gradient-to-l from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-70 shadow-rose-500/20" : "bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-[#1e40af]/70 shadow-blue-500/20"}`}
                  style={{ fontWeight: 600 }}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {role === "owner" ? (
                        <Heart className="w-5 h-5" />
                      ) : (
                        <Stethoscope className="w-5 h-5" />
                      )}
                      {role === "owner"
                        ? isSignUp
                          ? "יצירת חשבון לקוח"
                          : "כניסה לאזור האישי"
                        : "כניסה לממשק הצוות"}
                    </>
                  )}
                </button>

                {role === "owner" && (
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

              <div className="flex items-center gap-4 my-7">
                <div className="flex-1 h-px bg-gray-200" />
                <span
                  className="text-gray-500 font-medium text-[13px]"
                  style={{ fontWeight: 500 }}
                >
                  או
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                type="button"
                onClick={handleFaceId}
                disabled={isLoading}
                className={`w-full group border hover:bg-opacity-50 disabled:opacity-60 rounded-xl py-4 px-5 transition-all cursor-pointer flex flex-col items-center gap-3 ${role === "owner" ? "border-gray-200 hover:border-rose-200 hover:bg-rose-50/50" : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/50"}`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-sm ${role === "owner" ? "bg-gradient-to-br from-rose-50 to-pink-100 group-hover:from-rose-100 group-hover:to-pink-200" : "bg-gradient-to-br from-blue-50 to-indigo-100 group-hover:from-blue-100 group-hover:to-indigo-200"}`}
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={
                      role === "owner" ? "text-rose-500" : "text-[#1e40af]"
                    }
                  >
                    <path d="M7 3H5a2 2 0 0 0-2 2v2" />
                    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                    <path d="M17 21h2a2 2 0 0 0 2-2v-2" />
                    <path d="M9 9v1" />
                    <path d="M15 9v1" />
                    <path d="M12 12v1.5" />
                    <path d="M9.5 15.5a3.5 3.5 0 0 0 5 0" />
                  </svg>
                </div>
                <span
                  className="text-gray-500 text-[13px] group-hover:text-gray-700 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  התחברות מהירה בטאבלט באמצעות זיהוי פנים
                </span>
              </button>
            </div>
          )}

          {role !== null && (
            <p className="text-center text-gray-300 text-[12px] mt-8">
              © 2026 MyVet. כל הזכויות שמורות.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
