-- Persist operational appointment status instead of inferring it in the UI.
alter table if exists public.appointments
  add column if not exists status text;

update public.appointments
set status = 'scheduled'
where status is null
   or status not in ('scheduled', 'arrived', 'in_progress', 'completed', 'cancelled');

alter table if exists public.appointments
  alter column status set default 'scheduled',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_status_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_status_check
      check (status in ('scheduled', 'arrived', 'in_progress', 'completed', 'cancelled'));
  end if;
end
$$;

comment on column public.appointments.status is
  'Operational workflow status maintained by active clinic staff.';

create or replace function public.myvet_guard_appointment_status_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and not (select public.myvet_is_active_staff()) then
    raise exception 'APPOINTMENT_STATUS_STAFF_ONLY' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.myvet_guard_appointment_status_update() from public, anon;
grant execute on function public.myvet_guard_appointment_status_update() to authenticated, service_role;

drop trigger if exists myvet_guard_appointment_status_update on public.appointments;
create trigger myvet_guard_appointment_status_update
before update of status on public.appointments
for each row execute function public.myvet_guard_appointment_status_update();
