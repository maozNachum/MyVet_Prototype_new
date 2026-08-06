-- Non-destructive rollback for 20260805213000_atomic_staff_appointment_booking.sql.
-- Existing appointments are intentionally preserved.

revoke all on function public.myvet_staff_book_appointment(
  bigint, timestamptz, timestamptz, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

drop function if exists public.myvet_staff_book_appointment(
  bigint, timestamptz, timestamptz, text, text, text, text, text, text, text
);
