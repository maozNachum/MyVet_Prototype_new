-- A newly bootstrapped clinic_admin is still at AAL1. Creating the tenant and
-- membership must succeed first; selecting an active clinic remains protected
-- by myvet_set_active_clinic and is performed after MFA reaches AAL2.

create or replace function public.myvet_create_clinic(
  requested_slug text,
  requested_display_name text
)
returns table (clinic_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_slug text := lower(btrim(coalesce(requested_slug, '')));
  normalized_name text := btrim(coalesce(requested_display_name, ''));
  new_clinic_id uuid;
  actor_email text;
  actor_name text;
begin
  if actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'CLINIC_INVALID_SLUG'; end if;
  if char_length(normalized_name) not between 1 and 120 then raise exception 'CLINIC_INVALID_NAME'; end if;
  if exists (
    select 1 from public.staff as staff_member
    where staff_member.auth_user_id = actor_user_id
      and staff_member.is_active = true
      and staff_member.role <> 'clinic_admin'
  ) or exists (
    select 1 from public.owners as owner where owner.auth_user_id = actor_user_id
  ) then
    raise exception 'CLINIC_ADMIN_REQUIRED';
  end if;

  select auth_user.email,
         coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), auth_user.email)
  into actor_email, actor_name
  from auth.users as auth_user
  where auth_user.id = actor_user_id;

  insert into public.clinics(slug, display_name)
  values (normalized_slug, normalized_name)
  returning public.clinics.clinic_id into new_clinic_id;

  perform pg_catalog.set_config('myvet.bootstrap_clinic_id', new_clinic_id::text, true);
  perform pg_catalog.set_config('myvet.bootstrap_actor_id', actor_user_id::text, true);
  insert into public.staff(clinic_id, auth_user_id, email, full_name, name, role, is_active)
  values (new_clinic_id, actor_user_id, actor_email, actor_name, actor_name, 'clinic_admin', true);
  perform pg_catalog.set_config('myvet.bootstrap_clinic_id', '', true);
  perform pg_catalog.set_config('myvet.bootstrap_actor_id', '', true);

  return query select new_clinic_id, normalized_name;
exception
  when unique_violation then raise exception 'CLINIC_SLUG_ALREADY_EXISTS';
end;
$$;

revoke all on function public.myvet_create_clinic(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_create_clinic(text, text) to authenticated;

-- Rollback: restore public.myvet_create_clinic from migration 20260915140000.
