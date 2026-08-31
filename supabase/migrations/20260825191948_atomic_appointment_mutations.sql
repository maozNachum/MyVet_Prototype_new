-- Phase 0 hardening: make appointment scheduling atomic and keep cancellations
-- as auditable status changes. This migration is additive and must be verified
-- on an isolated Supabase Preview before Production.

create or replace function public.myvet_slot_is_bookable(
  candidate_start timestamptz,
  candidate_end timestamptz,
  excluded_appointment_id bigint default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_clinic as (
    select private.myvet_current_clinic_id() as clinic_id
  ), local_slot as (
    select
      candidate_start at time zone 'Asia/Jerusalem' as starts_local,
      candidate_end at time zone 'Asia/Jerusalem' as ends_local
  ), schedule as (
    select hours.*
    from current_clinic
    cross join local_slot
    join public.clinic_booking_hours as hours
      on hours.clinic_id = current_clinic.clinic_id
     and hours.weekday = extract(dow from local_slot.starts_local)::smallint
  )
  select
    (select auth.uid()) is not null
    and schedule.clinic_id is not null
    and candidate_end > candidate_start
    and local_slot.starts_local::date = local_slot.ends_local::date
    and schedule.is_open
    and local_slot.starts_local::time >= schedule.opens_at
    and local_slot.ends_local::time <= schedule.closes_at
    and not exists (
      select 1
      from public.clinic_booking_blocks as block
      where block.clinic_id = schedule.clinic_id
        and block.block_date = local_slot.starts_local::date
        and (
          block.is_all_day
          or (local_slot.starts_local::time < block.ends_at and block.starts_at < local_slot.ends_local::time)
        )
    )
    and not exists (
      select 1
      from public.appointments as appointment
      where appointment.clinic_id = schedule.clinic_id
        and appointment.status <> 'cancelled'
        and appointment.start_time < candidate_end
        and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > candidate_start
        and (excluded_appointment_id is null or appointment.appointment_id <> excluded_appointment_id)
    )
    and (
      select count(*)
      from public.appointments as appointment
      where appointment.clinic_id = schedule.clinic_id
        and appointment.status <> 'cancelled'
        and (appointment.start_time at time zone 'Asia/Jerusalem')::date = local_slot.starts_local::date
        and (excluded_appointment_id is null or appointment.appointment_id <> excluded_appointment_id)
    ) < schedule.max_bookings
  from local_slot
  join schedule on true;
$$;

revoke all on function public.myvet_slot_is_bookable(timestamptz, timestamptz, bigint) from public, anon;
grant execute on function public.myvet_slot_is_bookable(timestamptz, timestamptz, bigint) to authenticated, service_role;

-- Keep owner booking compatible while serializing the entire clinic day. The
-- previous exact-start lock did not protect the daily capacity check when two
-- owners selected different times concurrently.
create or replace function public.myvet_owner_book_appointment(
  requested_pet_id bigint,
  requested_start timestamptz,
  requested_end timestamptz,
  requested_type text,
  requested_mode text,
  requested_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id bigint;
  target_clinic_id uuid;
  booking_day_key text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if requested_start is null or requested_end is null or requested_start <= now() or requested_end <= requested_start then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;

  select pet.clinic_id into target_clinic_id
  from public.patients as pet
  join public.owners as owner
    on owner.owner_id = pet.owner_id and owner.clinic_id = pet.clinic_id
  where pet.pet_id = requested_pet_id
    and owner.auth_user_id = (select auth.uid());

  if target_clinic_id is null then raise exception 'BOOKING_NOT_AUTHORIZED'; end if;
  if requested_mode not in ('physical', 'video') then raise exception 'INVALID_APPOINTMENT_MODE'; end if;
  if char_length(btrim(coalesce(requested_type, ''))) not between 1 and 120 then
    raise exception 'INVALID_APPOINTMENT_TYPE';
  end if;
  if char_length(coalesce(requested_notes, '')) > 1500 then raise exception 'NOTES_TOO_LONG'; end if;

  booking_day_key := target_clinic_id::text || ':' || ((requested_start at time zone 'Asia/Jerusalem')::date)::text;
  perform pg_advisory_xact_lock(hashtextextended(booking_day_key, 0));

  if not public.myvet_slot_is_bookable(requested_start, requested_end, null) then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  insert into public.appointments (
    clinic_id, pet_id, start_time, end_time, department, vet_name, room,
    appointment_type, appointment_mode, color, notes, status
  ) values (
    target_clinic_id, requested_pet_id, requested_start, requested_end, 'כללי',
    'טרם שובץ', case when requested_mode = 'video' then 'דיגיטל' else 'טרם שובץ' end,
    btrim(requested_type), requested_mode, 'blue', nullif(btrim(coalesce(requested_notes, '')), ''), 'scheduled'
  ) returning appointment_id into created_id;

  return created_id;
end;
$$;

revoke all on function public.myvet_owner_book_appointment(bigint, timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.myvet_owner_book_appointment(bigint, timestamptz, timestamptz, text, text, text) to authenticated, service_role;

create or replace function private.myvet_guard_appointment_resource_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_lock_key text;
  old_lock_key text;
  checks_vet boolean;
  checks_room boolean;
  conflicting_vet boolean;
  conflicting_room boolean;
begin
  if new.clinic_id is null or new.start_time is null or new.end_time is null or new.end_time <= new.start_time then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;

  if new.status = 'cancelled' then
    return new;
  end if;

  new_lock_key := new.clinic_id::text || ':' || ((new.start_time at time zone 'Asia/Jerusalem')::date)::text;
  if tg_op = 'UPDATE' then
    old_lock_key := old.clinic_id::text || ':' || ((old.start_time at time zone 'Asia/Jerusalem')::date)::text;
  end if;

  if old_lock_key is not null and old_lock_key <> new_lock_key and old_lock_key < new_lock_key then
    perform pg_advisory_xact_lock(hashtextextended(old_lock_key, 0));
    perform pg_advisory_xact_lock(hashtextextended(new_lock_key, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(new_lock_key, 0));
    if old_lock_key is not null and old_lock_key <> new_lock_key then
      perform pg_advisory_xact_lock(hashtextextended(old_lock_key, 0));
    end if;
  end if;

  checks_vet := nullif(btrim(coalesce(new.vet_name, '')), '') is not null
    and position('טרם' in coalesce(new.vet_name, '')) = 0;
  checks_room := new.appointment_mode = 'physical'
    and nullif(btrim(coalesce(new.room, '')), '') is not null
    and btrim(new.room) not in ('-', '—')
    and position('טרם' in coalesce(new.room, '')) = 0;

  if checks_vet then
    select exists (
      select 1
      from public.appointments as appointment
      where appointment.clinic_id = new.clinic_id
        and appointment.status <> 'cancelled'
        and (new.appointment_id is null or appointment.appointment_id <> new.appointment_id)
        and appointment.start_time < new.end_time
        and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > new.start_time
        and btrim(coalesce(appointment.vet_name, '')) = btrim(new.vet_name)
    ) into conflicting_vet;
  end if;

  if conflicting_vet then
    raise exception 'VET_ALREADY_BOOKED';
  end if;

  if checks_room then
    select exists (
      select 1
      from public.appointments as appointment
      where appointment.clinic_id = new.clinic_id
        and appointment.status <> 'cancelled'
        and appointment.appointment_mode = 'physical'
        and (new.appointment_id is null or appointment.appointment_id <> new.appointment_id)
        and appointment.start_time < new.end_time
        and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > new.start_time
        and btrim(coalesce(appointment.room, '')) = btrim(new.room)
    ) into conflicting_room;
  end if;

  if conflicting_room then
    raise exception 'ROOM_ALREADY_BOOKED';
  end if;

  return new;
end;
$$;

revoke all on function private.myvet_guard_appointment_resource_conflict() from public, anon, authenticated, service_role;

drop trigger if exists a_myvet_guard_appointment_resource_conflict on public.appointments;
create trigger a_myvet_guard_appointment_resource_conflict
before insert or update of clinic_id, start_time, end_time, vet_name, room, appointment_mode, status
on public.appointments
for each row execute function private.myvet_guard_appointment_resource_conflict();

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
  created_id bigint;
begin
  if (select auth.uid()) is null
     or target_clinic_id is null
     or not private.myvet_is_clinic_staff(target_clinic_id, null) then
    raise exception 'STAFF_REQUIRED';
  end if;
  if requested_start is null or requested_end is null or requested_start <= now() or requested_end <= requested_start then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;
  if requested_mode not in ('physical', 'video') then raise exception 'INVALID_APPOINTMENT_MODE'; end if;
  if char_length(btrim(coalesce(requested_type, ''))) not between 1 and 120 then raise exception 'INVALID_APPOINTMENT_TYPE'; end if;
  if char_length(coalesce(requested_department, '')) > 80
     or char_length(coalesce(requested_vet_name, '')) > 120
     or char_length(coalesce(requested_room, '')) > 80
     or char_length(coalesce(requested_color, '')) > 32
     or char_length(coalesce(requested_notes, '')) > 1500 then
    raise exception 'INVALID_APPOINTMENT_DETAILS';
  end if;
  if not exists (
    select 1 from public.patients
    where clinic_id = target_clinic_id and pet_id = requested_pet_id
  ) then
    raise exception 'PET_NOT_FOUND';
  end if;

  insert into public.appointments (
    clinic_id, pet_id, start_time, end_time, department, vet_name, room,
    appointment_type, appointment_mode, color, notes, status
  ) values (
    target_clinic_id,
    requested_pet_id,
    requested_start,
    requested_end,
    coalesce(nullif(btrim(requested_department), ''), 'כללי'),
    coalesce(nullif(btrim(requested_vet_name), ''), 'טרם שובץ'),
    coalesce(nullif(btrim(requested_room), ''), case when requested_mode = 'video' then 'דיגיטל' else '—' end),
    btrim(requested_type),
    requested_mode,
    coalesce(nullif(btrim(requested_color), ''), 'blue'),
    nullif(btrim(coalesce(requested_notes, '')), ''),
    'scheduled'
  )
  returning appointment_id into created_id;

  return created_id;
end;
$$;

create or replace function public.myvet_staff_reschedule_appointment(
  requested_appointment_id bigint,
  requested_start timestamptz,
  requested_end timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid := private.myvet_current_clinic_id();
  target public.appointments%rowtype;
begin
  if (select auth.uid()) is null
     or target_clinic_id is null
     or not private.myvet_is_clinic_staff(target_clinic_id, null) then
    raise exception 'STAFF_REQUIRED';
  end if;
  if requested_start is null or requested_end is null or requested_start <= now() or requested_end <= requested_start then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;

  select * into target
  from public.appointments
  where clinic_id = target_clinic_id and appointment_id = requested_appointment_id
  for update;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if target.status in ('completed', 'cancelled') then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE'; end if;

  update public.appointments
  set start_time = requested_start, end_time = requested_end
  where clinic_id = target_clinic_id and appointment_id = requested_appointment_id;

  return requested_appointment_id;
end;
$$;

create or replace function public.myvet_staff_cancel_appointment(requested_appointment_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid := private.myvet_current_clinic_id();
  current_status text;
begin
  if (select auth.uid()) is null
     or target_clinic_id is null
     or not private.myvet_is_clinic_staff(target_clinic_id, null) then
    raise exception 'STAFF_REQUIRED';
  end if;

  select status into current_status
  from public.appointments
  where clinic_id = target_clinic_id and appointment_id = requested_appointment_id
  for update;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if current_status = 'completed' then raise exception 'COMPLETED_APPOINTMENT_CANNOT_BE_CANCELLED'; end if;

  update public.appointments
  set status = 'cancelled'
  where clinic_id = target_clinic_id and appointment_id = requested_appointment_id;

  return requested_appointment_id;
end;
$$;

create or replace function public.myvet_staff_update_appointment(
  requested_appointment_id bigint,
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
  target public.appointments%rowtype;
begin
  if (select auth.uid()) is null
     or target_clinic_id is null
     or not private.myvet_is_clinic_staff(target_clinic_id, null) then
    raise exception 'STAFF_REQUIRED';
  end if;
  if requested_start is null or requested_end is null or requested_end <= requested_start then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;
  if requested_mode not in ('physical', 'video') then raise exception 'INVALID_APPOINTMENT_MODE'; end if;
  if char_length(btrim(coalesce(requested_type, ''))) not between 1 and 120 then raise exception 'INVALID_APPOINTMENT_TYPE'; end if;
  if char_length(coalesce(requested_department, '')) > 80
     or char_length(coalesce(requested_vet_name, '')) > 120
     or char_length(coalesce(requested_room, '')) > 80
     or char_length(coalesce(requested_color, '')) > 32
     or char_length(coalesce(requested_notes, '')) > 1500 then
    raise exception 'INVALID_APPOINTMENT_DETAILS';
  end if;

  select * into target
  from public.appointments
  where clinic_id = target_clinic_id and appointment_id = requested_appointment_id
  for update;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if target.status in ('completed', 'cancelled') then raise exception 'APPOINTMENT_NOT_EDITABLE'; end if;

  update public.appointments
  set start_time = requested_start,
      end_time = requested_end,
      department = coalesce(nullif(btrim(requested_department), ''), 'כללי'),
      vet_name = coalesce(nullif(btrim(requested_vet_name), ''), 'טרם שובץ'),
      room = coalesce(nullif(btrim(requested_room), ''), case when requested_mode = 'video' then 'דיגיטל' else '—' end),
      appointment_type = btrim(requested_type),
      appointment_mode = requested_mode,
      color = coalesce(nullif(btrim(requested_color), ''), 'blue'),
      notes = nullif(btrim(coalesce(requested_notes, '')), '')
  where clinic_id = target_clinic_id and appointment_id = requested_appointment_id;

  return requested_appointment_id;
end;
$$;

create or replace function public.myvet_owner_reschedule_appointment(
  requested_appointment_id bigint,
  requested_start timestamptz,
  requested_end timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.appointments%rowtype;
  old_day_key text;
  new_day_key text;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if requested_start is null or requested_end is null or requested_start <= now() or requested_end <= requested_start then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;

  select appointment.* into target
  from public.appointments as appointment
  join public.patients as pet
    on pet.clinic_id = appointment.clinic_id and pet.pet_id = appointment.pet_id
  join public.owners as owner
    on owner.clinic_id = pet.clinic_id and owner.owner_id = pet.owner_id
  where appointment.appointment_id = requested_appointment_id
    and owner.auth_user_id = (select auth.uid())
  for update of appointment;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if target.status <> 'scheduled' then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE'; end if;

  old_day_key := target.clinic_id::text || ':' || ((target.start_time at time zone 'Asia/Jerusalem')::date)::text;
  new_day_key := target.clinic_id::text || ':' || ((requested_start at time zone 'Asia/Jerusalem')::date)::text;
  if old_day_key <> new_day_key and old_day_key < new_day_key then
    perform pg_advisory_xact_lock(hashtextextended(old_day_key, 0));
    perform pg_advisory_xact_lock(hashtextextended(new_day_key, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(new_day_key, 0));
    if old_day_key <> new_day_key then
      perform pg_advisory_xact_lock(hashtextextended(old_day_key, 0));
    end if;
  end if;

  if not public.myvet_slot_is_bookable(requested_start, requested_end, requested_appointment_id) then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  update public.appointments
  set start_time = requested_start, end_time = requested_end
  where clinic_id = target.clinic_id and appointment_id = target.appointment_id;

  return requested_appointment_id;
end;
$$;

create or replace function public.myvet_owner_cancel_appointment(requested_appointment_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.appointments%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;

  select appointment.* into target
  from public.appointments as appointment
  join public.patients as pet
    on pet.clinic_id = appointment.clinic_id and pet.pet_id = appointment.pet_id
  join public.owners as owner
    on owner.clinic_id = pet.clinic_id and owner.owner_id = pet.owner_id
  where appointment.appointment_id = requested_appointment_id
    and owner.auth_user_id = (select auth.uid())
  for update of appointment;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if target.status <> 'scheduled' then raise exception 'APPOINTMENT_NOT_CANCELLABLE'; end if;

  update public.appointments
  set status = 'cancelled'
  where clinic_id = target.clinic_id and appointment_id = target.appointment_id;

  return requested_appointment_id;
end;
$$;

revoke all on function public.myvet_staff_book_appointment(bigint, timestamptz, timestamptz, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.myvet_staff_reschedule_appointment(bigint, timestamptz, timestamptz) from public, anon;
revoke all on function public.myvet_staff_cancel_appointment(bigint) from public, anon;
revoke all on function public.myvet_staff_update_appointment(bigint, timestamptz, timestamptz, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.myvet_owner_reschedule_appointment(bigint, timestamptz, timestamptz) from public, anon;
revoke all on function public.myvet_owner_cancel_appointment(bigint) from public, anon;
grant execute on function public.myvet_staff_book_appointment(bigint, timestamptz, timestamptz, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.myvet_staff_reschedule_appointment(bigint, timestamptz, timestamptz) to authenticated;
grant execute on function public.myvet_staff_cancel_appointment(bigint) to authenticated;
grant execute on function public.myvet_staff_update_appointment(bigint, timestamptz, timestamptz, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.myvet_owner_reschedule_appointment(bigint, timestamptz, timestamptz) to authenticated;
grant execute on function public.myvet_owner_cancel_appointment(bigint) to authenticated;

-- Owner mutations must use the field-restricted RPCs above. Staff keeps its
-- tenant-scoped policy for operational management.
drop policy if exists myvet_owner_appointments_update on public.appointments;
drop policy if exists myvet_owner_appointments_delete on public.appointments;

-- Appointment history is audit data. Authenticated browser clients, including
-- staff covered by a legacy FOR ALL policy, must cancel through the RPCs above
-- instead of hard-deleting rows through the Data API.
revoke delete on table public.appointments from authenticated;

create or replace function public.myvet_execute_vetbot_action_v2(requested_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  created_id bigint;
  action_result jsonb := '{}'::jsonb;
  start_value timestamptz;
  end_value timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = (select auth.uid());

  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if request_row.action_type not in ('book_appointment', 'reschedule_appointment', 'cancel_appointment') then
    return public.myvet_execute_vetbot_action(requested_action_id);
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = (select auth.uid())
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = (select auth.uid())
  for update;

  if request_row.status <> 'pending' then raise exception 'ACTION_NOT_PENDING'; end if;
  if request_row.expires_at <= now() then raise exception 'ACTION_EXPIRED'; end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
  limit 1;
  if actor_current_role is null and exists (
    select 1 from public.owners where auth_user_id = (select auth.uid())
  ) then actor_current_role := 'owner'; end if;
  if actor_current_role is null or actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    if request_row.action_type = 'book_appointment' then
      start_value := (request_row.payload ->> 'start_time')::timestamptz;
      end_value := (request_row.payload ->> 'end_time')::timestamptz;
      if actor_current_role = 'owner' then
        created_id := public.myvet_owner_book_appointment(
          (request_row.payload ->> 'pet_id')::bigint,
          start_value,
          end_value,
          request_row.payload ->> 'appointment_type',
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          request_row.payload ->> 'notes'
        );
      else
        created_id := public.myvet_staff_book_appointment(
          (request_row.payload ->> 'pet_id')::bigint,
          start_value,
          end_value,
          request_row.payload ->> 'department',
          request_row.payload ->> 'vet_name',
          request_row.payload ->> 'room',
          request_row.payload ->> 'appointment_type',
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          case when request_row.payload ->> 'urgency' = 'urgent' then 'red' else 'blue' end,
          request_row.payload ->> 'notes'
        );
      end if;
      action_result := jsonb_build_object('appointment_id', created_id);
    elsif request_row.action_type = 'reschedule_appointment' then
      start_value := (request_row.payload ->> 'start_time')::timestamptz;
      end_value := (request_row.payload ->> 'end_time')::timestamptz;
      if actor_current_role = 'owner' then
        created_id := public.myvet_owner_reschedule_appointment(
          (request_row.payload ->> 'appointment_id')::bigint, start_value, end_value
        );
      else
        created_id := public.myvet_staff_reschedule_appointment(
          (request_row.payload ->> 'appointment_id')::bigint, start_value, end_value
        );
      end if;
      action_result := jsonb_build_object('appointment_id', created_id);
    else
      if actor_current_role = 'owner' then
        created_id := public.myvet_owner_cancel_appointment((request_row.payload ->> 'appointment_id')::bigint);
      else
        created_id := public.myvet_staff_cancel_appointment((request_row.payload ->> 'appointment_id')::bigint);
      end if;
      action_result := jsonb_build_object('appointment_id', created_id, 'status', 'cancelled');
    end if;

    update public.vetbot_action_requests
    set status = 'executed', result = action_result, confirmed_at = now(), executed_at = now(), error_code = null
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', true, 'action_type', request_row.action_type, 'result', action_result);
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', false, 'action_type', request_row.action_type, 'error_code', left(sqlerrm, 120));
  end;
end;
$$;

revoke all on function public.myvet_execute_vetbot_action_v2(uuid) from public, anon;
grant execute on function public.myvet_execute_vetbot_action_v2(uuid) to authenticated, service_role;
revoke all on function public.myvet_execute_vetbot_action(uuid) from authenticated, service_role;

comment on function public.myvet_execute_vetbot_action_v2(uuid) is
  'Executes appointment actions through atomic, tenant-scoped RPCs and delegates other approved actions to the legacy executor.';
