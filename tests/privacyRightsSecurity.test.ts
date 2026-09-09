import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260906153000_privacy_request_workflow.sql", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260909221500_harden_privacy_request_workflow.sql", "utf8");
const baseline = readFileSync("tools/supabase-baseline/supabase/migrations/20260906153000_privacy_request_workflow.sql", "utf8");
const hardeningBaseline = readFileSync("tools/supabase-baseline/supabase/migrations/20260909221500_harden_privacy_request_workflow.sql", "utf8");
const service = readFileSync("src/services/privacyRequests.ts", "utf8");
const page = readFileSync("src/app/pages/PrivacyPolicy.tsx", "utf8");

test("privacy requests derive owner and tenant from authenticated server state", () => {
  assert.match(migration, /actor_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /where owner\.auth_user_id = actor_id/i);
  assert.doesNotMatch(migration, /myvet_submit_privacy_request\([^)]*(clinic|owner|auth_user)/i);
  assert.match(migration, /existing_request_id[\s\S]*status in \('submitted', 'identity_review', 'in_review'\)/i);
});

test("privacy request storage is fail-closed and tenant-scoped", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on table public\.privacy_requests from public, anon, authenticated/i);
  assert.match(migration, /privacy_requests_owner_select[\s\S]*auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(hardeningMigration, /privacy_requests_staff_select[\s\S]*private\.myvet_is_clinic_staff[\s\S]*clinic_admin/i);
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
});

test("only the guarded RPC changes request status and deletion is not automatic", () => {
  assert.match(migration, /staff_row\.role = 'clinic_admin'/i);
  assert.match(migration, /request\.clinic_id = actor_staff\.clinic_id/i);
  assert.match(migration, /PRIVACY_REQUEST_ALREADY_CLOSED/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
  assert.doesNotMatch(migration, /storage\.objects/i);
  assert.match(migration, /function public\.myvet_privacy_retention_preview\(\)/i);
  assert.match(migration, /revoke all on function public\.myvet_privacy_retention_preview\(\) from public, anon, authenticated/i);
  assert.match(hardeningMigration, /private\.myvet_staff_mfa_satisfied\(actor_staff\.role\)/i);
  assert.match(hardeningMigration, /MFA_REQUIRED/i);
  assert.match(hardeningMigration, /privacy_requests_one_open_owner_type_uidx/i);
  assert.match(hardeningMigration, /pg_advisory_xact_lock/i);
});

test("frontend uses one service and gives safe guidance", () => {
  assert.match(service, /rpc\("myvet_submit_privacy_request"/);
  assert.doesNotMatch(service, /requested_(?:clinic|owner|auth_user)/i);
  assert.match(page, /אין לצרף מידע רפואי או מסמכים/);
  assert.match(page, /לאחר אימות זהות/);
  assert.match(page, /hasLinkedOwnerProfile\(\)[\s\S]*listMyPrivacyRequests\(\)/);
  assert.match(page, /isOwnerSignedIn && requestWorkflowAvailable/);
  assert.match(service, /\.eq\("auth_user_id", authData\.user\.id\)/);
});

test("clean-room baseline contains the identical migration", () => {
  assert.equal(baseline, migration);
  assert.equal(hardeningBaseline, hardeningMigration);
});
