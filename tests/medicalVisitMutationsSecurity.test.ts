import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260826143000_atomic_medical_visit_save.sql", "utf8");
const rollback = readFileSync("supabase/rollback/phase0/03_disable_atomic_medical_visit_save.sql", "utf8");
const service = readFileSync("src/services/medicalVisitMutations.ts", "utf8");
const modal = readFileSync("src/app/components/TreatmentModal.tsx", "utf8");

test("medical entry RPC derives staff and clinic identity on the server", () => {
  assert.match(migration, /staff\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /staff\.role in \('clinic_admin', 'vet', 'nurse'\)/);
  assert.match(migration, /pet\.clinic_id = actor\.clinic_id/);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(service, /clinicId|ownerId|userId|staffId|role:/);
});

test("complete medical entry is persisted by one atomic RPC", () => {
  assert.match(modal, /saveMedicalEntryAtomic\(/);
  assert.doesNotMatch(modal, /\.from\("medical_visits"\)\.delete/);
  assert.doesNotMatch(modal, /childTables/);
  assert.match(migration, /insert into public\.medical_visits/);
  assert.match(migration, /insert into public\.vaccinations/);
  assert.match(migration, /insert into public\.physical_exams/);
  assert.match(migration, /insert into public\.medical_problems/);
  assert.match(migration, /insert into public\.differential_diagnoses/);
  assert.match(migration, /insert into public\.prescriptions/);
  assert.match(migration, /insert into public\.lab_orders/);
  assert.match(migration, /set status = 'completed'/);
});

test("RPC retries are serialized and deduplicated", () => {
  assert.match(migration, /submission_id uuid/);
  assert.match(migration, /submission_hash text/);
  assert.match(migration, /foreign key \(clinic_id, submitted_by\)[\s\S]*references public\.staff \(clinic_id, staff_id\)/);
  assert.match(migration, /medical_visits_clinic_submission_key/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /existing_visit\.submission_hash is distinct from target_submission_hash/);
  assert.match(migration, /'idempotentReplay', true/);
});

test("RPC rejects a missing visit date before persistence", () => {
  assert.match(migration, /nullif\(btrim\(coalesce\(requested_payload ->> 'visitDate', ''\)\), ''\) is null/);
  assert.match(migration, /raise exception 'INVALID_VISIT_DATE'/);
});

test("RPC privileges are explicit and anonymous execution is denied", () => {
  assert.match(migration, /revoke all on function public\.myvet_save_medical_entry\(uuid, jsonb\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.myvet_save_medical_entry\(uuid, jsonb\) to authenticated/);
  assert.match(rollback, /Existing medical records and idempotency metadata are intentionally preserved/);
  assert.doesNotMatch(rollback, /delete from|truncate/i);
});

test("linked appointment and pet must belong to the same server-derived clinic", () => {
  assert.match(migration, /a\.clinic_id = actor\.clinic_id/);
  assert.match(migration, /APPOINTMENT_PET_MISMATCH/);
  assert.match(migration, /APPOINTMENT_CANCELLED/);
  assert.match(migration, /APPOINTMENT_ALREADY_COMPLETED/);
  assert.match(migration, /for update/);
});
