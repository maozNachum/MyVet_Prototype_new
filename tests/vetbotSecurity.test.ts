import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edgeFunction = readFileSync("supabase/functions/ai-assistant/index.ts", "utf8");
const corsSource = readFileSync("supabase/functions/_shared/cors.ts", "utf8");
const migration = readFileSync("supabase/migrations/202607150001_vetbot_privacy.sql", "utf8");
const rlsMigration = readFileSync("supabase/migrations/202607150002_myvet_rls_hardening.sql", "utf8");
const availabilityMigration = readFileSync("supabase/migrations/20260716145453_clinic_booking_availability.sql", "utf8");
const paymentSettlementMigration = readFileSync("supabase/migrations/20260716181935_reliable_realtime_and_payment_settlement.sql", "utf8");
const paymentMethodFixMigration = readFileSync("supabase/migrations/20260716200815_fix_portal_demo_payment_method.sql", "utf8");
const actionMigration = readFileSync("supabase/migrations/20260716194751_vetbot_action_orchestration.sql", "utf8");
const appointmentStatusMigration = readFileSync("supabase/migrations/20260805185316_appointment_status_workflow.sql", "utf8");
const atomicStaffBookingMigration = readFileSync("supabase/migrations/20260805213000_atomic_staff_appointment_booking.sql", "utf8");
const actionEngine = readFileSync("supabase/functions/_shared/vetbotActions.ts", "utf8");
const aiGateway = readFileSync("supabase/functions/_shared/ai/gateway.ts", "utf8");
const aiSchemas = readFileSync("supabase/functions/_shared/ai/schemas.ts", "utf8");
const aiFeatures = readFileSync("supabase/functions/_shared/ai/featureFlags.ts", "utf8");
const portalSource = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");
const bookingSource = readFileSync("src/app/components/OwnerBookAppointment.tsx", "utf8");
const newAppointmentSource = readFileSync("src/app/pages/NewAppointment.tsx", "utf8");
const vaccinationSource = readFileSync("src/app/components/VaccinationBook.tsx", "utf8");
const labOrderModalSource = readFileSync("src/app/components/LabOrderModal.tsx", "utf8");
const appointmentStoreSource = readFileSync("src/app/data/AppointmentStore.tsx", "utf8");
const dashboardSource = readFileSync("src/app/pages/Dashboard.tsx", "utf8");
const appointmentScheduleSource = readFileSync("src/app/pages/AppointmentSchedule.tsx", "utf8");
const weeklyScheduleSource = readFileSync("src/app/components/schedule/WeeklyView.tsx", "utf8");
const dailyScheduleSource = readFileSync("src/app/components/schedule/DailyView.tsx", "utf8");
const appointmentActionsSource = readFileSync("src/app/hooks/useAppointmentActions.ts", "utf8");
const appointmentActionModalSource = readFileSync("src/app/components/schedule/AppointmentActionModal.tsx", "utf8");
const dayAppointmentsModalSource = readFileSync("src/app/components/schedule/CalendarSidebar.tsx", "utf8");
const departmentFilterSource = readFileSync("src/app/components/schedule/DeptFilterPanel.tsx", "utf8");
const treatmentModalSource = readFileSync("src/app/components/TreatmentModal.tsx", "utf8");
const medicalStoreSource = readFileSync("src/app/data/MedicalStore.tsx", "utf8");
const vetbotDrawerSource = readFileSync("src/app/components/ai/AiAssistantDrawer.tsx", "utf8");
const vetbotAnswerSource = readFileSync("src/app/components/ai/AiStructuredAnswer.tsx", "utf8");
const vetbotClientSource = readFileSync("src/app/components/ai/aiClient.ts", "utf8");
const themeSource = readFileSync("src/styles/theme.css", "utf8");
const layoutSource = readFileSync("src/app/pages/Layout.tsx", "utf8");
const medicalReportsSource = readFileSync("src/app/components/ClientMedicalReports.tsx", "utf8");
const hospitalizationSource = readFileSync("src/app/pages/Hospitalizations.tsx", "utf8");
const reportMetricsSource = readFileSync("src/app/data/reportMetrics.ts", "utf8");
const clientComplianceSource = readFileSync("src/app/components/reports/ClientCompliance.tsx", "utf8");
const patientsSource = readFileSync("src/app/pages/Patients.tsx", "utf8");

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
  assert.match(edgeFunction, /היא עדיין לא בוצעה; יש לאשר אותה בכפתור/);
  assert.match(vetbotAnswerSource, /חסרים פרטים — טרם בוצע/);
  assert.match(vetbotAnswerSource, /ממתין לאישור — טרם בוצע/);
});

