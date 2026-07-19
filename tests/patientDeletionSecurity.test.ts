import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260719195338_secure_patient_deletion.sql", import.meta.url),
  "utf8",
);

const patientsPage = fs.readFileSync(
  new URL("../src/app/pages/Patients.tsx", import.meta.url),
  "utf8",
);

test("patient deletion is performed through the secured RPC", () => {
  assert.match(patientsPage, /supabase\.rpc\("myvet_delete_patient"/);
  assert.doesNotMatch(
    patientsPage,
    /\.from\(['"]patients['"]\)\s*\.delete\(\)/,
  );
});

test("patient deletion requires an active clinic administrator", () => {
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /staff_member\.clinic_id = target_clinic_id/);
  assert.match(migration, /staff_member\.is_active = true/);
  assert.match(migration, /staff_member\.role = 'clinic_admin'/);
});

test("patient deletion helper is private and the RPC is not anonymous", () => {
  assert.match(
    migration,
    /revoke all on schema myvet_private from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all on function public\.myvet_delete_patient\(bigint\) from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.myvet_delete_patient\(bigint\) to authenticated, service_role/,
  );
});

test("dependent records and the patient are deleted in one database function", () => {
  assert.match(migration, /delete_dependent_rows/);
  assert.match(migration, /delete from public\.patients/);
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
});
