-- Clinic-controlled owner booking availability.
-- Owners only receive computed free slots and cannot read staff settings.

create table if not exists public.clinic_booking_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  is_open boolean not null default true,
  opens_at time not null,
  closes_at time not null,
  slot_minutes smallint not null default 30 check (slot_minutes between 10 and 240),
  max_bookings smallint not null check (max_bookings between 0 and 200),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id),
  constraint clinic_booking_hours_valid_window check (
    (is_open and closes_at > opens_at and max_bookings > 0)
    or (not is_open and max_bookings = 0)
  )
);

insert into public.clinic_booking_hours (weekday, is_open, opens_at, closes_at, slot_minutes, max_bookings)
values
  (0, true,  '08:00', '17:00', 30, 18),
  (1, true,  '08:00', '17:00', 30, 18),
  (2, true,  '08:00', '17:00', 30, 18),
  (3, true,  '08:00', '17:00', 30, 18),
  (4, true,  '08:00', '17:00', 30, 18),
  (5, true,  '08:00', '14:00', 30, 12),
  (6, false, '08:00', '08:00', 30, 0)
on conflict (weekday) do nothing;

create table if not exists public.clinic_booking_blocks (
  block_id bigint generated always as identity primary key,
  block_date date not null,
  is_all_day boolean not null default false,
  starts_at time null,
  ends_at time null,
  reason text null check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id),
  constraint clinic_booking_blocks_valid_window check (
    (is_all_day and starts_at is null and ends_at is null)
    or (not is_all_day and starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);

create index if not exists clinic_booking_blocks_date_idx
  on public.clinic_booking_blocks (block_date);

alter table public.clinic_booking_hours enable row level security;
alter table public.clinic_booking_blocks enable row level security;

revoke all on public.clinic_booking_hours from anon;
revoke all on public.clinic_booking_blocks from anon;
grant select, insert, update, delete on public.clinic_booking_hours to authenticated;
grant select, insert, update, delete on public.clinic_booking_blocks to authenticated;
grant usage, select on sequence public.clinic_booking_blocks_block_id_seq to authenticated;

drop policy if exists "myvet_staff_booking_hours_all" on public.clinic_booking_hours;
create policy "myvet_staff_booking_hours_all"
  on public.clinic_booking_hours for all to authenticated
  using ((select public.myvet_is_active_staff()))
  with check ((select public.myvet_is_active_staff()));

drop policy if exists "myvet_staff_booking_blocks_all" on public.clinic_booking_blocks;
create policy "myvet_staff_booking_blocks_all"
  on public.clinic_booking_blocks for all to authenticated
  using ((select public.myvet_is_active_staff()))
  with check ((select public.myvet_is_active_staff()));

create or replace function public.myvet_slot_is_bookable(
  candidate_start timestamptz,
  candidate_end timestamptz,
  excluded_appointment_id bigint default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with local_slot as (
    select
      candidate_start at time zone 'Asia/Jerusalem' as starts_local,
      candidate_end at time zone 'Asia/Jerusalem' as ends_local
  ), schedule as (
    select hours.*
    from local_slot
    join public.clinic_booking_hours as hours
      on hours.weekday = extract(dow from local_slot.starts_local)::smallint
  )
  select
    auth.uid() is not null
    and candidate_end > candidate_start
    and local_slot.starts_local::date = local_slot.ends_local::date
    and schedule.is_open
    and local_slot.starts_local::time >= schedule.opens_at
    and local_slot.ends_local::time <= schedule.closes_at
    and not exists (
      select 1
      from public.clinic_booking_blocks as block
      where block.block_date = local_slot.starts_local::date
        and (
          block.is_all_day
          or (local_slot.starts_local::time < block.ends_at and block.starts_at < local_slot.ends_local::time)
        )
    )
    and not exists (
      select 1
      from public.appointments as appointment
      where appointment.start_time < candidate_end
        and coalesce(appointment.end_time, appointment.start_time + interval '30 minutes') > candidate_start
        and (excluded_appointment_id is null or appointment.appointment_id <> excluded_appointment_id)
    )
    and (
      select count(*)
      from public.appointments as appointment
      where (appointment.start_time at time zone 'Asia/Jerusalem')::date = local_slot.starts_local::date
        and (excluded_appointment_id is null or appointment.appointment_id <> excluded_appointment_id)
    ) < schedule.max_bookings
  from local_slot
  join schedule on true;
$$;

revoke all on function public.myvet_slot_is_bookable(timestamptz, timestamptz, bigint) from public;
grant execute on function public.myvet_slot_is_bookable(timestamptz, timestamptz, bigint) to authenticated, service_role;

create or replace function public.myvet_available_slots(range_start date, range_end date)
returns table(slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    (day_date + hours.opens_at + make_interval(mins => generated.slot_index * hours.slot_minutes)) at time zone 'Asia/Jerusalem' as slot_start,
    (day_date + hours.opens_at + make_interval(mins => (generated.slot_index + 1) * hours.slot_minutes)) at time zone 'Asia/Jerusalem' as slot_end
  from generate_series(range_start, range_end, interval '1 day') as series(day_value)
  cross join lateral (select series.day_value::date as day_date) as day
  join public.clinic_booking_hours as hours
    on hours.weekday = extract(dow from day.day_date)::smallint
  cross join lateral generate_series(
    0,
    greatest(0, floor(extract(epoch from (hours.closes_at - hours.opens_at)) / 60 / hours.slot_minutes)::integer - 1)
  ) as generated(slot_index)
  where auth.uid() is not null
    and range_end >= range_start
    and range_end - range_start <= 31
    and hours.is_open
    and public.myvet_slot_is_bookable(
      (day.day_date + hours.opens_at + make_interval(mins => generated.slot_index * hours.slot_minutes)) at time zone 'Asia/Jerusalem',
      (day.day_date + hours.opens_at + make_interval(mins => (generated.slot_index + 1) * hours.slot_minutes)) at time zone 'Asia/Jerusalem',
      null
    )
  order by slot_start;
$$;

revoke all on function public.myvet_available_slots(date, date) from public;
grant execute on function public.myvet_available_slots(date, date) to authenticated;

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
set search_path = public
as $$
declare
  created_id bigint;
begin
  if auth.uid() is null or not public.myvet_pet_owned(requested_pet_id::text) then
    raise exception 'BOOKING_NOT_AUTHORIZED';
  end if;

  if requested_mode not in ('physical', 'video') then
    raise exception 'INVALID_APPOINTMENT_MODE';
  end if;

  if char_length(coalesce(requested_type, '')) < 1 or char_length(requested_type) > 120 then
    raise exception 'INVALID_APPOINTMENT_TYPE';
  end if;

  if char_length(coalesce(requested_notes, '')) > 1500 then
    raise exception 'NOTES_TOO_LONG';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_start::text, 0));

  if not public.myvet_slot_is_bookable(requested_start, requested_end, null) then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  insert into public.appointments (
    pet_id, start_time, end_time, department, vet_name, room,
    appointment_type, appointment_mode, color, notes
  ) values (
    requested_pet_id,
    requested_start,
    requested_end,
    'כללי',
    'טרם שובץ',
    case when requested_mode = 'video' then 'דיגיטל' else 'טרם שובץ' end,
    requested_type,
    requested_mode,
    'blue',
    nullif(requested_notes, '')
  )
  returning appointment_id into created_id;

  return created_id;
end;
$$;

revoke all on function public.myvet_owner_book_appointment(bigint, timestamptz, timestamptz, text, text, text) from public;
grant execute on function public.myvet_owner_book_appointment(bigint, timestamptz, timestamptz, text, text, text) to authenticated;

-- Owner booking must go through the validated RPC above.
drop policy if exists "myvet_demo_select" on public.appointments;
drop policy if exists "myvet_demo_insert" on public.appointments;
drop policy if exists "myvet_demo_update" on public.appointments;
drop policy if exists "myvet_demo_delete" on public.appointments;
drop policy if exists "myvet_owner_appointments_insert" on public.appointments;
drop policy if exists "myvet_owner_appointments_update" on public.appointments;
create policy "myvet_owner_appointments_update" on public.appointments for update to authenticated
  using (public.myvet_pet_owned(pet_id::text))
  with check (
    public.myvet_pet_owned(pet_id::text)
    and public.myvet_slot_is_bookable(start_time, end_time, appointment_id)
  );

comment on table public.clinic_booking_hours is 'Staff-managed weekly owner booking hours and daily capacity.';
comment on table public.clinic_booking_blocks is 'Staff-managed all-day or partial booking closures.';
comment on function public.myvet_available_slots(date, date) is 'Returns free clinic slots only; no patient or appointment details are exposed.';
comment on function public.myvet_owner_book_appointment(bigint, timestamptz, timestamptz, text, text, text) is 'Atomically validates ownership and clinic availability before owner booking.';