test("VetBot stops stalled browser requests and hides broken encoded output", () => {
  assert.match(vetbotClientSource, /VETBOT_RESPONSE_TIMEOUT_MS = 30_000/);
  assert.match(vetbotClientSource, /VETBOT_ACTION_TIMEOUT_MS = 20_000/);
  assert.match(vetbotClientSource, /VETBOT_CLIENT_TIMEOUT/);
  assert.match(vetbotClientSource, /looksLikeBrokenEncoding/);
  assert.match(vetbotClientSource, /VetBot החזיר תשובה שלא ניתן להציג בבטחה/);
  assert.match(vetbotClientSource, /actionPlan\?\.summary/);
});

test("Staff access rejection does not globally sign out an owner session", () => {
  assert.doesNotMatch(layoutSource, /catch\s*\{[\s\S]*supabase\.auth\.signOut\(\)/);
});

test("Owner medical documents are opened only with short-lived signed URLs", () => {
  assert.doesNotMatch(medicalReportsSource, /window\.open\(doc\.file_url/);
  assert.match(medicalReportsSource, /createSignedUrl\(doc\.file_path, 60 \* 5\)/);
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

test("Owner booking disables days with no server-approved availability", () => {
  assert.match(bookingSource, /const isUnavailable = day\.slots\.length === 0/);
  assert.match(bookingSource, /disabled=\{isUnavailable\}/);
  assert.match(bookingSource, /firstAvailable = nextWeek\.findIndex/);
  assert.match(bookingSource, /היום שנבחר אינו זמין לקביעת תורים/);
  assert.match(bookingSource, /לא זמין/);
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
  assert.match(appointmentStoreSource, /myvet:vetbot-action/);
  assert.match(appointmentStoreSource, /book_appointment.*reschedule_appointment.*cancel_appointment/s);
});

test("Vaccination scanner connects the camera and captures the label in the same view", () => {
  const startScanner = vaccinationSource.match(/async function startScanner\(\)[\s\S]*?\n  }/)?.[0] || "";
  assert.match(startScanner, /getUserMedia/);
  assert.doesNotMatch(startScanner, /if \(!window\.BarcodeDetector\)/);
  assert.match(vaccinationSource, /video\.srcObject = streamRef\.current/);
  assert.match(vaccinationSource, /autoPlay muted playsInline/);
  assert.match(vaccinationSource, /async function captureCameraPhoto\(\)/);
  assert.match(vaccinationSource, /context\.drawImage\(video/);
  assert.match(vaccinationSource, /לכידת תמונת מדבקת החיסון/);
  assert.match(vaccinationSource, /בחר קובץ מהמכשיר/);
  assert.doesNotMatch(vaccinationSource, /capture="environment"/);
});

test("Custom pending lab tests can be edited and removed before ordering", () => {
  assert.match(labOrderModalSource, /isCustom: boolean/);
  assert.match(labOrderModalSource, /finishEditingTest/);
  assert.match(labOrderModalSource, /\{isEditing \? "שמור" : "ערוך"\}/);
  assert.match(labOrderModalSource, /<Trash2[^>]*\/> מחק/);
  assert.match(labOrderModalSource, /כבר נבחרה בדיקה בשם הזה/);
  assert.match(labOrderModalSource, /useEffect\(\(\) => \{[\s\S]*setPendingTests\(\[\]\)[\s\S]*\}, \[isOpen, patientId\]\)/);
});

test("Reports collapse duplicate reminders and avoid orphan pet labels", () => {
  assert.match(reportMetricsSource, /export function dedupeReminders/);
  assert.match(clientComplianceSource, /dedupeReminders\(filtered\.reminders\)/);
  assert.match(reportMetricsSource, /"ללא חיה משויכת"/);
});

test("Hospitalization cards use the current patient owner", () => {
  assert.match(hospitalizationSource, /const ownerId = pet\?\.owner_id \|\| row\.owner_id \|\| ""/);
});

test("Patient list selects the tenant-safe owner relationship explicitly", () => {
  assert.match(patientsSource, /owner:owners!patients_clinic_owner_fkey/);
  assert.doesNotMatch(patientsSource, /owner:owners\s*\(/);
});

test("Dashboard keeps untreated overdue appointments visible and opens the pet record", () => {
  assert.match(dashboardSource, /\.from\("medical_visits"\)[\s\S]*\.select\("appointment_id"\)/);
  assert.match(dashboardSource, /const isOverdue = isPast && !appointment\.hasTreatment/);
  assert.match(dashboardSource, /טרם התחיל טיפול/);
  assert.doesNotMatch(dashboardSource, /isOverdueWithoutTreatment[\s\S]*setTreatmentPatient/);
  assert.match(dashboardSource, /navigate\(`\/patients\?selected=\$\{appointment\.petId\}`\)/);
  assert.match(treatmentModalSource, /showSuccessToast: false, appointmentId/);
  assert.match(medicalStoreSource, /appointment_id: options\.appointmentId \?\? null/);
});

test("Dashboard appointments still allow opening the selected animal medical record", () => {
  assert.match(dashboardSource, /navigate\(`\/patients\?selected=\$\{appointment\.petId\}`\)/);
});

test("Monthly calendar opens day appointments in an anchored popover instead of the sidebar", () => {
  assert.match(dayAppointmentsModalSource, /export function DayAppointmentsPopover/);
  assert.match(dayAppointmentsModalSource, /createPortal/);
  assert.match(dayAppointmentsModalSource, /role="dialog"/);
  assert.match(dayAppointmentsModalSource, /arrowPlacement/);
  assert.match(dayAppointmentsModalSource, /overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(dayAppointmentsModalSource, /onClick=\{onClose\} className="fixed inset-0/);
  assert.doesNotMatch(dayAppointmentsModalSource, />סגירה<\/button>/);
  assert.match(dayAppointmentsModalSource, /קביעת תור ליום זה/);
  assert.match(appointmentScheduleSource, /<DayAppointmentsPopover/);
  assert.match(appointmentScheduleSource, /anchor=\{dayPopoverAnchor\}/);
  assert.match(appointmentScheduleSource, /nav\.setSidebarOpen\(false\);[\s\S]*handleAppointmentAction\(appt, mode\)/);
  assert.doesNotMatch(appointmentScheduleSource, /Day detail sidebar/);
});

test("Schedule department filtering uses one multi-select dropdown above the calendar", () => {
  assert.match(appointmentScheduleSource, /grid w-full grid-cols-1 gap-3[\s\S]*חיפוש מהיר ביומן[\s\S]*<DeptFilterPanel[\s\S]*departmentCounts=\{departmentCounts\}/);
  assert.doesNotMatch(appointmentScheduleSource, /Right sidebar column[\s\S]*Department filter/);
  assert.match(departmentFilterSource, /aria-haspopup="listbox"/);
  assert.match(departmentFilterSource, /aria-multiselectable="true"/);
  assert.match(departmentFilterSource, /אפשר לבחור מספר מחלקות יחד/);
  assert.match(departmentFilterSource, /ביטול הסינון/);
  assert.match(departmentFilterSource, /filteredCount.*totalCount/);
});

test("Appointment status is persisted, staff-only and visible as text in the schedule", () => {
  assert.match(appointmentStatusMigration, /add column if not exists status text/);
  assert.match(appointmentStatusMigration, /scheduled.*arrived.*in_progress.*completed.*cancelled/);
  assert.match(appointmentStatusMigration, /myvet_is_active_staff/);
  assert.match(appointmentStatusMigration, /before update of status/);
  assert.match(appointmentStatusMigration, /revoke all on function public\.myvet_guard_appointment_status_update\(\) from public, anon/);
  assert.match(appointmentStoreSource, /updateAppointmentStatus/);
  assert.match(appointmentScheduleSource, /<AppointmentStatusFilter/);
  assert.match(dayAppointmentsModalSource, /getApptStatus\(appt\.status\)/);
});

test("Medical images use expiring signed URLs and private storage", () => {
  assert.doesNotMatch(vaccinationSource, /getPublicUrl/);
  assert.match(vaccinationSource, /createSignedUrl/);
  assert.match(rlsMigration, /set public = false/);
  assert.match(rlsMigration, /myvet_owner_documents_select/);
});

test("Staff appointment creation uses an atomic tenant-scoped RPC", () => {
  assert.match(appointmentStoreSource, /rpc\("myvet_staff_book_appointment"/);
  assert.match(atomicStaffBookingMigration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(atomicStaffBookingMigration, /private\.myvet_current_clinic_id\(\)/);
  assert.match(atomicStaffBookingMigration, /private\.myvet_is_clinic_staff\(target_clinic_id, null\)/);
  assert.match(atomicStaffBookingMigration, /pet\.clinic_id = target_clinic_id/);
  assert.match(atomicStaffBookingMigration, /pg_advisory_xact_lock/);
  assert.match(atomicStaffBookingMigration, /VET_UNAVAILABLE/);
  assert.match(atomicStaffBookingMigration, /ROOM_UNAVAILABLE/);
  assert.doesNotMatch(atomicStaffBookingMigration, /clinic_booking_hours|clinic_booking_blocks|max_bookings/);
  assert.match(atomicStaffBookingMigration, /revoke all on function public\.myvet_staff_book_appointment[\s\S]*from public, anon/);
  assert.doesNotMatch(atomicStaffBookingMigration, /requested_clinic_id/);
});

test("Appointment booking keeps a safe compatibility path and accurate portal errors", () => {
  assert.match(appointmentStoreSource, /isMissingStaffBookingRpc/);
  assert.match(appointmentStoreSource, /Backward compatibility until the additive migration is applied/);
  assert.match(portalSource, /appointment_type, appointment_mode, color/);
  assert.match(portalSource, /appointmentMode: row\.appointment_mode === "video"/);
  assert.match(bookingSource, /describeBookingError/);
  assert.match(bookingSource, /BOOKING_NOT_AUTHORIZED/);
  assert.match(bookingSource, /refreshAvailability: false/);
  assert.match(bookingSource, /הפרטים נשמרו ואפשר לנסות שוב/);
});

test("Staff appointment form validates phone, future time and exposes accessible errors", () => {
  assert.match(newAppointmentSource, /isValidIsraeliPhone/);
  assert.match(newAppointmentSource, /יש להזין מספר טלפון ישראלי תקין/);
  assert.match(newAppointmentSource, /יש לבחור מועד עתידי/);
  assert.match(newAppointmentSource, /role="alert" aria-live="assertive" tabIndex=\{-1\}/);
  assert.match(newAppointmentSource, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(newAppointmentSource, /תעודת זהות: \{selectedPatient\.ownerId\}/);
});

test("Schedule filters and free slots are clear without hover", () => {
  assert.match(appointmentScheduleSource, /visibleRange/);
  assert.match(appointmentScheduleSource, /מסננים פעילים:/);
  assert.match(appointmentScheduleSource, /איפוס הכול/);
  assert.match(appointmentScheduleSource, /mediaQuery\.matches[\s\S]*setViewMode\("daily"\)/);
  assert.doesNotMatch(weeklyScheduleSource, /group-hover:flex/);
  assert.doesNotMatch(dailyScheduleSource, /group-hover:flex/);
  assert.match(weeklyScheduleSource, /aria-label=\{`קבע תור ביום/);
  assert.match(dailyScheduleSource, /aria-label=\{`קבע תור בשעה/);
  assert.match(dailyScheduleSource, /hourAppts\.length > 0[\s\S]*תור נוסף/);
  assert.match(weeklyScheduleSource, /appts\.length > 0[\s\S]*תור נוסף/);
});

test("Appointment mutations prevent duplicate submission and keep portal state intact", () => {
  assert.match(appointmentActionsSource, /actionPending/);
  assert.match(appointmentActionsSource, /closeTimerRef/);
  assert.match(appointmentActionModalSource, /disabled=\{actionPending\}/);
  assert.match(portalSource, /appointmentMutationPending/);
  assert.match(bookingSource, /if \(isSaving\) return/);
  assert.match(bookingSource, /disabled=\{isSaving\}/);
  assert.match(appointmentStoreSource, /לא הצלחנו לבדוק את זמינות היומן/);
});
