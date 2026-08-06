-- Atomic staff appointment creation.
-- This migration is additive and does not change the owner or VetBot booking flows.
-- The browser cannot select clinic_id; it is derived from the authenticated staff member.

create or replace function public.myvet_staff_book_appointment(
  requested_pet_id bigint,
  requested_start timestamptz,
  requested_end timestamptz,
  requested_department text,
  requested_vet_name text,
  requested_room text,
  requested_type text,
  requested_mode text,
  requested_color text,
  requested_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid := private.myvet_current_clinic_id();
  starts_local timestamp;
  ends_local timestamp;
  normalized_department text := btrim(coalesce(requested_department, ''));
  normalized_vet text := btrim(coalesce(requested_vet_name, ''));
  normalized_room text := btrim(coalesce(requested_room, ''));
  normalized_type text := btrim(coalesce(requested_type, ''));
  created_id bigint;
begin
  if (select auth.uid()) is null
    or target_clinic_id is null
    or not private.myvet_is_clinic_staff(target_clinic_id, null) then
    raise exception 'STAFF_BOOKING_NOT_AUTHORIZED';
  end if;

  if requested_pet_id is null or not exists (
    select 1
    from public.patients as pet
    where pet.pet_id = requested_pet_id
      and pet.clinic_id = target_clinic_id
  ) then
    raise exception 'PATIENT_NOT_IN_CLINIC';
  end if;

  if requested_start is null or requested_end is null or requested_end <= requested_start then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;
  if requested_start <= now() then raise exception 'APPOINTMENT_NOT_IN_FUTURE'; end if;
  if requested_mode is null or requested_mode not in ('physical', 'video') then
    raise exception 'INVALID_APPOINTMENT_MODE';
  end if;
  if char_length(normalized_department) < 1 or char_length(normalized_department) > 80 then
    raise exception 'INVALID_DEPARTMENT';
  end if;
  if char_length(normalized_vet) < 1 or char_length(normalized_vet) > 120 then
    raise exception 'INVALID_VET';
  end if;
  if requested_mode = 'physical' and (char_length(normalized_room) < 1 or char_length(normalized_room) > 80) then
    raise exception 'INVALID_ROOM';
  end if;
  if char_length(normalized_type) < 1 or char_length(normalized_type) > 120 then
    raise exception 'INVALID_APPOINTMENT_TYPE';
  end if;
  if char_length(coalesce(requested_notes, '')) > 1500 then raise exception 'NOTES_TOO_LONG'; end if;

  starts_local := requested_start at time zone 'Asia/Jerusalem';
  ends_local := requested_end at time zone 'Asia/Jerusalem';
  if starts_local::date <> ends_local::date then raise exception 'INVALID_APPOINTMENT_WINDOW'; end if;

  -- Match the owner-booking lock for the common fixed-slot case, then take a
  -- clinic/day lock so parallel staff requests share one check-and-insert gate.
  perform pg_advisory_xact_lock(
    hashtextextended(target_clinic_id::text || ':' || requested_start::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(target_clinic_id::text || ':' || starts_local::date::text, 0)
  );

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.clinic_id = target_clinic_id
      and appointment.start_time < requested_end
      and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > requested_start
      and lower(btrim(coalesce(appointment.vet_name, ''))) = lower(normalized_vet)
  ) then
    raise exception 'VET_UNAVAILABLE';
  end if;

  if requested_mode = 'physical' and exists (
    select 1
    from public.appointments as appointment
    where appointment.clinic_id = target_clinic_id
      and appointment.start_time < requested_end
      and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > requested_start
      and lower(btrim(coalesce(appointment.room, ''))) = lower(normalized_room)
  ) then
    raise exception 'ROOM_UNAVAILABLE';
  end if;

  insert into public.appointments (
    clinic_id,
    pet_id,
    start_time,
    end_time,
    department,
    vet_name,
    room,
    appointment_type,
    appointment_mode,
    color,
    notes
  ) values (
    target_clinic_id,
    requested_pet_id,
    requested_start,
    requested_end,
    normalized_department,
    normalized_vet,
    case when requested_mode = 'video' then 'דיגיטל' else normalized_room end,
    normalized_type,
    requested_mode,
    case when requested_color = 'red' then 'red' else 'blue' end,
    nullif(btrim(coalesce(requested_notes, '')), '')
  )
  returning appointment_id into created_id;

  return created_id;
end;
$$;

revoke all on function public.myvet_staff_book_appointment(
  bigint, timestamptz, timestamptz, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.myvet_staff_book_appointment(
  bigint, timestamptz, timestamptz, text, text, text, text, text, text, text
) to authenticated, service_role;

comment on function public.myvet_staff_book_appointment(
  bigint, timestamptz, timestamptz, text, text, text, text, text, text, text
) is 'Atomically creates a staff appointment after deriving clinic scope and validating the patient, vet and room availability.';
