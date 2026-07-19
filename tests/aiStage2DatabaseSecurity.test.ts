import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tenant = readFileSync("supabase/migrations/20260716213752_ai_tenant_foundation.sql", "utf8");
const model = readFileSync("supabase/migrations/20260716213800_ai_data_model.sql", "utf8");
const rls = readFileSync("supabase/migrations/20260716213806_ai_rls_and_rpc_hardening.sql", "utf8");
const storage = readFileSync("supabase/migrations/20260716213812_ai_storage_security.sql", "utf8");
const trustedMigrationGuard = readFileSync(
  "supabase/migrations/20260717145900_allow_trusted_migration_tenant_writes.sql",
  "utf8",
);
const authOwnerSignupGuard = readFileSync(
  "supabase/migrations/20260719150000_allow_supabase_auth_owner_signup.sql",
  "utf8",
);
const combined = `${tenant}\n${model}\n${rls}\n${storage}`;

test("Stage 2 creates a server-derived tenant foundation with composite entity keys", () => {
  assert.match(tenant, /create table if not exists public\.clinics/);
  assert.match(tenant, /private\.myvet_current_clinic_id\(\)/);
  assert.match(tenant, /alter column clinic_id set not null/);
  assert.match(tenant, /patients_clinic_owner_fkey/);
  assert.match(tenant, /unique \(clinic_id, pet_id\)/);
  assert.match(tenant, /primary key \(clinic_id, weekday\)/);
  assert.match(tenant, /set visit_type = 'full_exam'[\s\S]*where visit_type = 'checkup'/);
  assert.match(tenant, /validate constraint medical_visits_visit_type_check/);
  assert.match(rls, /private\.myvet_validate_legacy_tenant_scope/);
  assert.match(rls, /OWNER_PET_SCOPE_MISMATCH/);
  assert.match(rls, /create trigger b_myvet_validate_tenant_scope/);
  assert.doesNotMatch(tenant, /user_metadata/i);
});

test("AI records use constrained statuses, foreign keys and tenant-aware scope validation", () => {
  for (const table of [
    "ai_operations",
    "ai_audit_events",
    "ai_documents",
    "ai_document_chunks",
    "ai_document_embeddings",
    "ai_artifacts",
    "ai_sources",
    "ai_approval_history",
    "ai_consent_records",
    "ai_feature_flags",
    "ai_rate_limit_windows",
  ]) {
    assert.match(model, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(model, /foreign key \(clinic_id, pet_id\)/);
  assert.match(model, /foreign key \(clinic_id, visit_id\)/);
  assert.match(model, /foreign key \(clinic_id, appointment_id\)/);
  assert.match(model, /myvet_validate_ai_scope/);
  assert.match(model, /AI_SCOPE_OWNER_MISMATCH/);
  assert.match(model, /AI_APPROVAL_REQUIRES_VETERINARIAN/);
  assert.match(model, /status in \(\s*'generating', 'draft', 'edited', 'approved', 'rejected', 'failed', 'superseded'\s*\)/);
});

test("operational audit remains metadata-only and raw AI content is isolated", () => {
  const auditTable = model.match(/create table if not exists public\.ai_audit_events[\s\S]*?\n\);/)?.[0] ?? "";
  const operationTable = model.match(/create table if not exists public\.ai_operations[\s\S]*?\n\);/)?.[0] ?? "";
  assert.ok(auditTable.length > 0);
  assert.ok(operationTable.length > 0);
  assert.doesNotMatch(auditTable, /\b(prompt|response|transcript|medical_text|signed_url)\b/i);
  assert.doesNotMatch(operationTable, /\b(prompt|response|transcript|medical_text|signed_url)\b/i);
  assert.match(model, /create table if not exists public\.ai_artifacts/);
  assert.match(model, /content jsonb/);
  assert.match(rls, /ai_audit_immutable/);
});

