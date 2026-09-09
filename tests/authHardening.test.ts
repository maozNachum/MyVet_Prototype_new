import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { staffMfaSatisfied } from "../supabase/functions/_shared/authSecurity.ts";

const authPolicy = readFileSync("src/services/authSecurity.ts", "utf8");
const login = readFileSync("src/app/pages/Login.tsx", "utf8");
const layout = readFileSync("src/app/pages/Layout.tsx", "utf8");
const mfaPage = readFileSync("src/app/pages/StaffMfa.tsx", "utf8");
const routes = readFileSync("src/app/routes.tsx", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260909073817_harden_staff_auth_and_mfa.sql",
  "utf8",
);
const baselineMigration = readFileSync(
  "tools/supabase-baseline/supabase/migrations/20260909073817_harden_staff_auth_and_mfa.sql",
  "utf8",
);
const policyDocument = readFileSync("docs/AUTH_HARDENING_POLICY_HE.md", "utf8");

function bearerWithAal(aal: "aal1" | "aal2"): string {
  const payload = Buffer.from(JSON.stringify({ aal })).toString("base64url");
  return `Bearer ignored.${payload}.ignored`;
}

test("new and recovered passwords share the hardened policy", () => {
  assert.match(authPolicy, /MIN_PASSWORD_LENGTH = 12/);
  assert.match(authPolicy, /\(\?=\.\*\[a-z\]\)/);
  assert.match(authPolicy, /\(\?=\.\*\[A-Z\]\)/);
  assert.match(authPolicy, /\(\?=\.\*\\d\)/);
  assert.match(login, /PASSWORD_POLICY_REGEX/);
  assert.match(login, /PASSWORD_POLICY_MESSAGE/);
  assert.doesNotMatch(login, /לפחות 6 תווים/);
});

test("high privilege staff cannot bypass the MFA route", () => {
  assert.match(authPolicy, /\["clinic_admin", "vet"\]/);
  assert.match(login, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(login, /assurance\.currentLevel !== "aal2"/);
  assert.match(login, /navigate\("\/mfa"\)/);
  assert.match(layout, /requiresStaffMfa\(staffRole\)/);
  assert.match(layout, /navigate\("\/mfa", \{ replace: true \}\)/);
  assert.match(routes, /path: "\/mfa"/);
});

test("MFA screen supports enrollment, verification and safe exit", () => {
  assert.match(mfaPage, /mfa\.enroll\(/);
  assert.match(mfaPage, /factorType: "totp"/);
  assert.match(mfaPage, /mfa\.challengeAndVerify\(/);
  assert.match(mfaPage, /currentLevel !== "aal2"/);
  assert.match(mfaPage, /autoComplete="one-time-code"/);
  assert.match(mfaPage, /dir="rtl"/);
  assert.match(mfaPage, /supabase\.auth\.signOut\(\)/);
});

test("validated server requests enforce AAL2 for privileged staff", () => {
  assert.equal(staffMfaSatisfied(bearerWithAal("aal1"), "clinic_admin"), false);
  assert.equal(staffMfaSatisfied(bearerWithAal("aal1"), "vet"), false);
  assert.equal(staffMfaSatisfied(bearerWithAal("aal2"), "vet"), true);
  assert.equal(staffMfaSatisfied(bearerWithAal("aal1"), "nurse"), true);
  assert.equal(staffMfaSatisfied(bearerWithAal("aal1"), "owner"), true);
  assert.equal(staffMfaSatisfied("Bearer malformed", "vet"), false);

  for (const edgeFunction of [
    "ai-assistant",
    "visit-summary",
    "digitalcare-transcription",
    "medical-record-rag",
    "document-ocr",
    "client-summary",
    "follow-up-suggestions",
  ]) {
    const source = readFileSync(`supabase/functions/${edgeFunction}/index.ts`, "utf8");
    assert.match(source, /staffMfaSatisfied/, edgeFunction);
    assert.match(source, /MFA_REQUIRED/, edgeFunction);
  }
});

test("database enforcement requires aal2 and revokes staff sessions", () => {
  assert.equal(migration, baselineMigration);
  assert.match(migration, /staff_role not in \('clinic_admin', 'vet'\)/);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal'/);
  assert.match(migration, /create policy myvet_staff_self_select_for_mfa/);
  assert.match(migration, /delete from auth\.sessions/);
  assert.match(migration, /after update of auth_user_id, role, is_active or delete/);
  assert.match(migration, /revoke all on function private\.myvet_revoke_staff_sessions\(\)[\s\S]*authenticated/);
});

test("local Auth policy and hosted Preview boundary are documented", () => {
  assert.match(config, /minimum_password_length = 12/);
  assert.match(config, /password_requirements = "lower_upper_letters_digits_symbols"/);
  assert.match(config, /jwt_expiry = 3600/);
  assert.match(config, /enable_refresh_token_rotation = true/);
  assert.match(config, /\[auth\.sessions\][\s\S]*timebox = "12h"[\s\S]*inactivity_timeout = "1h"/);
  assert.match(config, /\[auth\.mfa\.totp\][\s\S]*enroll_enabled = true[\s\S]*verify_enabled = true/);
  assert.match(policyDocument, /Leaked password protection/);
  assert.match(policyDocument, /Preview מבודדת/);
  assert.match(policyDocument, /Production לא שונה/);
  assert.match(policyDocument, /over_email_send_rate_limit/);
});
