-- IMPORTANT: roll back the Frontend before this SQL file. Keep the current
-- Edge compatibility executor deployed until a separately reviewed fallback
-- is available; the legacy executor can hard-delete appointments.
-- Feature rollback only. No appointments or medical data are deleted.
-- Cancelled rows remain cancelled so historical information is preserved.

revoke all on function public.myvet_execute_vetbot_action(uuid) from authenticated, service_role;
-- myvet_execute_vetbot_action_v2 intentionally remains available. The safe
-- owner-booking RPC is preserved below; staff booking and all reschedule/cancel
-- appointment actions fail closed once their RPCs are removed. Non-appointment
-- actions can still delegate internally.

-- Owner UPDATE/DELETE policies intentionally stay removed. Restoring the old
-- browser DELETE path would reintroduce hard deletion of appointment history.
-- In a rollback, owner reschedule/cancel therefore fail closed until a safe
-- compatibility RPC is deployed.
drop policy if exists myvet_owner_appointments_update on public.appointments;
drop policy if exists myvet_owner_appointments_delete on public.appointments;

-- Do not restore authenticated DELETE. A feature rollback must not reopen hard
-- deletion of appointment history for staff or owners.
revoke delete on table public.appointments from authenticated;

drop trigger if exists a_myvet_guard_appointment_resource_conflict on public.appointments;
drop function if exists private.myvet_guard_appointment_resource_conflict();
drop function if exists public.myvet_staff_book_appointment(bigint, timestamptz, timestamptz, text, text, text, text, text, text, text);
drop function if exists public.myvet_staff_reschedule_appointment(bigint, timestamptz, timestamptz);
drop function if exists public.myvet_staff_cancel_appointment(bigint);
drop function if exists public.myvet_staff_update_appointment(bigint, timestamptz, timestamptz, text, text, text, text, text, text, text);
drop function if exists public.myvet_owner_reschedule_appointment(bigint, timestamptz, timestamptz);
drop function if exists public.myvet_owner_cancel_appointment(bigint);

-- myvet_slot_is_bookable intentionally remains cancellation-aware. Reverting
-- that behavior would make preserved cancelled rows consume availability.
-- The compatible owner-booking RPC also keeps its safer clinic-day lock.