test("legacy anonymous and PUBLIC policies are removed and broad non-RLS privileges are revoked", () => {
  assert.match(rls, /'anon' = any\(roles\)[\s\S]{0,80}or 'public' = any\(roles\)/);
  assert.match(rls, /regexp_replace\(coalesce\(qual, ''\)/);
  assert.match(rls, /regexp_replace\(coalesce\(with_check, ''\)/);
  assert.match(rls, /revoke all privileges on table public\.%I from anon/);
  assert.match(rls, /revoke truncate, references, trigger/);
  assert.doesNotMatch(combined, /create policy[\s\S]{0,180}(using|with check)\s*\(?(true)\)?/i);
});

test("clinic staff policies enforce tenant and actual role boundaries", () => {
  assert.match(rls, /private\.myvet_is_clinic_staff\(clinic_id/);
  assert.match(rls, /medical_tables text\[\][\s\S]*array\[''clinic_admin'',''vet'',''nurse''\]/);
  assert.doesNotMatch(
    rls.match(/medical_tables text\[\][\s\S]*?end \$\$;/)?.[0] ?? "",
    /secretary/,
  );
  assert.match(rls, /financial_tables text\[\][\s\S]*array\[''clinic_admin'',''vet'',''secretary''\]/);
  assert.match(rls, /myvet_staff_admin_manage/);
});

test("owners can only read approved released artifacts for their own pet", () => {
  const ownerPolicy = rls.match(/create policy ai_artifacts_owner_released_select[\s\S]*?\n\);/)?.[0] ?? "";
  assert.match(ownerPolicy, /status = 'approved'/);
  assert.match(ownerPolicy, /released_to_owner = true/);
  assert.match(ownerPolicy, /myvet_owner_owns_pet\(clinic_id, pet_id\)/);
  assert.match(ownerPolicy, /artifact_type not in \('transcript', 'document_extraction'\)/);
  assert.doesNotMatch(rls, /create policy .*owner.* on public\.ai_document_chunks/i);
  assert.doesNotMatch(rls, /create policy .*owner.* on public\.ai_audit_events/i);
  assert.doesNotMatch(rls, /create policy ai_sources_owner_released_select/i);
});

test("new AI tables are read-only or invisible to authenticated browser clients", () => {
  assert.match(rls, /revoke all privileges on table public\.%I from anon, authenticated/);
  assert.match(rls, /grant select on table public\.ai_operations/);
  assert.doesNotMatch(rls, /grant (insert|update|delete)[\s\S]*public\.ai_/i);
  assert.doesNotMatch(rls, /grant select[\s\S]*public\.ai_rate_limit_windows/i);
  assert.doesNotMatch(rls, /grant select[\s\S]*public\.ai_document_embeddings/i);
});

test("identity-sequence grants match the columns declared by the data migration", () => {
  assert.match(rls, /ai_audit_events_audit_event_id_seq/i);
  assert.match(rls, /ai_rate_limit_windows_rate_limit_id_seq/i);
  assert.doesNotMatch(rls, /ai_audit_events_event_id_seq/i);
  assert.doesNotMatch(rls, /ai_rate_limit_windows_window_id_seq/i);
});

test("trusted migration writes use role membership without opening browser writes", () => {
  assert.match(trustedMigrationGuard, /pg_has_role\(session_user,\s*'postgres',\s*'member'\)/i);
  assert.match(trustedMigrationGuard, /jwt_role\s*=\s*'service_role'\s+or\s+trusted_database_session/i);
  assert.match(trustedMigrationGuard, /raise exception 'AUTH_REQUIRED'/i);
  assert.match(
    trustedMigrationGuard,
    /revoke all on function private\.myvet_enforce_tenant_write\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(trustedMigrationGuard, /session_user\s+in\s*\([^)]*authenticator/i);
});

test("Supabase Auth owner signup bypass is narrow and nested-trigger only", () => {
  assert.match(authOwnerSignupGuard, /session_user\s*=\s*'supabase_auth_admin'/i);
  assert.match(authOwnerSignupGuard, /tg_table_name\s*=\s*'owners'/i);
  assert.match(authOwnerSignupGuard, /tg_op\s+in\s*\('INSERT',\s*'UPDATE'\)/i);
  assert.match(authOwnerSignupGuard, /pg_trigger_depth\(\)\s*>\s*1/i);
  assert.match(authOwnerSignupGuard, /or\s+trusted_auth_owner_signup/i);
  assert.match(
    authOwnerSignupGuard,
    /revoke all on function private\.myvet_enforce_tenant_write\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(authOwnerSignupGuard, /session_user\s*=\s*'authenticator'/i);
});

test("RPC compatibility functions fail closed and no function remains executable by anon", () => {
  assert.match(rls, /set search_path = ''/);
  assert.match(rls, /revoke all on function %s from public, anon/);
  assert.match(rls, /appointment\.clinic_id = schedule\.clinic_id/);
  assert.match(rls, /block\.clinic_id = schedule\.clinic_id/);
  assert.match(rls, /private\.myvet_is_clinic_staff\([\s\S]*array\['clinic_admin','vet','secretary'\]/);
  assert.match(rls, /TENANT_ACCESS_DENIED/);
  assert.doesNotMatch(rls, /select hours\.\*, current_clinic\.clinic_id/);
});

test("feature flags and kill switches are constrained independently", () => {
  assert.match(model, /create table if not exists public\.ai_feature_flags/);
  assert.match(model, /primary key \(clinic_id, capability\)/);
  assert.match(model, /constraint ai_feature_flags_kill_switch check \(not kill_switch or not enabled\)/);
  assert.match(rls, /ai_feature_flags_admin_select/);
});

test("Storage is private, tenant-prefixed and has no direct owner access to AI buckets", () => {
  assert.match(storage, /'ai-medical-documents'[\s\S]*false/);
  assert.match(storage, /'ai-recordings'[\s\S]*false/);
  assert.match(storage, /myvet_storage_path_clinic_id/);
  assert.match(storage, /myvet_storage_path_pet_id/);
  assert.match(storage, /private\.myvet_is_clinic_staff\(/);
  assert.match(storage, /'anon' = any\(roles\)/);
  assert.doesNotMatch(storage, /create policy .*owner.*ai-(medical-documents|recordings)/i);
  assert.match(storage, /file_size_limit/);
  assert.match(storage, /allowed_mime_types/);
});

test("pgvector payload/search remains deferred instead of fixing an unverified dimension", () => {
  assert.match(model, /Registry only/);
  assert.doesNotMatch(model, /extensions\.vector\s*\(/);
  assert.doesNotMatch(combined, /match_documents|similarity search/i);
});
