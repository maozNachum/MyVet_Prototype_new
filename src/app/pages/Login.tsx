import { useState } from "react";
import { useNavigate } from "react-router";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Stethoscope,
  Heart,
  ArrowRight,
  Shield,
  CalendarCheck,
  ClipboardList,
  Pill,
  Cat,
  Dog,
  Syringe,
  Scissors,
  Phone,
} from "lucide-react";
import { MyVetLogo } from "../components/MyVetLogo";

const heroImage =
  "https://images.unsplash.com/photo-1681779876669-50709aa75025?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoYXBweSUyMGRvZyUyMGNhdCUyMHRvZ2V0aGVyJTIwc29mdCUyMGxpZ2h0JTIwcG9ydHJhaXR8ZW58MXx8fHwxNzcyNDU2MTg0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

type LoginRole = null | "owner" | "staff";

export type StaffType = "vet" | "nurse" | "secretary";

const STAFF_TYPES: { key: StaffType; label: string; icon: typeof Stethoscope; description: string }[] = [
  { key: "vet", label: "וטרינר", icon: Stethoscope, description: "טיפולים, אבחונים ומרשמים" },
  { key: "nurse", label: "אחות", icon: Scissors, description: "סיוע בטיפולים ומעקב" },
  { key: "secretary", label: "מזכירה", icon: Phone, description: "תורים, קבלה ומלאי" },
];

