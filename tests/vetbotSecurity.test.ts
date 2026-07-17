import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/ai-assistant/index.ts", "utf8");
const corsSource = readFileSync("supabase/functions/_shared/cors.ts", "utf8");
const migration = readFileSync("supabase/migrations/202607150001_vetbot_privacy.sql", "utf8");
const rlsMigration = readFileSync("supabase/migrations/202607150002_myvet_rls_hardening.sql", "utf8");
const availabilityMigration = readFileSync("supabase/migrations/20260716145453_clinic_booking_availability.sql", "utf8");
const paymentSettlementMigration = readFileSync("supabase/migrations/20260716181935_reliable_realtime_and_payment_settlement.sql", "utf8");
const paymentMethodFixMigration = readFileSync("supabase/migrations/20260716200544_fix_portal_demo_payment_method.sql", "utf8");
const actionMigration = readFileSync("supabase/migrations/20260716193200_vetbot_action_orchestration.sql", "utf8");
const actionEngine = readFileSync("supabase/functions/_shared/vetbotActions.ts", "utf8");
const aiGateway = readFileSync("supabase/functions/_shared/ai/gateway.ts", "utf8");
const aiSchemas = readFileSync("supabase/functions/_shared/ai/schemas.ts", "utf8");
const aiFeatures = readFileSync("supabase/functions/_shared/ai/featureFlags.ts", "utf8");
const portalSource = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");
const bookingSource = readFileSync("src/app/components/OwnerBookAppointment.tsx", "utf8");
const newAppointmentSource = readFileSync("src/app/pages/NewAppointment.tsx", "utf8");
const vaccinationSource = readFileSync("src/app/components/VaccinationBook.tsx", "utf8");
const appointmentStoreSource = readFileSync("src/app/data/AppointmentStore.tsx", "utf8");
const dashboardSource = readFileSync("src/app/pages/Dashboard.tsx", "utf8");
const vetbotDrawerSource = readFileSync("src/app/components/ai/AiAssistantDrawer.tsx", "utf8");
const vetbotAnswerSource = readFileSync("src/app/components/ai/AiStructuredAnswer.tsx", "utf8");
const themeSource = readFileSync("src/styles/theme.css", "utf8");

test("VetBot writes only through expiring human-approved action requests", () => {
  assert.match(edgeFunction, /vetbot_audit_logs/);
  assert.match(edgeFunction, /requiresConfirmation:\s*true/);
  assert.match(edgeFunction, /actionDecision/);
  assert.match(actionMigration, /expires_at timestamptz not null default \(now\(\) \+ interval '10 minutes'\)/);
  assert.match(actionMigration, /actor_id = auth\.uid\(\)/);
  assert.match(actionMigration, /status <> 'pending'/);
  assert.match(actionMigration, /current_role <> request_row\.actor_role/);
  assert.match(actionMigration, /revoke all on function public\.myvet_execute_vetbot_action\(uuid\) from anon/);
  assert.match(actionEngine, /status: "needs_confirmation"/);
  assert.match(actionEngine, /decision: "approve" \| "reject"/);
});

test("VetBot asks for missing action details and blocks dangerous operations", () => {
  assert.match(actionEngine, /status: "needs_details"/);
  assert.match(actionEngine, /type: "forbidden"/);
  assert.match(actionEngine, /process a payment|תשלומים/);
  assert.match(edgeFunction, /missingFields/);
  assert.match(edgeFunction, /Never claim an action was executed/);
});

test("VetBot does not display source labels in answers", () => {
  assert.doesNotMatch(vetbotAnswerSource, />מקור:\s*\{item\.source\}/);
  assert.match(vetbotAnswerSource, /מקור\\s\*:/);
  assert.match(edgeFunction, /Never output a source line/);
});

test("VetBot retries incomplete structured Gemini output without logging content", () => {
  assert.match(edgeFunction, /for \(const attempt of \[1, 2\]\)/);
  assert.match(edgeFunction, /JSON\.parse\(result\.text\)/);
  assert.match(edgeFunction, /Gemini returned invalid JSON after retry/);
  assert.match(edgeFunction, /responseLength: result\.text\.length/);
  assert.doesNotMatch(edgeFunction, /(?:text|content|response):\s*result\.text/);
  assert.doesNotMatch(edgeFunction, /console\.(?:log|warn|error)\(result\.text\)/);
  assert.match(edgeFunction, /transientStatuses = new Set\(\[429, 500, 502, 503, 504\]\)/);
  assert.match(edgeFunction, /trying fallback/);
  assert.match(edgeFunction, /gemini-3\.5-flash/);
  assert.match(edgeFunction, /gemini-2\.5-flash/);
});

test("VetBot verifies roles on the server and keeps owner access portal-only", () => {
  assert.match(edgeFunction, /from\("staff"\).*auth_user_id/s);
  assert.match(edgeFunction, /mode === "portal"/);
  assert.match(edgeFunction, /from\("owners"\).*auth_user_id/s);
  assert.match(edgeFunction, /ROLE_NOT_ALLOWED/);
});

