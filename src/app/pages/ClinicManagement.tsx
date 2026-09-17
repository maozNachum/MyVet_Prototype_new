import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Copy, KeyRound, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../services/supabaseClient";
import { PrivacyRequestsManager } from "../components/PrivacyRequestsManager";

type InvitationType = "owner" | "staff";
type StaffRole = "clinic_admin" | "vet" | "nurse" | "secretary";

const roleOptions: Array<{ value: StaffRole; label: string }> = [
  { value: "vet", label: "וטרינר" },
  { value: "nurse", label: "אחות" },
  { value: "secretary", label: "מזכירה" },
  { value: "clinic_admin", label: "מנהל מרפאה" },
];

function extractErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("CLINIC_SLUG_ALREADY_EXISTS")) return "כתובת המרפאה כבר בשימוש. בחרו כתובת אחרת.";
  if (message.includes("CLINIC_INVALID_SLUG")) return "כתובת המרפאה יכולה לכלול אותיות באנגלית, מספרים ומקפים בלבד.";
  if (message.includes("CLINIC_ADMIN_REQUIRED")) return "רק מנהל מרפאה יכול לבצע את הפעולה הזו.";
  if (message.includes("INVITATION_INVALID_EMAIL")) return "הזינו כתובת אימייל תקינה.";
  if (message.includes("INVITATION_INVALID_OWNER_ID")) return "מספר תעודת הזהות של הבעלים צריך לכלול 9 ספרות.";
  if (message.includes("INVITATION_INVALID_ROLE")) return "בחרו תפקיד תקין לצוות המרפאה.";
  return message || fallback;
}

