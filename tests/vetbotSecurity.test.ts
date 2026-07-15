import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/ai-assistant/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/202607150001_vetbot_privacy.sql", "utf8");
const rlsMigration = readFileSync("supabase/migrations/202607150002_myvet_rls_hardening.sql", "utf8");
const portalSource = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");
const bookingSource = readFileSync("src/app/components/OwnerBookAppointment.tsx", "utf8");
const vaccinationSource = readFileSync("src/app/components/VaccinationBook.tsx", "utf8");

test("VetBot server exposes no autonomous database write tools", () => {
  assert.doesNotMatch(edgeFunction, /\.update\s*\(/);
  assert.doesNotMatch(edgeFunction, /\.upsert\s*\(/);
  assert.doesNotMatch(edgeFunction, /\.delete\s*\(/);
  assert.match(edgeFunction, /vetbot_audit_logs/);
  assert.match(edgeFunction, /requiresConfirmation:\s*true/);
});

test("VetBot verifies roles on the server and keeps owner access portal-only", () => {
  assert.match(edgeFunction, /from\("staff"\).*auth_user_id/s);
  assert.match(edgeFunction, /mode === "portal"/);
  assert.match(edgeFunction, /from\("owners"\).*auth_user_id/s);
  assert.match(edgeFunction, /ROLE_NOT_ALLOWED/);
});

test("VetBot audit schema stores metadata and has no prompt or response columns", () => {
  const auditTable = migration.match(/create table if not exists public\.vetbot_audit_logs[\s\S]*?\);/)?.[0] || "";
  assert.ok(auditTable.length > 0);
  assert.doesNotMatch(auditTable, /\bprompt\b/i);
  assert.doesNotMatch(auditTable, /\bresponse\b/i);
  assert.doesNotMatch(auditTable, /medical_text|question_text|answer_text/i);
  assert.match(auditTable, /actor_id/);
  assert.match(auditTable, /redaction_count/);
});

test("MyVet blocks anonymous database access and enables RLS", () => {
  assert.match(rlsMigration, /revoke all privileges on table public\.%I from anon/i);
  assert.match(rlsMigration, /enable row level security/i);
  assert.match(rlsMigration, /myvet_is_active_staff/);
  assert.match(rlsMigration, /myvet_owner_matches/);
});

test("Owner linking uses the verified JWT email only on the server", () => {
  assert.match(rlsMigration, /auth\.jwt\(\)\s*->>\s*'email'/);
  assert.match(portalSource, /rpc\("claim_owner_profile"\)/);
  assert.doesNotMatch(portalSource, /\.eq\("email",\s*authUser\.email\)/);
});

test("Owner booking reads occupied slots without duplicating contact details", () => {
  assert.match(bookingSource, /rpc\("myvet_booked_slots"/);
  assert.doesNotMatch(bookingSource, /בעלים:\s*\$\{ownerName\}/);
  assert.doesNotMatch(bookingSource, /טלפון:\s*\$\{ownerPhone\}/);
  assert.doesNotMatch(bookingSource, /אימייל:\s*\$\{ownerEmail\}/);
});

test("Demo payments never change billing records from the browser", () => {
  const handler = portalSource.match(/const handleDemoPaymentConfirm[\s\S]*?\n  };/)?.[0] || "";
  assert.ok(handler.length > 0);
  assert.doesNotMatch(handler, /from\("payments"\)/);
  assert.match(handler, /לא בוצע חיוב אמיתי/);
});

test("Medical images use expiring signed URLs and private storage", () => {
  assert.doesNotMatch(vaccinationSource, /getPublicUrl/);
  assert.match(vaccinationSource, /createSignedUrl/);
  assert.match(rlsMigration, /set public = false/);
  assert.match(rlsMigration, /myvet_owner_documents_select/);
});