test("VetBot CORS normalizes configured origins and reports rejected origins", () => {
  assert.match(corsSource, /new URL\(trimmed\)\.origin/);
  assert.match(corsSource, /ALLOWED_ORIGINS/);
  assert.match(corsSource, /localOrigin \|\| configured\.includes\(origin\)/);
  assert.match(corsSource, /VetBot CORS rejected origin/);
  assert.doesNotMatch(corsSource, /Access-Control-Allow-Origin":\s*"\*"/);
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

test("Owner booking uses clinic-controlled slots and an atomic booking RPC", () => {
  assert.match(bookingSource, /rpc\("myvet_available_slots"/);
  assert.match(bookingSource, /rpc\("myvet_owner_book_appointment"/);
  assert.match(availabilityMigration, /clinic_booking_hours/);
  assert.match(availabilityMigration, /clinic_booking_blocks/);
  assert.match(availabilityMigration, /myvet_slot_is_bookable/);
  assert.match(availabilityMigration, /pg_advisory_xact_lock/);
  assert.match(availabilityMigration, /drop policy if exists "myvet_owner_appointments_insert"/);
  assert.doesNotMatch(bookingSource, /בעלים:\s*\$\{ownerName\}/);
  assert.doesNotMatch(bookingSource, /טלפון:\s*\$\{ownerPhone\}/);
  assert.doesNotMatch(bookingSource, /אימייל:\s*\$\{ownerEmail\}/);
});

test("Owner cannot select a slot already occupied by their own appointment", () => {
  assert.match(bookingSource, /ownerBookedRanges/);
  assert.match(bookingSource, /overlaps\(start, end, booking\.start, booking\.end\)/);
  assert.match(bookingSource, /loadRealAvailability\(appointments\)/);
  assert.match(bookingSource, /השעה שבחרתם נתפסה כעת/);
  assert.match(portalSource, /appointments=\{appointments\}/);
});

test("VetBot uses the site typography and the application canvas keeps blue contrast", () => {
  assert.match(vetbotDrawerSource, /myvet-vetbot/);
  assert.match(themeSource, /\.myvet-vetbot[\s\S]*font-family:\s*"Heebo"/);
  assert.match(themeSource, /--background:\s*#eef6ff/);
  assert.match(themeSource, /linear-gradient\(180deg, #eaf4ff/);
});

test("Appointment urgency offers only normal or emergency", () => {
  assert.match(newAppointmentSource, /<option value="normal">/);
  assert.match(newAppointmentSource, /<option value="urgent">/);
  assert.doesNotMatch(newAppointmentSource, /<option value="high">/);
});

test("Portal demo payments settle only through an owner-authorized server RPC", () => {
  const handler = portalSource.match(/const handleDemoPaymentConfirm[\s\S]*?\n  };/)?.[0] || "";
  assert.ok(handler.length > 0);
  assert.doesNotMatch(handler, /from\("payments"\)/);
  assert.match(handler, /rpc\("myvet_owner_settle_demo_payment"/);
  assert.match(handler, /תשלום הדגמה/);
  assert.match(paymentSettlementMigration, /myvet_owner_settle_demo_payment/);
  assert.match(paymentSettlementMigration, /myvet_owner_matches\(target_payment\.owner_id\)/);
  assert.match(paymentSettlementMigration, /verified payment-provider webhook/i);
  assert.match(paymentMethodFixMigration, /payment_method = 'credit'/);
  assert.match(paymentMethodFixMigration, /'portal_demo'.*'owner_portal_demo'/s);
  assert.doesNotMatch(paymentMethodFixMigration, /set status = 'paid',[\s\S]*payment_method = 'portal_demo'/);
});

test("VetBot requests use the central gateway while the legacy call remains rollback-only", () => {
  assert.match(edgeFunction, /runVetBotGateway\(\{/);
  assert.match(edgeFunction, /isAiGatewayEnabled\(runtimeEnv\)[\s\S]*runVetBotGateway[\s\S]*callGeminiLegacy/);
  assert.match(aiGateway, /new GeminiProviderAdapter/);
  assert.match(aiGateway, /protectPayload/);
  assert.match(aiSchemas, /validateVetBotRequestBody/);
  assert.match(aiSchemas, /validateVetBotOutput/);
  assert.match(aiFeatures, /AI_VETBOT_APPOINTMENT_ACTIONS_ENABLED/);
  assert.match(edgeFunction, /isAiGatewayEnabled\(runtimeEnv\)/);
  assert.match(edgeFunction, /isAiCapabilityEnabled\("vetbot\.general", runtimeEnv\)/);
  assert.match(edgeFunction, /legacy-unversioned/);
});

test("Staff cash collection is server-authorized and calculates change", () => {
  assert.match(paymentSettlementMigration, /myvet_staff_settle_payment/);
  assert.match(paymentSettlementMigration, /myvet_is_active_staff\(\)/);
  assert.match(paymentSettlementMigration, /calculated_change := tendered_amount - target_payment\.amount/);
  assert.match(paymentSettlementMigration, /payment_transactions/);
});

test("Appointment live refresh is published and duplicate error toasts are deduplicated", () => {
  assert.match(paymentSettlementMigration, /alter publication supabase_realtime add table/);
  assert.match(appointmentStoreSource, /refreshInFlightRef/);
  assert.match(appointmentStoreSource, /id: "appointments-cloud-load"/);
  assert.match(appointmentStoreSource, /CHANNEL_ERROR/);
});

test("Vaccination scanner connects the camera after the video element renders", () => {
  const startScanner = vaccinationSource.match(/async function startScanner\(\)[\s\S]*?\n  }/)?.[0] || "";
  assert.match(startScanner, /getUserMedia/);
  assert.doesNotMatch(startScanner, /if \(!window\.BarcodeDetector\)/);
  assert.match(vaccinationSource, /video\.srcObject = streamRef\.current/);
  assert.match(vaccinationSource, /autoPlay muted playsInline/);
});

test("Dashboard appointments open the selected animal medical record", () => {
  assert.match(dashboardSource, /navigate\(`\/patients\?selected=\$\{appointment\.petId\}`\)/);
});

test("Medical images use expiring signed URLs and private storage", () => {
  assert.doesNotMatch(vaccinationSource, /getPublicUrl/);
  assert.match(vaccinationSource, /createSignedUrl/);
  assert.match(rlsMigration, /set public = false/);
  assert.match(rlsMigration, /myvet_owner_documents_select/);
});
