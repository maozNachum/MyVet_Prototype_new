import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20260915120000_multi_clinic_onboarding_and_secure_owner_signup.sql",
  "utf8",
);
const loginPage = readFileSync("src/app/pages/Login.tsx", "utf8");
const clinicManagementPage = readFileSync("src/app/pages/ClinicManagement.tsx", "utf8");
const routes = readFileSync("src/app/routes.tsx", "utf8");
const finalOwnerFlowMigration = readFileSync(
  "supabase/migrations/20260915200000_move_owner_invitation_acceptance_out_of_auth_trigger.sql",
  "utf8",
);
const ownerInvitationGuardMigration = readFileSync(
  "supabase/migrations/20260915210000_allow_verified_owner_invitation_acceptance.sql",
  "utf8",
);
const supabaseConfig = readFileSync("supabase/config.toml", "utf8");

test("P0 onboarding migration closes the direct owner INSERT path", () => {
  assert.match(migration, /revoke insert on table public\.owners from authenticated, anon/i);
  assert.match(migration, /drop policy if exists myvet_owner_insert_own on public\.owners/i);
  assert.match(migration, /create or replace function private\.myvet_handle_owner_signup\(\)/i);
  assert.match(migration, /OWNER_SIGNUP_INVITATION_REQUIRED/);
  assert.doesNotMatch(migration, /slug\s*=\s*'myvet-primary'/i);
});

test("P0 onboarding uses expiring, single-use, email-bound invitation tokens", () => {
  assert.match(migration, /create table if not exists public\.clinic_invitations/i);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /accepted_at is null/);
  assert.match(migration, /revoked_at is null/);
  assert.match(migration, /expires_at > now\(\)/);
  assert.match(migration, /lower\(btrim\(invitation\.email\)\) = actor_email/);
  assert.match(migration, /myvet_revoke_clinic_invitation/);
  assert.match(migration, /update public\.clinic_invitations set accepted_at = now\(\)/i);
});

test("P0 onboarding exposes server-owned clinic and membership operations", () => {
  assert.match(migration, /create or replace function public\.myvet_create_clinic\(/i);
  assert.match(migration, /create or replace function public\.myvet_create_clinic_invitation\(/i);
  assert.match(migration, /create or replace function public\.myvet_accept_clinic_invitation\(/i);
  assert.match(migration, /create or replace function public\.myvet_set_active_clinic\(/i);
  assert.match(migration, /private\.myvet_is_clinic_staff\(requested_clinic_id, array\['clinic_admin'\]/i);
  assert.match(migration, /private\.myvet_user_has_clinic_access\(requested_clinic_id\)/i);
  assert.match(migration, /grant execute on function public\.myvet_create_clinic\(text, text\) to authenticated/i);
});

test("P0 active clinic selection is membership-checked and does not trust a browser tenant", () => {
  assert.match(migration, /exists \(\s*select 1\s*from public\.staff/i);
  assert.match(migration, /staff_member\.clinic_id = preference\.active_clinic_id/i);
  assert.match(migration, /staff_member\.is_active = true/i);
  assert.match(migration, /if not private\.myvet_user_has_clinic_access\(requested_clinic_id\)/i);
});

test("P0 staff invitations have a complete browser onboarding path", () => {
  assert.match(loginPage, /myvet_accept_clinic_invitation/);
  assert.match(loginPage, /role: "staff"/);
  assert.match(loginPage, /mode=login&role=staff&invite/);
  assert.match(clinicManagementPage, /myvet_create_clinic_invitation/);
  assert.match(clinicManagementPage, /invitation_type.*staff|type === "staff"/i);
  assert.match(routes, /clinic-management/);
});

test("P0 owner invitation acceptance happens after Auth verification", () => {
  assert.match(finalOwnerFlowMigration, /drop trigger if exists on_auth_user_created_myvet_owner/i);
  assert.match(finalOwnerFlowMigration, /drop trigger if exists on_auth_user_confirmed_myvet_owner/i);
  assert.match(loginPage, /acceptOwnerInvitation/);
  assert.match(loginPage, /requested_terms_version: TERMS_VERSION/);
  assert.match(loginPage, /mode=login&role=owner&invite=/);
  assert.match(supabaseConfig, /login\?mode=login&role=owner&invite=\*/);
});

test("P0 owner invitation guard remains email, tenant, owner, and expiry bound", () => {
  assert.match(ownerInvitationGuardMigration, /trusted_owner_invitation/);
  assert.match(ownerInvitationGuardMigration, /i\.clinic_id=target_clinic_id/);
  assert.match(ownerInvitationGuardMigration, /i\.owner_id=new_data->>'owner_id'/);
  assert.match(ownerInvitationGuardMigration, /lower\(btrim\(i\.email\)\)=lower\(btrim\(u\.email\)\)/);
  assert.match(ownerInvitationGuardMigration, /u\.email_confirmed_at is not null/);
  assert.match(ownerInvitationGuardMigration, /i\.accepted_at is null/);
  assert.match(ownerInvitationGuardMigration, /i\.expires_at>now\(\)/);
});
