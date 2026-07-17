import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AiGatewayError } from "../supabase/functions/_shared/ai/errors.ts";
import { isAiCapabilityEnabled } from "../supabase/functions/_shared/ai/featureFlags.ts";
import { runFollowUpSuggestionGateway } from "../supabase/functions/_shared/ai/gateway.ts";
import { resolveFollowUpDate, validateFollowUpSuggestionOutput } from "../supabase/functions/_shared/ai/schemas.ts";
import type { AiProviderAdapter, EnvReader } from "../supabase/functions/_shared/ai/types.ts";

const envFrom = (values: Record<string, string | undefined>): EnvReader => (name) => values[name];
const approved = {
  chief_complaint: "בדיקת מעקב", symptoms: [], relevant_history: [], examination_findings: [], tests: [],
  clinical_assessment: "מצב יציב", treatments: [], medications: ["Drug A 5 mg פעם ביום"],
  follow_up: ["ביקורת בעוד שבועיים", "חיסון בתאריך 31.07.2026", "מעקב לפי הצורך"],
  warnings: ["במקרה של החמרה לפנות למרפאה"], unresolved_items: [], source_references: ["medical_visit"],
};

const rawSuggestion = {
  reminder_type: "return_visit",
  title: "ביקורת חוזרת",
  target_type: "owner",
  release_to_client: true,
  confidence: "high",
  source_text: approved.follow_up[0],
  date_expression: "בעוד שבועיים",
};

function adapter(output: unknown = { suggestions: [rawSuggestion] }): AiProviderAdapter {
  return {
    id: "mock-follow-up",
    async generateStructured(request) {
      return { output: request.validateOutput(output), provider: "mock-follow-up", model: "mock-v1", attempts: 1, usage: {} };
    },
  };
}

test("follow-up gateway is provider-agnostic and resolves relative dates deterministically", async () => {
  const result = await runFollowUpSuggestionGateway(
    { actorId: "verified-vet", approvedSummary: approved, sourceDate: "2026-07-17" },
    { env: envFrom({ AI_FOLLOW_UP_SUGGESTIONS_ENABLED: "true" }), adapter: adapter() },
  );
  assert.equal(result.output[0].scheduled_at, "2026-07-31T09:00:00.000Z");
  assert.equal(result.output[0].requires_manual_date, false);
  assert.equal(result.telemetry.capability, "follow-up.suggest");
  assert.equal("approvedSummary" in result.telemetry, false);
});

test("absolute, relative and ambiguous dates are handled without guessing", () => {
  assert.equal(resolveFollowUpDate("31.07.2026", "2026-07-17"), "2026-07-31T09:00:00.000Z");
  assert.equal(resolveFollowUpDate("בעוד 10 ימים", "2026-07-17"), "2026-07-27T09:00:00.000Z");
  assert.equal(resolveFollowUpDate("לפי הצורך", "2026-07-17"), null);
  const ambiguous = validateFollowUpSuggestionOutput({ suggestions: [{ ...rawSuggestion, reminder_type: "general_follow_up", title: "מעקב רפואי", target_type: "staff", release_to_client: false, source_text: approved.follow_up[2], date_expression: "לפי הצורך" }] }, approved, "2026-07-17");
  assert.equal(ambiguous[0].requires_manual_date, true);
  assert.equal(ambiguous[0].scheduled_at, null);
});

test("unapproved facts and changed medication or warning text are rejected", () => {
  assert.throws(() => validateFollowUpSuggestionOutput({ suggestions: [{ ...rawSuggestion, source_text: "Drug A 10 mg פעם ביום", date_expression: "בעוד שבועיים" }] }, approved, "2026-07-17"), AiGatewayError);
  assert.throws(() => validateFollowUpSuggestionOutput({ suggestions: [{ ...rawSuggestion, source_text: "אין צורך לפנות במקרה של החמרה", date_expression: "" }] }, approved, "2026-07-17"), AiGatewayError);
});

test("feature flag defaults off and kill switch does not disable other AI capabilities", () => {
  assert.equal(isAiCapabilityEnabled("follow-up.suggest", envFrom({})), false);
  assert.equal(isAiCapabilityEnabled("follow-up.suggest", envFrom({ AI_FOLLOW_UP_SUGGESTIONS_ENABLED: "true" })), true);
  assert.equal(isAiCapabilityEnabled("follow-up.suggest", envFrom({ AI_FOLLOW_UP_SUGGESTIONS_ENABLED: "true", AI_FOLLOW_UP_SUGGESTIONS_KILL_SWITCH: "true" })), false);
  assert.equal(isAiCapabilityEnabled("vetbot.general", envFrom({ AI_FOLLOW_UP_SUGGESTIONS_ENABLED: "false" })), true);
  assert.equal(isAiCapabilityEnabled("rag.answer", envFrom({ AI_RAG_QA_ENABLED: "false" })), false);
});

test("provider failure cannot create a reminder", async () => {
  const failing: AiProviderAdapter = { id: "failing", async generateStructured() { throw new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true }); } };
  await assert.rejects(
    runFollowUpSuggestionGateway({ actorId: "verified-vet", approvedSummary: approved, sourceDate: "2026-07-17" }, { env: envFrom({ AI_FOLLOW_UP_SUGGESTIONS_ENABLED: "true" }), adapter: failing }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_PROVIDER_UNAVAILABLE",
  );
});

test("Edge verifies identity, veterinarian role and approved source server-side", () => {
  const source = readFileSync("supabase/functions/follow-up-suggestions/index.ts", "utf8");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /\.eq\("role", "vet"\)/);
  assert.match(source, /\.eq\("artifact_type", "visit_summary"\)\.eq\("status", "approved"\)/);
  assert.match(source, /runFollowUpSuggestionGateway/);
  assert.doesNotMatch(source, /body\.(clinicId|clinic_id|ownerId|owner_id|petId|pet_id|userId|user_id|provider|model|prompt)/);
});

test("database approval creates an existing reminder only after vet approval and checks duplicates", () => {
  const migration = readFileSync("supabase/migrations/20260717180000_follow_up_suggestion_workflow.sql", "utf8");
  assert.match(migration, /staff\.role='vet'/);
  assert.match(migration, /source\.artifact_type='visit_summary' and source\.status='approved'/);
  assert.match(migration, /if requested_action='approve' then[\s\S]*insert into public\.reminders/);
  assert.match(migration, /existing_reminder_id is not null and not requested_duplicate_confirmed/);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /revoke all on function public\.myvet_transition_follow_up_suggestion/);
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
});

test("UI requires explicit approval, exposes manual fallback and duplicate confirmation", () => {
  const source = readFileSync("src/app/components/FollowUpSuggestionsPanel.tsx", "utf8");
  assert.match(source, /שום תזכורת לא נוצרת לפני בדיקה ואישור שלך/);
  assert.match(source, /צור מעקב ידני/);
  assert.match(source, /אשר יצירה נוספת/);
  assert.match(source, /יש לבחור תאריך ושעה לפני אישור התזכורת/);
});
