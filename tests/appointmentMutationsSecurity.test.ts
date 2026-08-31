import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const atomicMigration = readFileSync("supabase/migrations/20260825191948_atomic_appointment_mutations.sql", "utf8");
const capacityMigration = readFileSync("supabase/migrations/20260826093922_enforce_staff_appointment_capacity.sql", "utf8");
const migration = `${atomicMigration}\n${capacityMigration}`;
const rollback = readFileSync("supabase/rollback/phase0/01_remove_atomic_appointment_mutations.sql", "utf8");
const capacityRollback = readFileSync("supabase/rollback/phase0/02_remove_staff_appointment_capacity_guard.sql", "utf8");
const service = readFileSync("src/services/appointmentMutations.ts", "utf8");
const store = readFileSync("src/app/data/AppointmentStore.tsx", "utf8");
const portal = readFileSync("src/app/pages/ClientPortal.tsx", "utf8");
const vetbotActions = readFileSync("supabase/functions/_shared/vetbotActions.ts", "utf8");
const dashboard = readFileSync("src/app/pages/Dashboard.tsx", "utf8");
const worklist = readFileSync("src/app/components/SmartWorklist.tsx", "utf8");
const aiContext = readFileSync("src/app/components/ai/aiContextBuilder.ts", "utf8");
const aiAssistant = readFileSync("supabase/functions/ai-assistant/index.ts", "utf8");

test("appointment RPCs derive identity and tenant context on the server", () => {
  assert.match(migration, /create or replace function public\.myvet_staff_book_appointment/);
  assert.match(migration, /create or replace function public\.myvet_owner_reschedule_appointment/);
  assert.match(migration, /create or replace function public\.myvet_owner_cancel_appointment/);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /private\.myvet_current_clinic_id\(\)/);
  assert.match(migration, /private\.myvet_is_clinic_staff\(target_clinic_id, null\)/);
  assert.match(migration, /owner\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(service, /clinic_id|owner_id|user_id|role/);
});

test("appointment scheduling is serialized and cancelled rows do not consume availability", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /booking_day_key := target_clinic_id::text/);
  assert.match(migration, /old_day_key := target\.clinic_id::text/);
  assert.match(migration, /new_day_key := target\.clinic_id::text/);
  assert.match(migration, /a_myvet_guard_appointment_resource_conflict/);
  assert.match(migration, /VET_ALREADY_BOOKED/);
  assert.match(migration, /ROOM_ALREADY_BOOKED/);
  assert.match(migration, /appointment\.status <> 'cancelled'/);
  assert.match(capacityMigration, /a_myvet_guard_appointment_window_capacity/);
  assert.match(capacityMigration, /active_count >= schedule_row\.max_bookings/);
  assert.match(capacityMigration, /clinic_booking_blocks/);
  assert.match(capacityMigration, /schedule_row\.opens_at/);
  assert.match(capacityRollback, /No appointments, clinic hours or booking blocks are deleted/);
});

test("owner cancellation is soft and direct owner mutations are removed", () => {
  const cancelFunction = migration.match(/create or replace function public\.myvet_owner_cancel_appointment[\s\S]*?\$\$;/i)?.[0] || "";
  assert.match(cancelFunction, /set status = 'cancelled'/);
  assert.doesNotMatch(cancelFunction, /delete from public\.appointments/);
  assert.match(migration, /drop policy if exists myvet_owner_appointments_update/);
  assert.match(migration, /drop policy if exists myvet_owner_appointments_delete/);
  assert.match(migration, /revoke delete on table public\.appointments from authenticated/);
  assert.match(rollback, /No appointments or medical data are deleted/);
  assert.doesNotMatch(rollback, /create policy myvet_owner_appointments_delete/);
  assert.match(rollback, /revoke delete on table public\.appointments from authenticated/);
  assert.match(rollback, /revoke all on function public\.myvet_execute_vetbot_action\(uuid\) from authenticated, service_role/);
  assert.doesNotMatch(rollback, /drop function if exists public\.myvet_execute_vetbot_action_v2/);
});

test("staff and owner UI mutations use the restricted RPC service", () => {
  assert.match(store, /bookStaffAppointment\(/);
  assert.match(store, /cancelAppointment\(by, id\)/);
  assert.match(store, /rescheduleAppointmentRpc\(by, id/);
  assert.match(store, /updateStaffAppointment\(/);
  assert.doesNotMatch(store, /\.update\(patch\)/);
  assert.match(portal, /rescheduleAppointment\("owner", rescheduleAppt\.id/);
  assert.match(portal, /cancelAppointment\("owner", cancelAppt\.id\)/);
  assert.match(portal, /appointment_mode, color, notes, status/);
  assert.match(portal, /\.neq\("status", "cancelled"\)/);
});

test("completed and cancelled appointments cannot be edited through the staff RPC", () => {
  const updateFunction = migration.match(/create or replace function public\.myvet_staff_update_appointment[\s\S]*?\$\$;/i)?.[0] || "";
  assert.match(updateFunction, /target\.status in \('completed', 'cancelled'\)/);
  assert.match(updateFunction, /APPOINTMENT_NOT_EDITABLE/);
});

test("cancelled appointments remain auditable in the schedule but leave active operational views", () => {
  assert.match(store, /const rows = appointmentRows \|\| \[\]/);
  assert.match(dashboard, /\.neq\("status", "cancelled"\)/);
  assert.match(worklist, /\.neq\("status", "cancelled"\)/);
  assert.match(aiContext, /\.neq\("status", "cancelled"\)/);
  assert.match(aiAssistant, /\.neq\("status", "cancelled"\)/);
  assert.match(vetbotActions, /\.neq\("status", "cancelled"\)/);
});

test("VetBot routes appointment actions through the hardened executor", () => {
  assert.match(migration, /create or replace function public\.myvet_execute_vetbot_action_v2/);
  assert.match(migration, /myvet_owner_book_appointment/);
  assert.match(migration, /myvet_staff_book_appointment/);
  assert.match(migration, /myvet_owner_reschedule_appointment/);
  assert.match(migration, /myvet_staff_reschedule_appointment/);
  assert.match(migration, /myvet_owner_cancel_appointment/);
  assert.match(migration, /myvet_staff_cancel_appointment/);
  assert.match(migration, /revoke all on function public\.myvet_execute_vetbot_action\(uuid\) from authenticated, service_role/);
  assert.match(vetbotActions, /myvet_execute_vetbot_action_v2/);
});

test("RPC privileges are explicit and unauthenticated roles cannot execute", () => {
  assert.match(migration, /revoke all on function public\.myvet_staff_book_appointment[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.myvet_staff_book_appointment[\s\S]*to authenticated/);
  assert.match(migration, /revoke all on function public\.myvet_execute_vetbot_action_v2\(uuid\) from public, anon/);
});
