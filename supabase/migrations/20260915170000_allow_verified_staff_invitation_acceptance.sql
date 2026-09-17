-- Let the invitation RPC establish the first staff membership only while an
-- email-bound, unexpired invitation is locked and being consumed.

create or replace function private.myvet_enforce_tenant_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  target_clinic_id uuid := coalesce(nullif(new_data ->> 'clinic_id', '')::uuid, nullif(old_data ->> 'clinic_id', '')::uuid);
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  trusted_database_session boolean := pg_has_role(session_user, 'postgres', 'member');
  trusted_auth_owner_signup boolean := session_user = 'supabase_auth_admin' and current_user = 'postgres' and tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op in ('INSERT', 'UPDATE') and pg_trigger_depth() > 1;
  bootstrap_context_matches boolean := current_setting('myvet.bootstrap_clinic_id', true) = target_clinic_id::text and current_setting('myvet.bootstrap_actor_id', true) = (select auth.uid())::text;
  trusted_clinic_admin_bootstrap boolean := bootstrap_context_matches and tg_table_schema = 'public' and tg_table_name = 'staff' and tg_op = 'INSERT' and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid()) and new_data ->> 'role' = 'clinic_admin' and not exists (select 1 from public.staff as existing_staff where existing_staff.clinic_id = target_clinic_id);
  trusted_ai_flag_bootstrap boolean := bootstrap_context_matches and tg_table_schema = 'public' and tg_table_name = 'ai_feature_flags' and tg_op = 'INSERT' and coalesce((new_data ->> 'enabled')::boolean, false) = false and not exists (select 1 from public.staff as existing_staff where existing_staff.clinic_id = target_clinic_id);
  trusted_staff_invitation boolean := tg_table_schema = 'public' and tg_table_name = 'staff' and tg_op in ('INSERT', 'UPDATE')
    and current_setting('myvet.invitation_actor_id', true) = (select auth.uid())::text
    and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid())
    and exists (
      select 1 from public.clinic_invitations as invitation
      join auth.users as auth_user on auth_user.id = (select auth.uid())
      where invitation.invitation_id::text = current_setting('myvet.invitation_id', true)
        and invitation.clinic_id = target_clinic_id
        and invitation.invitation_type = 'staff'
        and invitation.role = new_data ->> 'role'
        and lower(btrim(invitation.email)) = lower(btrim(auth_user.email))
        and auth_user.email_confirmed_at is not null
        and invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at > now()
    );
begin
  if target_clinic_id is null then raise exception 'TENANT_REQUIRED'; end if;
  if tg_op = 'UPDATE' and nullif(old_data ->> 'clinic_id', '')::uuid is distinct from nullif(new_data ->> 'clinic_id', '')::uuid then raise exception 'TENANT_CHANGE_FORBIDDEN'; end if;
  if (select auth.uid()) is null then
    if jwt_role = 'service_role' or trusted_database_session or trusted_auth_owner_signup then if tg_op = 'DELETE' then return old; end if; return new; end if;
    raise exception 'AUTH_REQUIRED';
  end if;
  if trusted_ai_flag_bootstrap or trusted_clinic_admin_bootstrap or trusted_staff_invitation then return new; end if;
  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'UPDATE' and nullif(old_data ->> 'auth_user_id', '') is null and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid()) and nullif(old_data ->> 'clinic_id', '')::uuid = target_clinic_id then return new; end if;
  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'INSERT' and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid()) and target_clinic_id = private.myvet_current_clinic_id() then return new; end if;
  if not private.myvet_user_has_clinic_access(target_clinic_id) then raise exception 'TENANT_ACCESS_DENIED'; end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.myvet_enforce_tenant_write() from public, anon, authenticated, service_role;

