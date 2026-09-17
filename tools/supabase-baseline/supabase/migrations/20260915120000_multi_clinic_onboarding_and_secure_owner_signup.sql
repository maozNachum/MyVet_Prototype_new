-- P0 3.3 + 3.5: secure owner onboarding and multi-clinic membership.
-- This migration is additive. It does not apply itself to any remote project.

create table if not exists public.clinic_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  invitation_type text not null check (invitation_type in ('owner', 'staff')),
  email text not null check (char_length(btrim(email)) between 3 and 320),
  role text check (role is null or role in ('clinic_admin', 'vet', 'nurse', 'secretary')),
  owner_id text,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_by uuid not null default auth.uid(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_invitations_owner_id_check
    check (invitation_type <> 'owner' or owner_id ~ '^[0-9]{9}$'),
  constraint clinic_invitations_staff_role_check
    check (invitation_type <> 'staff' or role is not null),
  constraint clinic_invitations_expiry_check
    check (expires_at > created_at)
);

create index if not exists clinic_invitations_lookup_idx
  on public.clinic_invitations (clinic_id, lower(email), expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.clinic_invitations enable row level security;
alter table public.clinic_invitations force row level security;
revoke all on table public.clinic_invitations from anon, authenticated;

create table if not exists public.user_clinic_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.user_clinic_preferences enable row level security;
alter table public.user_clinic_preferences force row level security;
revoke all on table public.user_clinic_preferences from anon, authenticated;

-- The preference is consulted only after membership is verified. A stale or
-- forged preference can therefore never grant access to another clinic.
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
  if (select auth.uid()) is null then
    return null;
  end if;

  select preference.active_clinic_id
  into resolved_clinic_id
  from public.user_clinic_preferences as preference
  where preference.user_id = (select auth.uid())
    and exists (
      select 1
      from public.staff as staff_member
      where staff_member.auth_user_id = (select auth.uid())
        and staff_member.clinic_id = preference.active_clinic_id
        and staff_member.is_active = true
        and private.myvet_staff_mfa_satisfied(staff_member.role)
      union all
      select 1
      from public.owners as owner
      where owner.auth_user_id = (select auth.uid())
        and owner.clinic_id = preference.active_clinic_id
    )
  limit 1;

  if resolved_clinic_id is not null then
    return resolved_clinic_id;
  end if;

  select membership.clinic_id
  into resolved_clinic_id
  from (
    select staff_member.clinic_id
    from public.staff as staff_member
    where staff_member.auth_user_id = (select auth.uid())
      and staff_member.is_active = true
      and private.myvet_staff_mfa_satisfied(staff_member.role)
    union
    select owner.clinic_id
    from public.owners as owner
    where owner.auth_user_id = (select auth.uid())
  ) as membership
  group by membership.clinic_id
  having count(*) = 1;

  return resolved_clinic_id;
end;
$$;

revoke all on function private.myvet_current_clinic_id() from public, anon;
grant execute on function private.myvet_current_clinic_id() to authenticated, service_role;

create or replace function public.myvet_set_active_clinic(requested_clinic_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.myvet_user_has_clinic_access(requested_clinic_id) then
    raise exception 'CLINIC_ACCESS_DENIED';
  end if;

  insert into public.user_clinic_preferences(user_id, active_clinic_id, updated_at)
  values ((select auth.uid()), requested_clinic_id, now())
  on conflict (user_id) do update
    set active_clinic_id = excluded.active_clinic_id,
        updated_at = excluded.updated_at;

  return requested_clinic_id;
end;
$$;

revoke all on function public.myvet_set_active_clinic(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_set_active_clinic(uuid) to authenticated;

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
  if actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'CLINIC_INVALID_SLUG';
  end if;
  if char_length(normalized_name) not between 1 and 120 then
    raise exception 'CLINIC_INVALID_NAME';
  end if;
  if exists (
    select 1 from public.staff as staff_member
    where staff_member.auth_user_id = actor_user_id
      and staff_member.is_active = true
      and staff_member.role <> 'clinic_admin'
  ) then
    raise exception 'CLINIC_ADMIN_REQUIRED';
  end if;
  if exists (
    select 1 from public.owners as owner
    where owner.auth_user_id = actor_user_id
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

  insert into public.staff(clinic_id, auth_user_id, email, full_name, name, role, is_active)
  values (new_clinic_id, actor_user_id, actor_email, actor_name, actor_name, 'clinic_admin', true);

  perform public.myvet_set_active_clinic(new_clinic_id);
  return query select new_clinic_id, normalized_name;
exception
  when unique_violation then
    raise exception 'CLINIC_SLUG_ALREADY_EXISTS';
end;
$$;

revoke all on function public.myvet_create_clinic(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_create_clinic(text, text) to authenticated;

create or replace function public.myvet_create_clinic_invitation(
  requested_clinic_id uuid,
  requested_email text,
  requested_invitation_type text,
  requested_role text default null,
  requested_owner_id text default null,
  requested_expires_at timestamptz default (now() + interval '7 days')
)
returns table (invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(coalesce(requested_email, '')));
  normalized_type text := lower(btrim(coalesce(requested_invitation_type, '')));
  normalized_role text := nullif(lower(btrim(coalesce(requested_role, ''))), '');
  normalized_owner_id text := nullif(btrim(coalesce(requested_owner_id, '')), '');
  raw_token text := encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');
  token_hash text := encode(sha256(convert_to(raw_token, 'UTF8')), 'hex');
  new_invitation_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.myvet_is_clinic_staff(requested_clinic_id, array['clinic_admin']::text[]) then
    raise exception 'CLINIC_ADMIN_REQUIRED';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVITATION_INVALID_EMAIL';
  end if;
  if normalized_type not in ('owner', 'staff') then raise exception 'INVITATION_INVALID_TYPE'; end if;
  if requested_expires_at <= now() or requested_expires_at > now() + interval '30 days' then
    raise exception 'INVITATION_INVALID_EXPIRY';
  end if;
  if normalized_type = 'staff' and normalized_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
    raise exception 'INVITATION_INVALID_ROLE';
  end if;
  if normalized_type = 'owner' and normalized_owner_id !~ '^[0-9]{9}$' then
    raise exception 'INVITATION_INVALID_OWNER_ID';
  end if;

  insert into public.clinic_invitations(
    clinic_id, invitation_type, email, role, owner_id, token_hash,
    expires_at, created_by
  ) values (
    requested_clinic_id, normalized_type, normalized_email, normalized_role,
    normalized_owner_id, token_hash, requested_expires_at, (select auth.uid())
  ) returning public.clinic_invitations.invitation_id into new_invitation_id;

  return query select new_invitation_id, raw_token, requested_expires_at;
end;
$$;

revoke all on function public.myvet_create_clinic_invitation(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_create_clinic_invitation(uuid, text, text, text, text, timestamptz) to authenticated;

create or replace function public.myvet_accept_clinic_invitation(
  requested_token text,
  requested_full_name text default null,
  requested_phone text default null,
  requested_owner_id text default null,
  requested_terms_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text;
  invite public.clinic_invitations%rowtype;
  target_owner_id text;
  target_staff_id uuid;
  normalized_name text := btrim(coalesce(requested_full_name, ''));
  normalized_phone text := regexp_replace(coalesce(requested_phone, ''), '[^0-9]', '', 'g');
begin
  if actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select lower(btrim(auth_user.email)) into actor_email
  from auth.users as auth_user
  where auth_user.id = actor_user_id and auth_user.email_confirmed_at is not null;
  if actor_email is null then raise exception 'AUTH_EMAIL_NOT_VERIFIED'; end if;
  if btrim(coalesce(requested_token, '')) = '' then raise exception 'INVITATION_TOKEN_REQUIRED'; end if;

  select invitation.* into invite
  from public.clinic_invitations as invitation
  where invitation.token_hash = encode(sha256(convert_to(btrim(requested_token), 'UTF8')), 'hex')
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at > now()
    and lower(btrim(invitation.email)) = actor_email
  for update;
  if not found then raise exception 'INVITATION_INVALID_OR_EXPIRED'; end if;

  if invite.invitation_type = 'owner' then
    target_owner_id := coalesce(nullif(btrim(requested_owner_id), ''), invite.owner_id);
    if target_owner_id <> invite.owner_id then raise exception 'INVITATION_OWNER_MISMATCH'; end if;
    if normalized_name = '' or normalized_phone !~ '^05[0-9]{8}$' then
      raise exception 'OWNER_SIGNUP_INVALID_PROFILE';
    end if;
    if requested_terms_version <> 'myvet-owner-portal-v1' then raise exception 'OWNER_SIGNUP_TERMS_REQUIRED'; end if;
    update public.owners
    set auth_user_id = actor_user_id,
        email = actor_email,
        owner_first_name = split_part(normalized_name, ' ', 1),
        owner_last_name = btrim(substr(normalized_name, char_length(split_part(normalized_name, ' ', 1)) + 1)),
        phone = normalized_phone,
        terms_accepted_at = now(),
        terms_version = requested_terms_version
    where clinic_id = invite.clinic_id
      and owner_id = target_owner_id
      and auth_user_id is null;
    if not found then
      insert into public.owners(
        clinic_id, owner_id, auth_user_id, owner_first_name, owner_last_name,
        phone, email, terms_accepted_at, terms_version
      ) values (
        invite.clinic_id, target_owner_id, actor_user_id,
        split_part(normalized_name, ' ', 1),
        btrim(substr(normalized_name, char_length(split_part(normalized_name, ' ', 1)) + 1)),
        normalized_phone, actor_email, now(), requested_terms_version
      );
    end if;
    update public.clinic_invitations set accepted_at = now(), updated_at = now()
    where invitation_id = invite.invitation_id;
    return jsonb_build_object('kind', 'owner', 'clinic_id', invite.clinic_id, 'owner_id', target_owner_id);
  end if;

  if normalized_name = '' then normalized_name := split_part(actor_email, '@', 1); end if;
  select staff_member.staff_id into target_staff_id
  from public.staff as staff_member
  where staff_member.clinic_id = invite.clinic_id
    and staff_member.auth_user_id = actor_user_id
  order by staff_member.created_at desc
  limit 1;
  if target_staff_id is null then
    insert into public.staff(clinic_id, auth_user_id, email, full_name, name, role, is_active)
    values (invite.clinic_id, actor_user_id, actor_email, normalized_name, normalized_name, invite.role, true)
    returning staff_id into target_staff_id;
  else
    update public.staff
    set email = actor_email, full_name = normalized_name, name = normalized_name,
        role = invite.role, is_active = true
    where staff_id = target_staff_id;
  end if;
  update public.clinic_invitations set accepted_at = now(), updated_at = now()
  where invitation_id = invite.invitation_id;
  return jsonb_build_object('kind', 'staff', 'clinic_id', invite.clinic_id, 'staff_id', target_staff_id, 'role', invite.role);
end;
$$;

revoke all on function public.myvet_accept_clinic_invitation(text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_accept_clinic_invitation(text, text, text, text, text) to authenticated;

create or replace function public.myvet_revoke_clinic_invitation(requested_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
begin
  select invitation.clinic_id into target_clinic_id
  from public.clinic_invitations as invitation
  where invitation.invitation_id = requested_invitation_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;
  if target_clinic_id is null then return false; end if;
  if not private.myvet_is_clinic_staff(target_clinic_id, array['clinic_admin']::text[]) then
    raise exception 'CLINIC_ADMIN_REQUIRED';
  end if;
  update public.clinic_invitations
  set revoked_at = now(), updated_at = now()
  where invitation_id = requested_invitation_id;
  return true;
end;
$$;

revoke all on function public.myvet_revoke_clinic_invitation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.myvet_revoke_clinic_invitation(uuid) to authenticated;

-- Close the direct browser write path. The Auth trigger and the invitation RPC
-- are SECURITY DEFINER server paths and remain able to create the profile.
revoke insert on table public.owners from authenticated, anon;
drop policy if exists myvet_owner_insert_own on public.owners;

create or replace function private.myvet_handle_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  requested_owner_id text := btrim(coalesce(new.raw_user_meta_data ->> 'owner_id', ''));
  requested_full_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g');
  requested_terms_version text := btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', ''));
  requested_invitation_token text := btrim(coalesce(new.raw_user_meta_data ->> 'invitation_token', ''));
  requested_email text := lower(btrim(coalesce(new.email, '')));
  requested_first_name text;
  requested_last_name text;
  existing_owner public.owners%rowtype;
  existing_owner_found boolean;
  invite public.clinic_invitations%rowtype;
  target_clinic_id uuid;
begin
  if requested_role <> 'owner' then return new; end if;
  if new.email_confirmed_at is null then return new; end if;
  if requested_owner_id !~ '^[0-9]{9}$' then raise exception 'OWNER_SIGNUP_INVALID_ID'; end if;
  if requested_full_name = '' then raise exception 'OWNER_SIGNUP_INVALID_NAME'; end if;
  if requested_phone !~ '^05[0-9]{8}$' then raise exception 'OWNER_SIGNUP_INVALID_PHONE'; end if;
  if requested_email = '' then raise exception 'OWNER_SIGNUP_INVALID_EMAIL'; end if;
  if requested_terms_version <> 'myvet-owner-portal-v1' then raise exception 'OWNER_SIGNUP_TERMS_REQUIRED'; end if;
  requested_first_name := split_part(requested_full_name, ' ', 1);
  requested_last_name := btrim(substr(requested_full_name, char_length(requested_first_name) + 1));

  select owner.* into existing_owner
  from public.owners as owner
  where owner.owner_id = requested_owner_id
  for update;
  existing_owner_found := found;

  if requested_invitation_token <> '' then
    select invitation.* into invite
    from public.clinic_invitations as invitation
    where invitation.token_hash = encode(sha256(convert_to(requested_invitation_token, 'UTF8')), 'hex')
      and invitation.invitation_type = 'owner'
      and invitation.owner_id = requested_owner_id
      and lower(btrim(invitation.email)) = requested_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
    for update;
    if not found then raise exception 'OWNER_SIGNUP_INVITATION_INVALID'; end if;
  end if;

  if existing_owner_found then
    if existing_owner.auth_user_id is not null and existing_owner.auth_user_id <> new.id then raise exception 'OWNER_SIGNUP_ALREADY_CLAIMED'; end if;
    if lower(btrim(coalesce(existing_owner.email, ''))) <> requested_email then raise exception 'OWNER_SIGNUP_EMAIL_MISMATCH'; end if;
    update public.owners
    set auth_user_id = new.id, owner_first_name = requested_first_name,
        owner_last_name = requested_last_name, phone = requested_phone,
        terms_accepted_at = now(), terms_version = requested_terms_version
    where owner_id = requested_owner_id;
    if invite.invitation_id is not null then
      update public.clinic_invitations set accepted_at = now(), updated_at = now()
      where invitation_id = invite.invitation_id;
    end if;
  else
    if requested_invitation_token = '' then raise exception 'OWNER_SIGNUP_INVITATION_REQUIRED'; end if;
    select invitation.* into invite
    from public.clinic_invitations as invitation
    where invitation.token_hash = encode(sha256(convert_to(requested_invitation_token, 'UTF8')), 'hex')
      and invitation.invitation_type = 'owner'
      and invitation.owner_id = requested_owner_id
      and lower(btrim(invitation.email)) = requested_email
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
    for update;
    if not found then raise exception 'OWNER_SIGNUP_INVITATION_INVALID'; end if;
    target_clinic_id := invite.clinic_id;
    insert into public.owners(
      clinic_id, owner_id, auth_user_id, owner_first_name, owner_last_name,
      phone, email, terms_accepted_at, terms_version
    ) values (
      target_clinic_id, requested_owner_id, new.id, requested_first_name,
      requested_last_name, requested_phone, requested_email, now(), requested_terms_version
    );
    update public.clinic_invitations set accepted_at = now(), updated_at = now()
    where invitation_id = invite.invitation_id;
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    - array['role', 'owner_id', 'full_name', 'phone', 'terms_version', 'invitation_token']
  where id = new.id;
  return new;
end;
$$;

revoke all on function private.myvet_handle_owner_signup() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_myvet_owner on auth.users;
create trigger on_auth_user_created_myvet_owner
after insert on auth.users
for each row execute function private.myvet_handle_owner_signup();

drop trigger if exists on_auth_user_confirmed_myvet_owner on auth.users;
create trigger on_auth_user_confirmed_myvet_owner
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function private.myvet_handle_owner_signup();

drop trigger if exists on_auth_user_metadata_myvet_owner on auth.users;
create trigger on_auth_user_metadata_myvet_owner
after update of raw_user_meta_data on auth.users
for each row
when (
  old.raw_user_meta_data is distinct from new.raw_user_meta_data
  and lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', ''))) = 'owner'
)
execute function private.myvet_handle_owner_signup();

-- Rollback (manual and non-destructive): re-granting INSERT or restoring the
-- old bootstrap fallback is intentionally not automated.
