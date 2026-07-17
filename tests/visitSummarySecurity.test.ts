import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260717120000_visit_summary_workflow.sql", "utf8");
const edge = readFileSync("supabase/functions/visit-summary/index.ts", "utf8");
const gateway = readFileSync("supabase/functions/_shared/ai/gateway.ts", "utf8");
const prompt = readFileSync("supabase/functions/_shared/ai/prompts.ts", "utf8");
const panel = readFileSync("src/app/components/VisitAiSummaryPanel.tsx", "utf8");
const frontendClient = readFileSync("src/services/visitSummary.ts", "utf8");

test("visit summary generation derives user, role, clinic and visit access on the server", () => {
  assert.match(edge, /client\.auth\.getUser\(\)/);
  assert.match(edge, /\.eq\("auth_user_id", userId\)/);
  assert.match(edge, /\.eq\("clinic_id", visit\.clinic_id\)/);
  assert.match(edge, /\.eq\("role", "vet"\)/);
  assert.match(edge, /\.eq\("visit_id", visitId\)/);
  assert.doesNotMatch(frontendClient, /clinicId|ownerId|petId|userId|provider|model|systemPrompt/);
});

test("AI generation can only create a draft through a service-only atomic function", () => {
  assert.match(migration, /'visit_summary', 'draft'/);
  assert.match(migration, /myvet_create_visit_summary_draft[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.myvet_create_visit_summary_draft[\s\S]*authenticated/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /on conflict \(clinic_id, capability, idempotency_key\)/);
  assert.doesNotMatch(migration, /update public\.medical_visits|insert into public\.medical_visits/);
});

test("only an authenticated veterinarian can create an approved immutable version", () => {
  assert.match(migration, /staff\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /staff\.role = 'vet'/);
  assert.match(migration, /current_record\.status not in \('draft', 'edited'\)/);
  assert.match(migration, /next_status := case requested_action when 'save' then 'edited' when 'approve' then 'approved'/);
  assert.match(migration, /supersedes_artifact_id/);
  assert.match(migration, /VISIT_SUMMARY_VERSION_CONFLICT/);
});

test("visit summary output is grounded, schema validated and never written partially", () => {
  assert.match(prompt, /Use only facts explicitly present/);
  assert.match(prompt, /Never infer or invent a diagnosis, medication, dose/);
  assert.match(gateway, /validateVisitSummaryOutput/);
  assert.match(edge, /runVisitSummaryGateway/);
  assert.match(migration, /private\.myvet_is_valid_visit_summary/);
  assert.doesNotMatch(edge, /generativelanguage\.googleapis\.com/);
});

test("the UI labels AI content as a draft and preserves editing state on failure", () => {
  assert.match(panel, /טיוטת AI/);
  assert.match(panel, /רק לאחר בדיקה ואישור/);
  assert.match(panel, /setError\(transitionError/);
  assert.doesNotMatch(panel.match(/catch \(transitionError\)[\s\S]*?finally/)?.[0] || "", /setDraft\(null\)/);
  assert.match(panel, /disabled=\{busyAction !== null\}/);
});

test("operational logs remain metadata-only", () => {
  const auditInsert = migration.match(/insert into public\.ai_audit_events[\s\S]*?\);/g)?.join("\n") || "";
  assert.match(auditInsert, /latency_ms|error_code|model_version|prompt_version/);
  assert.doesNotMatch(auditInsert, /requested_content|chief_complaint|clinical_assessment/);
});
