import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AiGatewayError } from "../supabase/functions/_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../supabase/functions/_shared/ai/featureFlags.ts";
import { runClientSummaryGateway } from "../supabase/functions/_shared/ai/gateway.ts";
import { assertClientSummaryGrounded, validateClientSummaryOutput } from "../supabase/functions/_shared/ai/schemas.ts";
import { InMemoryRateLimiter } from "../supabase/functions/_shared/ai/rateLimit.ts";
import type { AiProviderAdapter, EnvReader } from "../supabase/functions/_shared/ai/types.ts";

const envFrom = (values: Record<string, string | undefined>): EnvReader => (name) => values[name];
const approved = {
  chief_complaint: "בדיקת מעקב בתאריך 17.07.2026",
  symptoms: ["ירידה בתיאבון"], relevant_history: [], examination_findings: ["חום תקין"], tests: [],
  clinical_assessment: "מצב יציב בבדיקה",
  treatments: ["ניקוי האזור"], medications: ["Drug A 5 mg פעם ביום"],
  follow_up: ["ביקורת בתאריך 24.07.2026"], warnings: ["פנו למרפאה במקרה של החמרה"],
  unresolved_items: ["להמתין לתוצאת הבדיקה"], source_references: ["medical_visit"],
};
const valid = {
  reason_for_visit: approved.chief_complaint,
  what_was_found: [approved.symptoms[0], approved.examination_findings[0]],
  treatment_given: approved.treatments,
  medications_and_instructions: approved.medications,
  home_care: approved.follow_up,
  follow_up: approved.follow_up,
  warning_signs: approved.warnings,
  next_steps: approved.unresolved_items,
};

function adapter(output: unknown = valid): AiProviderAdapter {
  return {
    id: "mock-client-summary",
    async generateStructured(request) {
      return { output: request.validateOutput(output), provider: "mock-client-summary", model: "mock-v1", attempts: 1, usage: {} };
    },
  };
}

test("client summary is provider-agnostic, strictly grounded and metadata-only", async () => {
  const result = await runClientSummaryGateway(
    { actorId: "verified-vet", approvedSummary: approved },
    { env: envFrom({ AI_CLIENT_SUMMARY_ENABLED: "true" }), adapter: adapter(), rateLimiter: new InMemoryRateLimiter() },
  );
  assert.deepEqual(result.output, valid);
  assert.equal(result.telemetry.capability, "client-summary.generate");
  assert.equal(result.telemetry.provider, "mock-client-summary");
  assert.equal("approvedSummary" in result.telemetry, false);
});

test("client summary flags default off and kill switch is isolated", () => {
  assert.equal(isAiCapabilityEnabled("client-summary.generate", envFrom({})), false);
  assert.equal(isAiCapabilityEnabled("client-summary.generate", envFrom({ AI_CLIENT_SUMMARY_ENABLED: "true" })), true);
  assert.equal(isAiCapabilityEnabled("client-summary.generate", envFrom({ AI_CLIENT_SUMMARY_ENABLED: "true", AI_CLIENT_SUMMARY_KILL_SWITCH: "true" })), false);
  assert.equal(isAiCapabilityEnabled("vetbot.general", envFrom({ AI_CLIENT_SUMMARY_ENABLED: "false" })), true);
  assert.equal(isAiCapabilityEnabled("rag.answer", envFrom({ AI_RAG_QA_ENABLED: "false" })), false);
});

test("changed medication, dose or date is rejected", () => {
  assert.throws(() => assertClientSummaryGrounded(validateClientSummaryOutput({ ...valid, medications_and_instructions: ["Drug A 10 mg פעם ביום"] }), approved), AiGatewayError);
  assert.throws(() => assertClientSummaryGrounded(validateClientSummaryOutput({ ...valid, follow_up: ["ביקורת בתאריך 25.07.2026"] }), approved), AiGatewayError);
  assert.throws(() => validateClientSummaryOutput({ ...valid, diagnosis: "new" }), AiGatewayError);
});

test("provider failure never creates or releases a summary", async () => {
  const failing: AiProviderAdapter = { id: "failing", async generateStructured() { throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true }); } };
  await assert.rejects(
    runClientSummaryGateway({ actorId: "verified-vet", approvedSummary: approved }, { env: envFrom({ AI_CLIENT_SUMMARY_ENABLED: "true" }), adapter: failing }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_PROVIDER_UNAVAILABLE",
  );
});

test("Edge verifies server identity, veterinarian role and approved source", () => {
  const source = readFileSync("supabase/functions/client-summary/index.ts", "utf8");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /\.eq\("role", "vet"\)/);
  assert.match(source, /\.eq\("artifact_type", "visit_summary"\)\.eq\("status", "approved"\)/);
  assert.match(source, /runClientSummaryGateway/);
  assert.match(source, /start_manual/);
  assert.doesNotMatch(source, /body\.(clinicId|clinic_id|ownerId|owner_id|petId|pet_id|userId|user_id|provider|model|prompt)/);
});

test("database workflow limits release to an approved vet-reviewed artifact", () => {
  const migration = readFileSync("supabase/migrations/20260717173000_client_summary_workflow.sql", "utf8");
  assert.match(migration, /staff\.role = 'vet'/);
  assert.match(migration, /source\.artifact_type = 'visit_summary' and source\.status = 'approved'/);
  assert.match(migration, /current_record\.status <> 'approved'/);
  assert.match(migration, /requested_action='release'/);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /revoke all on function public\.myvet_transition_client_summary/);
  assert.match(migration, /grant execute .* to authenticated,service_role/);
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
});

test("portal queries and renders only approved released owner summaries", () => {
  const source = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");
  assert.match(source, /\.eq\("artifact_type", "client_explanation"\)/);
  assert.match(source, /\.eq\("status", "approved"\)/);
  assert.match(source, /\.eq\("released_to_owner", true\)/);
  assert.match(source, /סיכום והנחיות מהמרפאה/);
  assert.doesNotMatch(source, /ai_approval_history|ai_audit_events|raw_transcript/);
});
