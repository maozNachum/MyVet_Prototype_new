-- Feature rollback only. Run after rolling application code back.
-- No appointments, clinic hours or booking blocks are deleted.

drop trigger if exists a_myvet_guard_appointment_window_capacity on public.appointments;
drop function if exists private.myvet_guard_appointment_window_capacity();
