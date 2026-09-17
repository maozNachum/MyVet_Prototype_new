create or replace function private.myvet_enforce_tenant_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  old_data jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_data jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  target_clinic_id uuid:=coalesce(nullif(new_data->>'clinic_id','')::uuid,nullif(old_data->>'clinic_id','')::uuid);
  jwt_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  trusted_database_session boolean:=pg_has_role(session_user,'postgres','member');
  trusted_auth_owner_signup boolean:=session_user='supabase_auth_admin' and current_user='postgres' and tg_table_schema='public' and tg_table_name='owners' and tg_op in ('INSERT','UPDATE') and pg_trigger_depth()>1;
  trusted_owner_signup_context boolean:=tg_table_schema='public' and tg_table_name='owners' and tg_op in ('INSERT','UPDATE') and pg_trigger_depth()>1 and nullif(new_data->>'auth_user_id','')::uuid is not null and current_setting('myvet.owner_signup_user_id',true)=new_data->>'auth_user_id';
  bootstrap_context_matches boolean:=current_setting('myvet.bootstrap_clinic_id',true)=target_clinic_id::text and current_setting('myvet.bootstrap_actor_id',true)=(select auth.uid())::text;
  trusted_clinic_admin_bootstrap boolean:=bootstrap_context_matches and tg_table_schema='public' and tg_table_name='staff' and tg_op='INSERT' and nullif(new_data->>'auth_user_id','')::uuid=(select auth.uid()) and new_data->>'role'='clinic_admin' and not exists(select 1 from public.staff s where s.clinic_id=target_clinic_id);
  trusted_ai_flag_bootstrap boolean:=bootstrap_context_matches and tg_table_schema='public' and tg_table_name='ai_feature_flags' and tg_op='INSERT' and coalesce((new_data->>'enabled')::boolean,false)=false and not exists(select 1 from public.staff s where s.clinic_id=target_clinic_id);
  trusted_staff_invitation boolean:=tg_table_schema='public' and tg_table_name='staff' and tg_op in ('INSERT','UPDATE') and current_setting('myvet.invitation_actor_id',true)=(select auth.uid())::text and nullif(new_data->>'auth_user_id','')::uuid=(select auth.uid()) and exists(select 1 from public.clinic_invitations i join auth.users u on u.id=(select auth.uid()) where i.invitation_id::text=current_setting('myvet.invitation_id',true) and i.clinic_id=target_clinic_id and i.invitation_type='staff' and i.role=new_data->>'role' and lower(btrim(i.email))=lower(btrim(u.email)) and u.email_confirmed_at is not null and i.accepted_at is null and i.revoked_at is null and i.expires_at>now());
  trusted_owner_invitation boolean:=tg_table_schema='public' and tg_table_name='owners' and tg_op in ('INSERT','UPDATE') and nullif(new_data->>'auth_user_id','')::uuid=(select auth.uid()) and exists(select 1 from public.clinic_invitations i join auth.users u on u.id=(select auth.uid()) where i.clinic_id=target_clinic_id and i.invitation_type='owner' and i.owner_id=new_data->>'owner_id' and lower(btrim(i.email))=lower(btrim(u.email)) and u.email_confirmed_at is not null and i.accepted_at is null and i.revoked_at is null and i.expires_at>now());
begin
  if target_clinic_id is null then raise exception 'TENANT_REQUIRED'; end if;
  if tg_op='UPDATE' and nullif(old_data->>'clinic_id','')::uuid is distinct from nullif(new_data->>'clinic_id','')::uuid then raise exception 'TENANT_CHANGE_FORBIDDEN'; end if;
  if trusted_owner_signup_context or trusted_owner_invitation then if tg_op='DELETE' then return old; end if; return new; end if;
  if (select auth.uid()) is null then if jwt_role='service_role' or trusted_database_session or trusted_auth_owner_signup then if tg_op='DELETE' then return old; end if; return new; end if; raise exception 'AUTH_REQUIRED'; end if;
  if trusted_ai_flag_bootstrap or trusted_clinic_admin_bootstrap or trusted_staff_invitation then return new; end if;
  if tg_table_schema='public' and tg_table_name='owners' and tg_op='UPDATE' and nullif(old_data->>'auth_user_id','') is null and nullif(new_data->>'auth_user_id','')::uuid=(select auth.uid()) and nullif(old_data->>'clinic_id','')::uuid=target_clinic_id then return new; end if;
  if tg_table_schema='public' and tg_table_name='owners' and tg_op='INSERT' and nullif(new_data->>'auth_user_id','')::uuid=(select auth.uid()) and target_clinic_id=private.myvet_current_clinic_id() then return new; end if;
  if not private.myvet_user_has_clinic_access(target_clinic_id) then raise exception 'TENANT_ACCESS_DENIED'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.myvet_enforce_tenant_write() from public,anon,authenticated,service_role;

-- Rollback: restore private.myvet_enforce_tenant_write from migration 20260915190000.
