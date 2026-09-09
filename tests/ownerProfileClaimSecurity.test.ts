import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260906120000_harden_owner_profile_claim.sql";
const baselineMigrationPath = "tools/supabase-baseline/supabase/migrations/20260906120000_harden_owner_profile_claim.sql";
const migration = readFileSync(migrationPath, "utf8");
const baselineMigration = readFileSync(baselineMigrationPath, "utf8");
const service = readFileSync("src/services/ownerProfileClaim.ts", "utf8");
const login = readFileSync("src/app/pages/Login.tsx", "utf8");
const portal = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");

test("owner claim derives identity from confirmed Auth state and accepts no tenant input", () => {
  assert.match(migration, /function public\.claim_owner_profile\(\)/i);
  assert.match(migration, /actor_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /\(select auth\.jwt\(\)\) ->> 'email'/i);
  assert.match(migration, /from auth\.users as auth_user/i);
  assert.match(migration, /auth_user\.email_confirmed_at is not null/i);
  assert.doesNotMatch(migration, /claim_owner_profile\([^)]*(clinic|owner|email)/i);
});

test("ambiguous owner email matches fail closed without arbitrary selection", () => {
  assert.match(migration, /for matching_owner in[\s\S]*for update/i);
  assert.match(migration, /matching_owner_count > 1[\s\S]*OWNER_PROFILE_AMBIGUOUS/i);
  assert.match(migration, /where owner_id = candidate_owner_id[\s\S]*auth_user_id is null/i);
  assert.match(migration, /OWNER_PROFILE_CLAIM_CONFLICT/i);
  assert.doesNotMatch(migration, /order by candidate\.owner_id[\s\S]*limit 1/i);
});

test("owner claim keeps least-privilege execution and safe function settings", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.claim_owner_profile\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.claim_owner_profile\(\) to authenticated, service_role/i);
});

test("clean-room baseline applies the exact same owner-claim migration", () => {
  assert.equal(baselineMigration, migration);
});

test("login and portal share one claim service and do not expose technical recovery instructions", () => {
  assert.match(service, /supabase\.rpc\("claim_owner_profile"\)/);
  assert.match(login, /claimOwnerProfile\(\)/);
  assert.match(portal, /claimOwnerProfile\(\)/);
  assert.doesNotMatch(login, /rpc\("claim_owner_profile"\)/);
  assert.doesNotMatch(portal, /rpc\("claim_owner_profile"\)/);
  assert.doesNotMatch(portal, /טבלת owners|auth_user_id מתאים/);
  assert.match(service, /OWNER_PROFILE_AMBIGUOUS/);
  assert.match(service, /OwnerProfileClaimError/);
});
