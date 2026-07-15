import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";

export type StaffRole = "vet" | "nurse" | "secretary";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  roleLabel: string;
  licenseNo?: string;
  certificationLevel?: string;
}

type StaffRow = {
  staff_id: string | null;
  full_name: string | null;
  role: string | null;
  is_active?: boolean | null;
};

export function normalizeStaffRole(role?: string | null): StaffRole {
  const value = (role || "").trim().toLowerCase();
  if (["vet", "veterinarian", "doctor", "וטרינר", "רופא", "רופאה"].includes(value)) return "vet";
  if (["nurse", "assistant", "אחות", "אסיסטנט", "אסיסטנטית"].includes(value)) return "nurse";
  if (["secretary", "receptionist", "admin", "מזכירה", "פקיד", "קבלה"].includes(value)) return "secretary";
  return "secretary";
}

export function staffRoleLabel(role: StaffRole) {
  if (role === "vet") return "וטרינר";
  if (role === "nurse") return "אחות";
  return "מזכירה";
}

export function mapStaffRow(row: StaffRow): StaffMember {
  const role = normalizeStaffRole(row.role);
  return {
    id: row.staff_id || row.full_name || crypto.randomUUID(),
    name: row.full_name?.trim() || staffRoleLabel(role),
    role,
    roleLabel: staffRoleLabel(role),
  };
}

export async function fetchStaffMembers(roles?: StaffRole[]) {
  let query = supabase
    .from("staff")
    .select("staff_id, full_name, role, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  const members = ((data || []) as StaffRow[])
    .map(mapStaffRow)
    .filter((member) => !roles || roles.includes(member.role));

  return members;
}

export function useStaffMembers(roles?: StaffRole[]) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roleKey = useMemo(() => roles?.join(",") || "all", [roles]);

  useEffect(() => {
    let mounted = true;

    async function loadStaff() {
      setIsLoading(true);
      setError(null);
      try {
        const rows = await fetchStaffMembers(roles);
        if (mounted) setMembers(rows);
      } catch (err: any) {
        console.error("Failed to load staff members", err);
        if (mounted) {
          setMembers([]);
          setError(err?.message || "שגיאה בטעינת אנשי צוות");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadStaff();
    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleKey]);

  return { members, isLoading, error };
}

export function uniqueNames(names: string[]) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}
