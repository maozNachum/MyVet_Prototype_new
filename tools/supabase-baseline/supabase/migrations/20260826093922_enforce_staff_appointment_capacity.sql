-- Enforce clinic-controlled opening hours, blocks and daily capacity for every
-- appointment scheduling write. The atomic appointment RPC migration already
-- serializes clinic-day writes for resource conflicts; this guard makes the
-- schedule invariant apply equally to staff, owners and approved VetBot calls.

create or replace function private.myvet_guard_appointment_window_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_start timestamp;
  local_end timestamp;
  schedule_row public.clinic_booking_hours%rowtype;
  old_lock_key text;
  new_lock_key text;
  scheduling_changed boolean;
  active_count integer;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  scheduling_changed := tg_op = 'INSERT'
    or new.clinic_id is distinct from old.clinic_id
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time
    or (old.status = 'cancelled' and new.status <> 'cancelled');

  if not scheduling_changed then
    return new;
  end if;

  if new.clinic_id is null or new.start_time is null or new.end_time is null or new.end_time <= new.start_time then
    raise exception 'INVALID_APPOINTMENT_WINDOW';
  end if;

  local_start := new.start_time at time zone 'Asia/Jerusalem';
  local_end := new.end_time at time zone 'Asia/Jerusalem';
  if local_start::date <> local_end::date then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  new_lock_key := new.clinic_id::text || ':' || local_start::date::text;
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

  select hours.* into schedule_row
  from public.clinic_booking_hours as hours
  where hours.clinic_id = new.clinic_id
    and hours.weekday = extract(dow from local_start)::smallint;

  if not found
     or not schedule_row.is_open
     or local_start::time < schedule_row.opens_at
     or local_end::time > schedule_row.closes_at then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.clinic_booking_blocks as block
    where block.clinic_id = new.clinic_id
      and block.block_date = local_start::date
      and (
        block.is_all_day
        or (local_start::time < block.ends_at and block.starts_at < local_end::time)
      )
  ) then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  select count(*) into active_count
  from public.appointments as appointment
  where appointment.clinic_id = new.clinic_id
    and appointment.status <> 'cancelled'
    and (appointment.start_time at time zone 'Asia/Jerusalem')::date = local_start::date
    and (new.appointment_id is null or appointment.appointment_id <> new.appointment_id);

  if active_count >= schedule_row.max_bookings then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.myvet_guard_appointment_window_capacity() from public, anon, authenticated, service_role;

drop trigger if exists a_myvet_guard_appointment_window_capacity on public.appointments;
create trigger a_myvet_guard_appointment_window_capacity
before insert or update of clinic_id, start_time, end_time, status
on public.appointments
for each row execute function private.myvet_guard_appointment_window_capacity();

comment on function private.myvet_guard_appointment_window_capacity() is
  'Serializes clinic-day scheduling and enforces opening hours, blocks and daily capacity for active appointments.';
