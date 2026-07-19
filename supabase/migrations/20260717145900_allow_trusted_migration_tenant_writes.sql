-- Supabase CLI migrations connect as cli_login_postgres, a member of the
-- managed postgres role. Keep browser/API callers fail-closed while allowing
-- trusted database migrations and the signed service_role to seed disabled
-- feature flags and other tenant-scoped infrastructure rows.

create or replace function private.myvet_enforce_tenant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  target_clinic_id uuid := coalesce(
    nullif(new_data ->> 'clinic_id', '')::uuid,
    nullif(old_data ->> 'clinic_id', '')::uuid
  );
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  trusted_database_session boolean := pg_has_role(session_user, 'postgres', 'member');
begin
  if target_clinic_id is null then
    raise exception 'TENANT_REQUIRED';
  end if;

  if tg_op = 'UPDATE'
    and nullif(old_data ->> 'clinic_id', '')::uuid
        is distinct from nullif(new_data ->> 'clinic_id', '')::uuid then
    raise exception 'TENANT_CHANGE_FORBIDDEN';
  end if;

  if (select auth.uid()) is null then
    if jwt_role = 'service_role' or trusted_database_session then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Compatibility for the existing verified-email claim flow. The claim RPC
  -- still performs the verified email match; this exception only lets its
  -- tenant-preserving update pass the generic write guard.
  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'UPDATE'
    and nullif(old_data ->> 'auth_user_id', '') is null
    and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid())
    and nullif(old_data ->> 'clinic_id', '')::uuid = target_clinic_id then
    return new;
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'INSERT'
    and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid())
    and target_clinic_id = private.myvet_current_clinic_id() then
    return new;
  end if;

  if not private.myvet_user_has_clinic_access(target_clinic_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.myvet_enforce_tenant_write()
  from public, anon, authenticated, service_role;

comment on function private.myvet_enforce_tenant_write() is
  'Defense-in-depth tenant guard. Browser/API writes require a verified actor; signed service_role and managed postgres-member migration sessions remain available for server infrastructure writes.';