create or replace function public.myvet_accept_clinic_invitation(
  requested_token text,
  requested_full_name text default null,
  requested_phone text default null,
  requested_owner_id text default null,
  requested_terms_version text default null
)
returns jsonb language plpgsql security definer set search_path = ''
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
  select lower(btrim(auth_user.email)) into actor_email from auth.users as auth_user where auth_user.id = actor_user_id and auth_user.email_confirmed_at is not null;
  if actor_email is null then raise exception 'AUTH_EMAIL_NOT_VERIFIED'; end if;
  if btrim(coalesce(requested_token, '')) = '' then raise exception 'INVITATION_TOKEN_REQUIRED'; end if;
  select invitation.* into invite from public.clinic_invitations as invitation
  where invitation.token_hash = encode(sha256(convert_to(btrim(requested_token), 'UTF8')), 'hex')
    and invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at > now()
    and lower(btrim(invitation.email)) = actor_email for update;
  if not found then raise exception 'INVITATION_INVALID_OR_EXPIRED'; end if;

  if invite.invitation_type = 'owner' then
    target_owner_id := coalesce(nullif(btrim(requested_owner_id), ''), invite.owner_id);
    if target_owner_id <> invite.owner_id then raise exception 'INVITATION_OWNER_MISMATCH'; end if;
    if normalized_name = '' or normalized_phone !~ '^05[0-9]{8}$' then raise exception 'OWNER_SIGNUP_INVALID_PROFILE'; end if;
    if requested_terms_version <> 'myvet-owner-portal-v1' then raise exception 'OWNER_SIGNUP_TERMS_REQUIRED'; end if;
    update public.owners set auth_user_id = actor_user_id, email = actor_email,
      owner_first_name = split_part(normalized_name, ' ', 1), owner_last_name = btrim(substr(normalized_name, char_length(split_part(normalized_name, ' ', 1)) + 1)),
      phone = normalized_phone, terms_accepted_at = now(), terms_version = requested_terms_version
    where clinic_id = invite.clinic_id and owner_id = target_owner_id and auth_user_id is null;
    if not found then
      insert into public.owners(clinic_id, owner_id, auth_user_id, owner_first_name, owner_last_name, phone, email, terms_accepted_at, terms_version)
      values (invite.clinic_id, target_owner_id, actor_user_id, split_part(normalized_name, ' ', 1), btrim(substr(normalized_name, char_length(split_part(normalized_name, ' ', 1)) + 1)), normalized_phone, actor_email, now(), requested_terms_version);
    end if;
    update public.clinic_invitations set accepted_at = now(), updated_at = now() where invitation_id = invite.invitation_id;
    return jsonb_build_object('kind', 'owner', 'clinic_id', invite.clinic_id, 'owner_id', target_owner_id);
  end if;

  if normalized_name = '' then normalized_name := split_part(actor_email, '@', 1); end if;
  perform pg_catalog.set_config('myvet.invitation_id', invite.invitation_id::text, true);
  perform pg_catalog.set_config('myvet.invitation_actor_id', actor_user_id::text, true);
  select staff_member.staff_id into target_staff_id from public.staff as staff_member
  where staff_member.clinic_id = invite.clinic_id and staff_member.auth_user_id = actor_user_id order by staff_member.created_at desc limit 1;
  if target_staff_id is null then
    insert into public.staff(clinic_id, auth_user_id, email, full_name, name, role, is_active)
    values (invite.clinic_id, actor_user_id, actor_email, normalized_name, normalized_name, invite.role, true) returning staff_id into target_staff_id;
  else
    update public.staff set email = actor_email, full_name = normalized_name, name = normalized_name, role = invite.role, is_active = true where staff_id = target_staff_id;
  end if;
  update public.clinic_invitations set accepted_at = now(), updated_at = now() where invitation_id = invite.invitation_id;
  perform pg_catalog.set_config('myvet.invitation_id', '', true);
  perform pg_catalog.set_config('myvet.invitation_actor_id', '', true);
  return jsonb_build_object('kind', 'staff', 'clinic_id', invite.clinic_id, 'staff_id', target_staff_id, 'role', invite.role);
end;
$$;

revoke all on function public.myvet_accept_clinic_invitation(text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.myvet_accept_clinic_invitation(text, text, text, text, text) to authenticated;

-- Rollback: restore both function definitions from migrations 20260915160000 and 20260915120000.
