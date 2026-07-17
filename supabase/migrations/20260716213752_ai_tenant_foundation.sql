-- Stage 2 / 1 of 4: tenant foundation for MyVet and future AI data.
-- This migration is additive for business rows. Existing single-clinic data is
-- assigned to one bootstrap clinic before clinic_id becomes mandatory.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists public.clinics (
  clinic_id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.clinics (slug, display_name)
values ('myvet-primary', 'MyVet')
on conflict (slug) do nothing;

alter table public.clinics enable row level security;
revoke all on table public.clinics from anon;
grant select on table public.clinics to authenticated;
grant all privileges on table public.clinics to service_role;

do $$
declare
  target_table text;
  bootstrap_clinic_id uuid;
  tenant_tables text[] := array[
    'staff', 'owners', 'patients', 'appointments', 'payments', 'payment_items',
    'payment_transactions', 'medical_visits', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'vaccinations', 'documents',
    'lab_orders', 'hospitalizations', 'conversations', 'messages',
    'message_attachments', 'video_sessions', 'notifications', 'reminders',
    'inventory', 'service_catalog', 'clinic_booking_hours', 'clinic_booking_blocks',
    'insights', 'vetbot_action_requests', 'vetbot_audit_logs', 'vetbot_feedback',
    'vetbot_knowledge'
  ];
begin
  select clinic_id into strict bootstrap_clinic_id
  from public.clinics
  where slug = 'myvet-primary';

  foreach target_table in array tenant_tables loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('alter table public.%I add column if not exists clinic_id uuid', target_table);
      execute format('update public.%I set clinic_id = $1 where clinic_id is null', target_table)
        using bootstrap_clinic_id;
      execute format('alter table public.%I alter column clinic_id set not null', target_table);

      if not exists (
        select 1
        from pg_constraint
        where conname = target_table || '_clinic_id_fkey'
          and conrelid = to_regclass(format('public.%I', target_table))
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (clinic_id) references public.clinics(clinic_id) on update restrict on delete restrict',
          target_table,
          target_table || '_clinic_id_fkey'
        );
      end if;

      execute format(
        'create index if not exists %I on public.%I (clinic_id)',
        target_table || '_clinic_id_idx',
        target_table
      );
    end if;
  end loop;
end $$;

create or replace function private.myvet_current_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_clinic_id uuid;
begin
  if (select auth.uid()) is not null then
    select (array_agg(distinct membership.clinic_id))[1]
    into resolved_clinic_id
    from (
      select staff.clinic_id
      from public.staff as staff
      where staff.auth_user_id = (select auth.uid()) and staff.is_active = true
      union
      select owner.clinic_id
      from public.owners as owner
      where owner.auth_user_id = (select auth.uid())
    ) as membership
    having count(distinct membership.clinic_id) = 1;
  end if;

  if resolved_clinic_id is null
    and (select count(*) from public.clinics where is_active = true) = 1 then
    select clinic_id into resolved_clinic_id
    from public.clinics
    where is_active = true
    limit 1;
  end if;

  return resolved_clinic_id;
end;
$$;

create or replace function private.myvet_is_clinic_staff(
  target_clinic_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and target_clinic_id is not null
    and exists (
      select 1
      from public.staff as staff
      where staff.auth_user_id = (select auth.uid())
        and staff.clinic_id = target_clinic_id
        and staff.is_active = true
        and (allowed_roles is null or staff.role = any(allowed_roles))
    );
$$;

create or replace function private.myvet_user_has_clinic_access(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_clinic_id is not null
    and (select auth.uid()) is not null
    and (
      exists (
        select 1 from public.staff as staff
        where staff.auth_user_id = (select auth.uid())
          and staff.clinic_id = target_clinic_id
          and staff.is_active = true
      )
      or exists (
        select 1 from public.owners as owner
        where owner.auth_user_id = (select auth.uid())
          and owner.clinic_id = target_clinic_id
      )
    );
$$;

create or replace function private.myvet_owner_owns_pet(
  target_clinic_id uuid,
  target_pet_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.patients as pet
      join public.owners as owner
        on owner.owner_id = pet.owner_id
       and owner.clinic_id = pet.clinic_id
      where pet.clinic_id = target_clinic_id
        and pet.pet_id = target_pet_id
        and owner.auth_user_id = (select auth.uid())
    );
$$;

revoke all on function private.myvet_current_clinic_id() from public, anon;
revoke all on function private.myvet_is_clinic_staff(uuid, text[]) from public, anon;
revoke all on function private.myvet_user_has_clinic_access(uuid) from public, anon;
revoke all on function private.myvet_owner_owns_pet(uuid, bigint) from public, anon;
grant execute on function private.myvet_current_clinic_id() to authenticated, service_role;
grant execute on function private.myvet_is_clinic_staff(uuid, text[]) to authenticated, service_role;
grant execute on function private.myvet_user_has_clinic_access(uuid) to authenticated, service_role;
grant execute on function private.myvet_owner_owns_pet(uuid, bigint) to authenticated, service_role;

do $$
declare
  target_table text;
  tenant_tables text[] := array[
    'staff', 'owners', 'patients', 'appointments', 'payments', 'payment_items',
    'payment_transactions', 'medical_visits', 'physical_exams', 'medical_problems',
    'differential_diagnoses', 'prescriptions', 'vaccinations', 'documents',
    'lab_orders', 'hospitalizations', 'conversations', 'messages',
    'message_attachments', 'video_sessions', 'notifications', 'reminders',
    'inventory', 'service_catalog', 'clinic_booking_hours', 'clinic_booking_blocks',
    'insights', 'vetbot_action_requests', 'vetbot_audit_logs', 'vetbot_feedback',
    'vetbot_knowledge'
  ];
begin
  foreach target_table in array tenant_tables loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format(
        'alter table public.%I alter column clinic_id set default private.myvet_current_clinic_id()',
        target_table
      );
    end if;
  end loop;
end $$;

-- Composite keys allow every AI foreign key to verify tenant and entity in one
-- database constraint, rather than trusting an ID supplied by the browser.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_clinic_staff_key') then
    alter table public.staff add constraint staff_clinic_staff_key unique (clinic_id, staff_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'owners_clinic_owner_key') then
    alter table public.owners add constraint owners_clinic_owner_key unique (clinic_id, owner_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_clinic_pet_key') then
    alter table public.patients add constraint patients_clinic_pet_key unique (clinic_id, pet_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_clinic_appointment_key') then
    alter table public.appointments add constraint appointments_clinic_appointment_key unique (clinic_id, appointment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'medical_visits_clinic_visit_key') then
    alter table public.medical_visits add constraint medical_visits_clinic_visit_key unique (clinic_id, visit_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_clinic_owner_fkey') then
    alter table public.patients
      add constraint patients_clinic_owner_fkey
      foreign key (clinic_id, owner_id)
      references public.owners(clinic_id, owner_id)
      on update restrict on delete restrict;
  end if;
end $$;

-- The previous primary key made weekly opening hours global. The composite key
-- preserves the existing weekday values while making them clinic-specific.
do $$
begin
  if to_regclass('public.clinic_booking_hours') is not null then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.clinic_booking_hours'::regclass
        and conname = 'clinic_booking_hours_pkey'
        and pg_get_constraintdef(oid) = 'PRIMARY KEY (weekday)'
    ) then
      alter table public.clinic_booking_hours drop constraint clinic_booking_hours_pkey;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.clinic_booking_hours'::regclass
        and contype = 'p'
    ) then
      alter table public.clinic_booking_hours
        add constraint clinic_booking_hours_pkey primary key (clinic_id, weekday);
    end if;
  end if;
end $$;

comment on table public.clinics is
  'MyVet tenant registry. Browser-supplied clinic_id is never an authorization source.';
comment on function private.myvet_is_clinic_staff(uuid, text[]) is
  'RLS helper in a non-exposed schema; verifies auth.uid against active staff and an optional role allowlist.';
