-- P0 3.2: serialize every server-owned owner-email write with the claim RPC.
-- The lock is transaction-scoped, so a claim cannot race a protected owner
-- insert and observe a partial candidate set.

create or replace function private.myvet_lock_owner_email(requested_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if btrim(coalesce(requested_email, '')) <> '' then
    perform pg_advisory_xact_lock(
      hashtextextended(lower(btrim(requested_email)), 0)
    );
  end if;
end;
$$;

revoke all on function private.myvet_lock_owner_email(text)
  from public, anon, authenticated, service_role;

create or replace function private.myvet_serialize_owner_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.myvet_lock_owner_email(new.email);
  elsif new.email is distinct from old.email then
    perform private.myvet_lock_owner_email(new.email);
  end if;
  return new;
end;
$$;

revoke all on function private.myvet_serialize_owner_email()
  from public, anon, authenticated, service_role;

drop trigger if exists myvet_serialize_owner_email on public.owners;
create trigger myvet_serialize_owner_email
before insert or update of email on public.owners
for each row execute function private.myvet_serialize_owner_email();

create or replace function public.claim_owner_profile()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  verified_email text := lower(btrim(coalesce((select auth.jwt()) ->> 'email', '')));
  linked_owner_id text;
  matching_owner record;
  matching_owner_count integer := 0;
  candidate_owner_id text;
  candidate_auth_user_id uuid;
  claimed_owner_id text;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if verified_email = '' or not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = actor_id
      and auth_user.email_confirmed_at is not null
      and lower(btrim(coalesce(auth_user.email, ''))) = verified_email
  ) then
    raise exception using errcode = 'P0001', message = 'AUTH_EMAIL_NOT_VERIFIED';
  end if;

  -- This lock is shared with every owner INSERT/UPDATE path through the
  -- owners trigger above. It closes the same-email phantom insert race.
  perform private.myvet_lock_owner_email(verified_email);

  select owner.owner_id
  into linked_owner_id
  from public.owners as owner
  where owner.auth_user_id = actor_id;

  if linked_owner_id is not null then
    return linked_owner_id;
  end if;

  for matching_owner in
    select owner.owner_id, owner.auth_user_id
    from public.owners as owner
    where lower(btrim(coalesce(owner.email, ''))) = verified_email
    order by owner.clinic_id, owner.owner_id
    for update
  loop
    matching_owner_count := matching_owner_count + 1;
    if matching_owner_count = 1 then
      candidate_owner_id := matching_owner.owner_id;
      candidate_auth_user_id := matching_owner.auth_user_id;
    end if;
  end loop;

  if matching_owner_count = 0 then return null; end if;
  if matching_owner_count > 1 then
    raise exception using errcode = 'P0001', message = 'OWNER_PROFILE_AMBIGUOUS';
  end if;
  if candidate_auth_user_id is not null then
    if candidate_auth_user_id = actor_id then return candidate_owner_id; end if;
    raise exception using errcode = 'P0001', message = 'OWNER_PROFILE_ALREADY_CLAIMED';
  end if;

  update public.owners
  set auth_user_id = actor_id
  where owner_id = candidate_owner_id
    and auth_user_id is null
  returning owner_id into claimed_owner_id;

  if claimed_owner_id is null then
    raise exception using errcode = 'P0001', message = 'OWNER_PROFILE_CLAIM_CONFLICT';
  end if;
  return claimed_owner_id;
end;
$$;

revoke all on function public.claim_owner_profile() from public, anon;
grant execute on function public.claim_owner_profile() to authenticated, service_role;

comment on function public.claim_owner_profile() is
  'Claims one owner profile using the confirmed Auth email. A transaction advisory lock serializes claim and protected owner-email writes; ambiguous matches fail closed.';
