-- Create or claim the owner profile inside the Auth signup transaction.
-- The browser never receives anonymous read/write access to public.owners.

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
  requested_email text := lower(btrim(coalesce(new.email, '')));
  requested_first_name text;
  requested_last_name text;
  bootstrap_clinic_id uuid;
  existing_owner public.owners%rowtype;
begin
  if requested_role <> 'owner' then
    return new;
  end if;

  -- Existing clinic profiles may only be claimed after Supabase has verified
  -- control of the email address. Projects with email confirmation disabled
  -- populate email_confirmed_at during the initial insert.
  if new.email_confirmed_at is null then
    return new;
  end if;

  if requested_owner_id !~ '^[0-9]{9}$' then
    raise exception 'OWNER_SIGNUP_INVALID_ID';
  end if;
  if requested_full_name = '' then
    raise exception 'OWNER_SIGNUP_INVALID_NAME';
  end if;
  if requested_phone !~ '^05[0-9]{8}$' then
    raise exception 'OWNER_SIGNUP_INVALID_PHONE';
  end if;
  if requested_email = '' then
    raise exception 'OWNER_SIGNUP_INVALID_EMAIL';
  end if;
  if requested_terms_version <> 'myvet-owner-portal-v1' then
    raise exception 'OWNER_SIGNUP_TERMS_REQUIRED';
  end if;

  requested_first_name := split_part(requested_full_name, ' ', 1);
  requested_last_name := btrim(substr(requested_full_name, char_length(requested_first_name) + 1));

  select owner.*
  into existing_owner
  from public.owners as owner
  where owner.owner_id = requested_owner_id
  for update;

  if found then
    if existing_owner.auth_user_id is not null and existing_owner.auth_user_id <> new.id then
      raise exception 'OWNER_SIGNUP_ALREADY_CLAIMED';
    end if;
    if lower(btrim(coalesce(existing_owner.email, ''))) <> requested_email then
      raise exception 'OWNER_SIGNUP_EMAIL_MISMATCH';
    end if;
    update public.owners
    set auth_user_id = new.id,
        owner_first_name = requested_first_name,
        owner_last_name = requested_last_name,
        phone = requested_phone,
        terms_accepted_at = now(),
        terms_version = requested_terms_version
    where owner_id = requested_owner_id;
  else
    select clinic.clinic_id
    into strict bootstrap_clinic_id
    from public.clinics as clinic
    where clinic.slug = 'myvet-primary'
      and clinic.is_active = true;

    insert into public.owners (
      clinic_id,
      owner_id,
      auth_user_id,
      owner_first_name,
      owner_last_name,
      phone,
      email,
      terms_accepted_at,
      terms_version
    ) values (
      bootstrap_clinic_id,
      requested_owner_id,
      new.id,
      requested_first_name,
      requested_last_name,
      requested_phone,
      requested_email,
      now(),
      requested_terms_version
    );
  end if;

  -- Signup metadata is only a one-time transport into the protected profile.
  -- Remove identity, contact and role hints so they are not retained in JWT
  -- user_metadata and can never be mistaken for an authorization source.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    - array['role', 'owner_id', 'full_name', 'phone', 'terms_version']
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

-- Rollback (manual, non-destructive to owner/auth data):
-- drop trigger if exists on_auth_user_created_myvet_owner on auth.users;
-- drop trigger if exists on_auth_user_confirmed_myvet_owner on auth.users;
-- drop function if exists private.myvet_handle_owner_signup();
