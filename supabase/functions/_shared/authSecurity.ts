const MFA_REQUIRED_STAFF_ROLES = new Set(["clinic_admin", "vet"]);

function readJwtPayload(authHeader: string): Record<string, unknown> | null {
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Call only after Supabase Auth getUser() has validated the same bearer token.
 * This reads the verified token's AAL; it does not validate signatures itself.
 */
export function staffMfaSatisfied(authHeader: string, staffRole: unknown): boolean {
  const normalizedRole = String(staffRole || "").trim();
  if (!MFA_REQUIRED_STAFF_ROLES.has(normalizedRole)) return true;
  return readJwtPayload(authHeader)?.aal === "aal2";
}