export function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState<LoginRole>(null);
  const [staffType, setStaffType] = useState<StaffType>("vet");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    if (role === "staff") {
      localStorage.setItem("myvet_staff_type", staffType);
    }
    setTimeout(() => {
      setIsLoading(false);
      navigate(role === "owner" ? "/portal" : "/");
    }, 800);
  };

  const handleFaceId = () => {
    setIsLoading(true);
    if (role === "staff") {
      localStorage.setItem("myvet_staff_type", staffType);
    }
    setTimeout(() => {
      setIsLoading(false);
      navigate(role === "owner" ? "/portal" : "/");
    }, 1200);
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      {/* צד ימין */}
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
            <div className="flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-md rounded-xl p-2.5 border border-white/20">
                <MyVetLogo color="white" className="w-85 h-60" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* צד שמאל */}
      <div className="flex-1 flex items-center justify-center bg-gray-50/50 px-6 py-12 transform -translate-y-6">
        <div className="w-full max-w-[520px]">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-10 lg:mb-12">
            <div className="bg-[#1e40af] rounded-xl p-2.5 shadow-lg shadow-blue-500/20">
              <MyVetLogo color="white" className="w-60 h-33"  />
            </div>
          </div>

          {/* ── STEP 1: Role Selection ── */}
          {role === null && (
            <div>
              <div className="text-center mb-8">
                <h1
                  className="text-gray-900 text-[26px] mb-2"
                  style={{ fontWeight: 700 }}
                >
                  ברוכים הבאים
                </h1>
                <p className="text-gray-500 font-medium text-[15px]">
                  בחרו את סוג הכניסה שלכם
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Owner Card */}
                <button
                  onClick={() => setRole("owner")}
                  className="group relative bg-white border-2 border-gray-100 hover:border-rose-300 rounded-2xl p-6 pt-8 transition-all cursor-pointer hover:shadow-lg hover:shadow-rose-500/10 text-center overflow-hidden"
                >
                  {/* Accent stripe top */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-l from-pink-400 to-rose-500 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-100 group-hover:from-rose-100 group-hover:to-pink-200 flex items-center justify-center transition-colors shadow-sm mx-auto mb-5">
                    <Heart className="w-10 h-10 text-rose-500" />
                  </div>

                  <h3
                    className="text-gray-900 text-[19px] mb-2"
                    style={{ fontWeight: 700 }}
                  >
                    אזור אישי
                  </h3>

                  {/* Feature pills */}
                  <div className="space-y-2 mt-4">
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

                  <div className="mt-6 bg-gradient-to-l from-pink-500 to-rose-500 text-white text-[13px] py-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                    כניסה כבעלים
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                  <div className="mt-6 bg-gray-50 text-gray-500 font-medium text-[13px] py-2.5 rounded-xl group-hover:hidden flex items-center justify-center gap-2" style={{ fontWeight: 500 }}>
                    בחרו כניסה זו
                  </div>
                </button>

                {/* Staff Card */}
                <button
                  onClick={() => setRole("staff")}
                  className="group relative bg-white border-2 border-gray-100 hover:border-blue-300 rounded-2xl p-6 pt-8 transition-all cursor-pointer hover:shadow-lg hover:shadow-blue-500/10 text-center overflow-hidden"
                >
                  {/* Accent stripe top */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-l from-blue-500 to-indigo-600 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 group-hover:from-blue-100 group-hover:to-indigo-200 flex items-center justify-center transition-colors shadow-sm mx-auto mb-5">
                    <Stethoscope className="w-10 h-10 text-[#1e40af]" />
                  </div>

                  <h3
                    className="text-gray-900 text-[19px] mb-2"
                    style={{ fontWeight: 700 }}
                  >
                    צוות מרפאה
                  </h3>

                  {/* Feature pills */}
                  <div className="space-y-2 mt-4">
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

                  <div className="mt-6 bg-gradient-to-l from-[#1e40af] to-indigo-600 text-white text-[13px] py-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2" style={{ fontWeight: 600 }}>
                    כניסה כצוות
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                  <div className="mt-6 bg-gray-50 text-gray-500 font-medium text-[13px] py-2.5 rounded-xl group-hover:hidden flex items-center justify-center gap-2" style={{ fontWeight: 500 }}>
                    בחרו כניסה זו
                  </div>
                </button>
              </div>

              {/* Footer */}
              <p className="text-center text-gray-300 text-[12px] mt-10">
                © 2026 MyVet. כל הזכויות שמורות.
              </p>
            </div>
          )}

          {/* ── STEP 2: Login Form ── */}
          {role !== null && (
            <div
              className={`rounded-2xl shadow-sm border-2 p-8 sm:p-10 ${
                role === "owner"
                  ? "bg-white border-rose-100"
                  : "bg-white border-blue-100"
              }`}
            >
              {/* Back Button */}
              <button
                onClick={() => {
                  setRole(null);
                  setEmail("");
                  setPassword("");
                }}
                className="flex items-center gap-1.5 text-gray-500 font-medium hover:text-gray-600 text-[13px] mb-6 cursor-pointer transition-colors"
                style={{ fontWeight: 500 }}
              >
                <ArrowRight className="w-4 h-4" />
                חזרה לבחירת סוג כניסה
              </button>

              {/* Role Identity */}
              <div className="text-center mb-8">
                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-sm ${
                  role === "owner"
                    ? "bg-gradient-to-br from-rose-50 to-pink-100"
                    : "bg-gradient-to-br from-blue-50 to-indigo-100"
                }`}>
                  {role === "owner" ? (
                    <Heart className="w-8 h-8 text-rose-500" />
                  ) : (
                    <Stethoscope className="w-8 h-8 text-[#1e40af]" />
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] border ${
                      role === "owner"
                        ? "bg-rose-50 text-rose-600 border-rose-200"
                        : "bg-blue-50 text-[#1e40af] border-blue-200"
                    }`}
                    style={{ fontWeight: 600 }}
                  >
                    {role === "owner" ? (
                      <>
                        <Heart className="w-3 h-3" />
                        אזור אישי
                      </>
                    ) : (
                      <>
                        <Stethoscope className="w-3 h-3" />
                        אזור צוות מרפאה
                      </>
                    )}
                  </span>
                </div>

                <h1
                  className="text-gray-900 text-[24px] mb-2"
                  style={{ fontWeight: 700 }}
                >
                  {role === "owner" ? "שלום, אזור אישי" : "שלום, צוות המרפאה"}
                </h1>
                <p className="text-gray-500 font-medium text-[15px]">
                  {role === "owner"
                    ? "התחברו כדי לצפות בתיק הרפואי ובתורים"
                    : "התחברו כדי לגשת ללוח הבקרה"}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-5">
                {/* Staff Type Picker — only for staff */}
                {role === "staff" && (
                  <div>
                    <label className="block text-gray-600 text-[13px] mb-2.5" style={{ fontWeight: 500 }}>
                      בחרו תפקיד
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {STAFF_TYPES.map((st) => {
                        const isActive = staffType === st.key;
                        const SIcon = st.icon;
                        return (
                          <button
                            key={st.key}
                            type="button"
                            onClick={() => setStaffType(st.key)}
                            className={`relative flex flex-col items-center gap-1.5 rounded-xl py-3.5 px-2 border-2 transition-all cursor-pointer ${
                              isActive
                                ? "border-[#1e40af] bg-blue-50/70 shadow-sm shadow-blue-500/10"
                                : "border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50/50"
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                              isActive
                                ? "bg-[#1e40af] shadow-md shadow-blue-500/20"
                                : "bg-gray-100"
                            }`}>
                              <SIcon className={`w-5 h-5 ${isActive ? "text-white" : "text-gray-500 font-medium"}`} />
                            </div>
                            <span className={`text-[13px] ${isActive ? "text-[#1e40af]" : "text-gray-600"}`} style={{ fontWeight: isActive ? 700 : 500 }}>
                              {st.label}
                            </span>
                            <span className={`text-[10px] ${isActive ? "text-blue-400" : "text-gray-500 font-medium"}`}>
                              {st.description}
                            </span>
                            {isActive && (
                              <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-[#1e40af] flex items-center justify-center border-2 border-white shadow-sm">
                                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-gray-600 text-[13px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    {role === "owner"
                      ? "מספר טלפון / אימייל"
                      : "שם משתמש / אימייל"}
                  </label>
                  <div className="relative">
                    <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 font-medium pointer-events-none" />
                    <input
                      type="text"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pr-11 pl-4 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${
                        role === "owner"
                          ? "border-gray-200 focus:ring-rose-500/20 focus:border-rose-300"
                          : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                      placeholder={
                        role === "owner"
                          ? "הזינו מספר טלפון או אימייל"
                          : "הזינו שם משתמש או אימייל"
                      }
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-gray-600 text-[13px] mb-2"
                    style={{ fontWeight: 500 }}
                  >
                    סיסמה
                  </label>
                  <div className="relative">
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-500 font-medium pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pr-11 pl-11 py-3 border rounded-xl bg-gray-50/50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-[15px] ${
                        role === "owner"
                          ? "border-gray-200 focus:ring-rose-500/20 focus:border-rose-300"
                          : "border-gray-200 focus:ring-blue-500/20 focus:border-blue-400"
                      }`}
                      placeholder="הזינו סיסמה"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium hover:text-gray-600 cursor-pointer transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-[18px] h-[18px]" />
                      ) : (
                        <Eye className="w-[18px] h-[18px]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Forgot Password */}
                <div className="text-left">
                  <button
                    type="button"
                    className={`text-[13px] hover:underline cursor-pointer transition-colors ${
                      role === "owner" ? "text-rose-500" : "text-[#1e40af]"
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    שכחת סיסמה?
                  </button>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full text-white py-3.5 rounded-xl transition-all shadow-lg cursor-pointer text-[16px] flex items-center justify-center gap-2 ${
                    role === "owner"
                      ? "bg-gradient-to-l from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-70 shadow-rose-500/20"
                      : "bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-[#1e40af]/70 shadow-blue-500/20"
                  }`}
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
                      {role === "owner" ? "כניסה לאזור האישי" : "כניסה לממשק הצוות"}
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
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

              {/* Face ID */}
              <button
                onClick={handleFaceId}
                disabled={isLoading}
                className={`w-full group border hover:bg-opacity-50 disabled:opacity-60 rounded-xl py-4 px-5 transition-all cursor-pointer flex flex-col items-center gap-3 ${
                  role === "owner"
                    ? "border-gray-200 hover:border-rose-200 hover:bg-rose-50/50"
                    : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/50"
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-sm ${
                  role === "owner"
                    ? "bg-gradient-to-br from-rose-50 to-pink-100 group-hover:from-rose-100 group-hover:to-pink-200"
                    : "bg-gradient-to-br from-blue-50 to-indigo-100 group-hover:from-blue-100 group-hover:to-indigo-200"
                }`}>
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={role === "owner" ? "text-rose-500" : "text-[#1e40af]"}
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

          {/* Footer (only on step 2) */}
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