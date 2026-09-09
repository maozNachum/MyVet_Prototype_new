-- F-026/F-007: require a second factor for high-privilege staff and revoke
-- server-side sessions whenever a staff membership is disabled, removed or
-- changes identity/role. Owner access is intentionally unaffected.

create or replace function private.myvet_staff_mfa_satisfied(staff_role text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select staff_role not in ('clinic_admin', 'vet')
    or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke all on function private.myvet_staff_mfa_satisfied(text)
from public, anon;
grant execute on function private.myvet_staff_mfa_satisfied(text)
to authenticated, service_role;

create or replace function public.myvet_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.staff as staff
      where staff.auth_user_id = (select auth.uid())
        and staff.is_active = true
        and private.myvet_staff_mfa_satisfied(staff.role)
    );
$$;

create or replace function private.myvet_current_clinic_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_clinic_id uuid;
  clinic_count integer;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select count(distinct membership.clinic_id), min(membership.clinic_id::text)::uuid
  into clinic_count, resolved_clinic_id
  from (
    select staff.clinic_id
    from public.staff as staff
    where staff.auth_user_id = (select auth.uid())
      and staff.is_active = true
      and private.myvet_staff_mfa_satisfied(staff.role)
    union
    select owner.clinic_id
    from public.owners as owner
    where owner.auth_user_id = (select auth.uid())
  ) as membership;

  if clinic_count = 1 then
    return resolved_clinic_id;
  end if;

  if clinic_count = 0
     and not exists (
       select 1 from public.staff
       where auth_user_id = (select auth.uid())
         and is_active = true
     )
     and not exists (
       select 1 from public.owners
       where auth_user_id = (select auth.uid())
     )
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
        and private.myvet_staff_mfa_satisfied(staff.role)
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
        select 1
        from public.staff as staff
        where staff.auth_user_id = (select auth.uid())
          and staff.clinic_id = target_clinic_id
          and staff.is_active = true
          and private.myvet_staff_mfa_satisfied(staff.role)
      )
      or exists (
        select 1
        from public.owners as owner
        where owner.auth_user_id = (select auth.uid())
          and owner.clinic_id = target_clinic_id
      )
    );
$$;

-- A high-privilege user must be able to read only their own active staff row
-- at aal1 so the application can identify the required MFA flow. All clinic
-- data remains behind the MFA-aware tenant helpers above.
drop policy if exists myvet_staff_self_select_for_mfa on public.staff;
create policy myvet_staff_self_select_for_mfa
on public.staff for select to authenticated
using (
  auth_user_id = (select auth.uid())
  and is_active = true
);

create or replace function private.myvet_revoke_staff_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_user_id uuid;
begin
  if tg_op = 'DELETE' then
    revoked_user_id := old.auth_user_id;
  elsif old.auth_user_id is distinct from new.auth_user_id
     or old.role is distinct from new.role
     or (old.is_active = true and new.is_active = false) then
    revoked_user_id := old.auth_user_id;
  end if;

  if revoked_user_id is not null then
    delete from auth.sessions
    where user_id = revoked_user_id;
  end if;

  if tg_op = 'UPDATE'
     and new.auth_user_id is not null
     and old.auth_user_id is distinct from new.auth_user_id then
    delete from auth.sessions
    where user_id = new.auth_user_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.myvet_revoke_staff_sessions()
from public, anon, authenticated, service_role;

drop trigger if exists myvet_revoke_staff_sessions on public.staff;
create trigger myvet_revoke_staff_sessions
after update of auth_user_id, role, is_active or delete on public.staff
for each row execute function private.myvet_revoke_staff_sessions();

comment on function private.myvet_staff_mfa_satisfied(text) is
  'Requires aal2 for clinic_admin and vet sessions; other active staff roles remain aal1-compatible.';
comment on function private.myvet_revoke_staff_sessions() is
  'Revokes refreshable Auth sessions when staff access or role changes.';
