import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(
  "supabase/migrations/20260915130000_harden_owner_profile_claim_concurrency.sql",
  "utf8",
);

test("owner claim and protected owner writes share a transaction advisory lock", () => {
  assert.match(migration, /pg_advisory_xact_lock\(/i);
  assert.match(migration, /hashtextextended\(lower\(btrim\(requested_email\)\), 0\)/i);
  assert.match(migration, /create trigger myvet_serialize_owner_email/i);
  assert.match(migration, /perform private\.myvet_lock_owner_email\(verified_email\)/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /OWNER_PROFILE_AMBIGUOUS/);
});

test("owner claim remains a parameterless authenticated RPC", () => {
  assert.match(migration, /create or replace function public\.claim_owner_profile\(\)/i);
  assert.match(migration, /revoke all on function public\.claim_owner_profile\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.claim_owner_profile\(\) to authenticated/i);
  assert.doesNotMatch(migration, /requested_clinic_id|requested_owner_id/);
});
