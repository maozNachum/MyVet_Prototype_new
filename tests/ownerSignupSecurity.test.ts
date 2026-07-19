import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync("src/app/pages/Login.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260719123000_secure_owner_signup.sql",
  "utf8",
);
const authWriteGuard = readFileSync(
  "supabase/migrations/20260719150000_allow_supabase_auth_owner_signup.sql",
  "utf8",
);
const metadataSanitizer = readFileSync(
  "supabase/migrations/20260719151000_sanitize_owner_signup_metadata.sql",
  "utf8",
);

test("owner signup does not query or mutate owner rows before authentication", () => {
  const signupStart = login.indexOf('if (role === "owner" && isSignUp)');
  const authSignup = login.indexOf("supabase.auth.signUp", signupStart);
  const beforeAuth = login.slice(signupStart, authSignup);

  assert.ok(signupStart >= 0 && authSignup > signupStart);
  assert.doesNotMatch(beforeAuth, /\.from\("owners"\)/);
  assert.match(login, /phone:\s*normalizedPhone/);
  assert.match(login, /terms_version:\s*TERMS_VERSION/);
  assert.match(login, /rpc\("claim_owner_profile"\)/);
  assert.doesNotMatch(login, /\.eq\("email",\s*normalizedEmail\)/);
});

test("owner profile creation is server-side and tenant scoped", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /after insert on auth\.users/i);
  assert.match(migration, /if new\.email_confirmed_at is null then[\s\S]*return new/i);
  assert.match(migration, /after update of email_confirmed_at on auth\.users/i);
  assert.match(migration, /old\.email_confirmed_at is null and new\.email_confirmed_at is not null/i);
  assert.match(migration, /where clinic\.slug = 'myvet-primary'/i);
  assert.match(migration, /if found then[\s\S]*existing_owner\.auth_user_id[\s\S]*existing_owner\.email/i);
  assert.match(migration, /update auth\.users[\s\S]*raw_user_meta_data[\s\S]*- array\[/i);
  assert.match(
    migration,
    /revoke all on function private\.myvet_handle_owner_signup\(\) from public, anon, authenticated/i,
  );
});

test("owner signup rejects invalid or unconsented metadata", () => {
  assert.match(migration, /requested_owner_id !~ '\^\[0-9\]\{9\}\$'/);
  assert.match(migration, /requested_phone !~ '\^05\[0-9\]\{8\}\$'/);
  assert.match(migration, /requested_terms_version <> 'myvet-owner-portal-v1'/);
  assert.match(migration, /OWNER_SIGNUP_EMAIL_MISMATCH/);
  assert.match(migration, /OWNER_SIGNUP_ALREADY_CLAIMED/);
});

test("managed Auth can only complete the nested owner-profile write", () => {
  assert.match(authWriteGuard, /session_user\s*=\s*'supabase_auth_admin'/i);
  assert.match(authWriteGuard, /tg_table_schema\s*=\s*'public'/i);
  assert.match(authWriteGuard, /tg_table_name\s*=\s*'owners'/i);
  assert.match(authWriteGuard, /pg_trigger_depth\(\)\s*>\s*1/i);
  assert.doesNotMatch(authWriteGuard, /grant execute/i);
});

test("owner signup transport metadata is sanitized after GoTrue enrichment", () => {
  assert.match(metadataSanitizer, /after update of raw_user_meta_data on auth\.users/i);
  assert.match(metadataSanitizer, /old\.raw_user_meta_data is distinct from new\.raw_user_meta_data/i);
  assert.match(metadataSanitizer, /new\.raw_user_meta_data ->> 'role'/i);
  assert.match(metadataSanitizer, /execute function private\.myvet_handle_owner_signup\(\)/i);
  assert.doesNotMatch(metadataSanitizer, /grant execute/i);
});
