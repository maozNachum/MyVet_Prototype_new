import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { CommandCenter } from "../components/CommandCenter";
import { Loader2 } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { clearStaffSession, type StaffType } from "../data/staffAuth";
import { MedicalStoreProvider } from "../data/MedicalStore";
import { AppointmentStoreProvider } from "../data/AppointmentStore";
import { LabStoreProvider } from "../data/LabStore";

export function Layout() {
  const navigate = useNavigate();
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function verifyStaffAccess() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error("NO_SESSION");

        const { data: staffProfile, error: staffError } = await supabase
          .from("staff")
          .select("staff_id, email, full_name, role, is_active")
          .eq("auth_user_id", authData.user.id)
          .eq("is_active", true)
          .maybeSingle();

        const allowedRoles: StaffType[] = ["clinic_admin", "vet", "nurse", "secretary"];
        const staffRole = String(staffProfile?.role || "") as StaffType;
        if (staffError || !staffProfile || !allowedRoles.includes(staffRole)) {
          throw new Error("NO_STAFF_ACCESS");
        }

        localStorage.setItem("myvet_staff_type", staffRole);
        localStorage.setItem("myvet_staff_name", staffProfile.full_name || "צוות מרפאה");
        localStorage.setItem("myvet_staff_email", staffProfile.email || authData.user.email || "");
        localStorage.setItem("myvet_staff_id", String(staffProfile.staff_id || ""));
        if (mounted) setIsCheckingAccess(false);
      } catch {
        clearStaffSession();
        if (mounted) navigate("/login", { replace: true });
      }
    }

    void verifyStaffAccess();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (isCheckingAccess) {
    return (
      <div dir="rtl" className="myvet-app-canvas flex min-h-screen items-center justify-center px-4" style={{ fontFamily: "'Heebo', sans-serif" }}>
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 text-[15px] font-semibold text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> מאמת הרשאת צוות...
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="myvet-app-canvas min-h-screen flex flex-col"
      style={{ fontFamily: "'Heebo', sans-serif" }}
    >
      <MedicalStoreProvider>
        <AppointmentStoreProvider>
          <LabStoreProvider>
            <Navbar />
            <CommandCenter />
            <div id="main-content" tabIndex={-1} className="flex-1 outline-none">
              <Outlet />
            </div>
            <Footer />
          </LabStoreProvider>
        </AppointmentStoreProvider>
      </MedicalStoreProvider>
    </div>
  );
}