export function ClinicManagement() {
  const [clinicId, setClinicId] = useState("");
  const [clinicLoading, setClinicLoading] = useState(true);
  const [clinicError, setClinicError] = useState("");
  const [clinicForm, setClinicForm] = useState({ slug: "", displayName: "" });
  const [invitationForm, setInvitationForm] = useState({
    email: "",
    type: "owner" as InvitationType,
    role: "vet" as StaffRole,
    ownerId: "",
  });
  const [isCreatingClinic, setIsCreatingClinic] = useState(false);
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  const [invitationType, setInvitationType] = useState<InvitationType>("owner");
  const [invitationExpiresAt, setInvitationExpiresAt] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadActiveClinic() {
      setClinicLoading(true);
      setClinicError("");
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("לא נמצא משתמש מחובר.");

        const { data: staffRows, error: staffError } = await supabase
          .from("staff")
          .select("clinic_id")
          .eq("auth_user_id", userData.user.id)
          .eq("is_active", true)
          .limit(1);
        if (staffError) throw staffError;
        const activeClinicId = String(staffRows?.[0]?.clinic_id || "");
        if (!activeClinicId) throw new Error("לא נמצאה מרפאה פעילה למשתמש הזה.");
        if (mounted) setClinicId(activeClinicId);
      } catch (error) {
        if (mounted) setClinicError(extractErrorMessage(error, "לא הצלחנו לטעון את המרפאה הפעילה."));
      } finally {
        if (mounted) setClinicLoading(false);
      }
    }
    void loadActiveClinic();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateClinic(event: FormEvent) {
    event.preventDefault();
    if (isCreatingClinic) return;
    const slug = clinicForm.slug.trim().toLowerCase();
    const displayName = clinicForm.displayName.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setClinicError("כתובת המרפאה יכולה לכלול אותיות באנגלית, מספרים ומקפים בלבד.");
      return;
    }
    if (!displayName) {
      setClinicError("הזינו שם מרפאה.");
      return;
    }
    setIsCreatingClinic(true);
    setClinicError("");
    try {
      const { data, error } = await supabase.rpc("myvet_create_clinic", {
        requested_slug: slug,
        requested_display_name: displayName,
      });
      if (error) throw error;
      const createdClinic = Array.isArray(data) ? data[0] : data;
      const createdClinicId = String(createdClinic?.clinic_id || "");
      if (!createdClinicId) throw new Error("המרפאה נוצרה ללא מזהה תקין.");
      setClinicId(createdClinicId);
      setClinicForm({ slug: "", displayName: "" });
      toast.success("המרפאה נוצרה והוגדרה כמרפאה הפעילה.");
    } catch (error) {
      setClinicError(extractErrorMessage(error, "לא הצלחנו ליצור את המרפאה."));
    } finally {
      setIsCreatingClinic(false);
    }
  }

  async function handleCreateInvitation(event: FormEvent) {
    event.preventDefault();
    if (isCreatingInvitation) return;
    const email = invitationForm.email.trim().toLowerCase();
    const ownerId = invitationForm.ownerId.trim();
    if (!clinicId) {
      setClinicError("לא נמצאה מרפאה פעילה ליצירת הזמנה.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setClinicError("הזינו כתובת אימייל תקינה.");
      return;
    }
    if (invitationForm.type === "owner" && !/^\d{9}$/.test(ownerId)) {
      setClinicError("מספר תעודת הזהות של הבעלים צריך לכלול 9 ספרות.");
      return;
    }
    setIsCreatingInvitation(true);
    setClinicError("");
    setInvitationToken("");
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.rpc("myvet_create_clinic_invitation", {
        requested_clinic_id: clinicId,
        requested_email: email,
        requested_invitation_type: invitationForm.type,
        requested_role: invitationForm.type === "staff" ? invitationForm.role : null,
        requested_owner_id: invitationForm.type === "owner" ? ownerId : null,
        requested_expires_at: expiresAt,
      });
      if (error) throw error;
      const createdInvitation = Array.isArray(data) ? data[0] : data;
      const token = String(createdInvitation?.invitation_token || "");
      if (!token) throw new Error("ההזמנה נוצרה ללא קוד תקין.");
      setInvitationToken(token);
      setInvitationType(invitationForm.type);
      setInvitationExpiresAt(String(createdInvitation?.expires_at || expiresAt));
      setInvitationForm((previous) => ({ ...previous, email: "", ownerId: "" }));
      toast.success("ההזמנה נוצרה. העתיקו את הקוד ושלחו אותו לנמען בערוץ מאובטח.");
    } catch (error) {
      setClinicError(extractErrorMessage(error, "לא הצלחנו ליצור את ההזמנה."));
    } finally {
      setIsCreatingInvitation(false);
    }
  }

  async function copyInvitation() {
    if (!invitationToken) return;
    try {
      const role = invitationType === "staff" ? "staff" : "owner";
      await navigator.clipboard.writeText(`${window.location.origin}/login?role=${role}&invite=${encodeURIComponent(invitationToken)}`);
      toast.success("קישור ההזמנה הועתק.");
    } catch {
      toast.error("לא הצלחנו להעתיק את קישור ההזמנה.");
    }
  }

  return (
    <main dir="rtl" className="min-h-[calc(100vh-4rem)] bg-[#eef6ff] px-4 py-6 sm:px-6 lg:px-8" style={{ fontFamily: "'Heebo', sans-serif" }}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-blue-100 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e40af]">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-950 sm:text-2xl">ניהול מרפאות והזמנות</h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">יצירת מרפאה נוספת והזמנת בעלי חיות או אנשי צוות להצטרף אליה.</p>
            </div>
          </div>
          {clinicLoading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />טוען את המרפאה הפעילה...</p>}
          {clinicId && !clinicLoading && <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">הזמנות חדשות יישלחו למרפאה הפעילה כרגע.</p>}
          {clinicError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{clinicError}</p>}
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleCreateClinic} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-[#1e40af]" aria-hidden="true" />
              <div><h2 className="font-black text-slate-950">יצירת מרפאה</h2><p className="text-sm text-slate-500">המרפאה החדשה תוגדר כפעילה עבורכם.</p></div>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700">שם המרפאה<input value={clinicForm.displayName} onChange={(event) => setClinicForm((previous) => ({ ...previous, displayName: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="לדוגמה: מרפאת החוף" /></label>
              <label className="block text-sm font-bold text-slate-700">כתובת פנימית באנגלית<input dir="ltr" value={clinicForm.slug} onChange={(event) => setClinicForm((previous) => ({ ...previous, slug: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-left text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="coast-vet" autoCapitalize="none" /></label>
              <button type="submit" disabled={isCreatingClinic} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"><Building2 className="h-4 w-4" />{isCreatingClinic ? "יוצר מרפאה..." : "יצירת מרפאה"}</button>
            </div>
          </form>

          <form onSubmit={handleCreateInvitation} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <UserPlus className="h-5 w-5 text-[#1e40af]" aria-hidden="true" />
              <div><h2 className="font-black text-slate-950">הזמנת משתמש</h2><p className="text-sm text-slate-500">הקוד תקף לשבעה ימים ונצרך פעם אחת.</p></div>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700">אימייל<input type="email" dir="ltr" value={invitationForm.email} onChange={(event) => setInvitationForm((previous) => ({ ...previous, email: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-left text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="name@example.com" autoComplete="email" /></label>
              <label className="block text-sm font-bold text-slate-700">סוג משתמש<select value={invitationForm.type} onChange={(event) => setInvitationForm((previous) => ({ ...previous, type: event.target.value as InvitationType }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="owner">בעלים של חיה</option><option value="staff">איש צוות</option></select></label>
              {invitationForm.type === "staff" ? <label className="block text-sm font-bold text-slate-700">תפקיד<select value={invitationForm.role} onChange={(event) => setInvitationForm((previous) => ({ ...previous, role: event.target.value as StaffRole }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label> : <label className="block text-sm font-bold text-slate-700">תעודת זהות של הבעלים<input inputMode="numeric" dir="ltr" value={invitationForm.ownerId} onChange={(event) => setInvitationForm((previous) => ({ ...previous, ownerId: event.target.value.replace(/\D/g, "").slice(0, 9) }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-left text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="9 ספרות" /></label>}
              <button type="submit" disabled={isCreatingInvitation || !clinicId} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1e40af] px-4 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"><KeyRound className="h-4 w-4" />{isCreatingInvitation ? "יוצר הזמנה..." : "יצירת קוד הזמנה"}</button>
            </div>
          </form>
        </section>

        {invitationToken && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6" aria-live="polite">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <div className="min-w-0 flex-1"><h2 className="font-black text-emerald-950">ההזמנה מוכנה</h2><p className="mt-1 text-sm leading-6 text-emerald-900">הקוד מוצג פעם אחת בלבד. העתיקו את הקישור ושלחו אותו לנמען בערוץ מאובטח.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly dir="ltr" value={`${window.location.origin}/login?role=${invitationType === "staff" ? "staff" : "owner"}&invite=${encodeURIComponent(invitationToken)}`} className="min-h-11 min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 text-left text-xs text-slate-700" aria-label="קישור הזמנה" /><button type="button" onClick={copyInvitation} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800"><Copy className="h-4 w-4" />העתקת קישור</button></div><p className="mt-2 flex items-center gap-1 text-xs text-emerald-800"><Mail className="h-3.5 w-3.5" />תוקף עד {new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitationExpiresAt))}</p></div>
          </div>
        </section>}
        <PrivacyRequestsManager clinicId={clinicId} />
      </div>
    </main>
  );
}
