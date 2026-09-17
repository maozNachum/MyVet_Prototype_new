-- Clean-room copy of the root migration. Kept self-contained for Preview use.

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
begin
  if target_clinic_id is null then raise exception 'TENANT_REQUIRED'; end if;
  if tg_op = 'UPDATE' and nullif(old_data ->> 'clinic_id', '')::uuid is distinct from nullif(new_data ->> 'clinic_id', '')::uuid then raise exception 'TENANT_CHANGE_FORBIDDEN'; end if;
  if (select auth.uid()) is null then
    if jwt_role = 'service_role' or trusted_database_session or trusted_auth_owner_signup then if tg_op = 'DELETE' then return old; end if; return new; end if;
    raise exception 'AUTH_REQUIRED';
  end if;
  if trusted_ai_flag_bootstrap or trusted_clinic_admin_bootstrap then return new; end if;
  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'UPDATE' and nullif(old_data ->> 'auth_user_id', '') is null and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid()) and nullif(old_data ->> 'clinic_id', '')::uuid = target_clinic_id then return new; end if;
  if tg_table_schema = 'public' and tg_table_name = 'owners' and tg_op = 'INSERT' and nullif(new_data ->> 'auth_user_id', '')::uuid = (select auth.uid()) and target_clinic_id = private.myvet_current_clinic_id() then return new; end if;
  if not private.myvet_user_has_clinic_access(target_clinic_id) then raise exception 'TENANT_ACCESS_DENIED'; end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.myvet_enforce_tenant_write() from public, anon, authenticated, service_role;

create or replace function public.myvet_create_clinic(requested_slug text, requested_display_name text)
returns table (clinic_id uuid, display_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_slug text := lower(btrim(coalesce(requested_slug, '')));
  normalized_name text := btrim(coalesce(requested_display_name, ''));
  new_clinic_id uuid := gen_random_uuid();
  actor_email text; actor_name text;
begin
  if actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'CLINIC_INVALID_SLUG'; end if;
  if char_length(normalized_name) not between 1 and 120 then raise exception 'CLINIC_INVALID_NAME'; end if;
  if exists (select 1 from public.staff as staff_member where staff_member.auth_user_id = actor_user_id and staff_member.is_active = true and staff_member.role <> 'clinic_admin') or exists (select 1 from public.owners as owner where owner.auth_user_id = actor_user_id) then raise exception 'CLINIC_ADMIN_REQUIRED'; end if;
  select auth_user.email, coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), auth_user.email) into actor_email, actor_name from auth.users as auth_user where auth_user.id = actor_user_id;
  perform pg_catalog.set_config('myvet.bootstrap_clinic_id', new_clinic_id::text, true);
  perform pg_catalog.set_config('myvet.bootstrap_actor_id', actor_user_id::text, true);
  insert into public.clinics(clinic_id, slug, display_name) values (new_clinic_id, normalized_slug, normalized_name);
  insert into public.staff(clinic_id, auth_user_id, email, full_name, name, role, is_active) values (new_clinic_id, actor_user_id, actor_email, actor_name, actor_name, 'clinic_admin', true);
  perform pg_catalog.set_config('myvet.bootstrap_clinic_id', '', true); perform pg_catalog.set_config('myvet.bootstrap_actor_id', '', true);
  return query select new_clinic_id, normalized_name;
exception when unique_violation then raise exception 'CLINIC_SLUG_ALREADY_EXISTS';
end;
$$;
revoke all on function public.myvet_create_clinic(text, text) from public, anon, authenticated, service_role;
grant execute on function public.myvet_create_clinic(text, text) to authenticated;

-- Rollback: restore both function definitions from migration 20260915150000.
