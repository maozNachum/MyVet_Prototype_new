-- Clean-room copy of the root migration.

create or replace function private.myvet_handle_owner_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  requested_role text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', ''))); requested_owner_id text := btrim(coalesce(new.raw_user_meta_data ->> 'owner_id', ''));
  requested_full_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')); requested_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g');
  requested_terms_version text := btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')); requested_invitation_token text := btrim(coalesce(new.raw_user_meta_data ->> 'invitation_token', ''));
  requested_email text := lower(btrim(coalesce(new.email, ''))); requested_first_name text; requested_last_name text; existing_owner public.owners%rowtype; existing_owner_found boolean;
  invite public.clinic_invitations%rowtype; target_clinic_id uuid;
begin
  if requested_role <> 'owner' then return new; end if; if new.email_confirmed_at is null then return new; end if;
  if requested_owner_id !~ '^[0-9]{9}$' then raise exception 'OWNER_SIGNUP_INVALID_ID'; end if; if requested_full_name = '' then raise exception 'OWNER_SIGNUP_INVALID_NAME'; end if;
  if requested_phone !~ '^05[0-9]{8}$' then raise exception 'OWNER_SIGNUP_INVALID_PHONE'; end if; if requested_email = '' then raise exception 'OWNER_SIGNUP_INVALID_EMAIL'; end if;
  if requested_terms_version <> 'myvet-owner-portal-v1' then raise exception 'OWNER_SIGNUP_TERMS_REQUIRED'; end if;
  requested_first_name := split_part(requested_full_name, ' ', 1); requested_last_name := btrim(substr(requested_full_name, char_length(requested_first_name) + 1));
  select owner.* into existing_owner from public.owners as owner where owner.owner_id=requested_owner_id for update; existing_owner_found:=found;
  if requested_invitation_token<>'' then select invitation.* into invite from public.clinic_invitations as invitation where invitation.token_hash=encode(sha256(convert_to(requested_invitation_token,'UTF8')),'hex') and invitation.invitation_type='owner' and invitation.owner_id=requested_owner_id and lower(btrim(invitation.email))=requested_email and invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at>now() for update; if not found then raise exception 'OWNER_SIGNUP_INVITATION_INVALID'; end if; end if;
  if existing_owner_found then
    if existing_owner.auth_user_id is not null and existing_owner.auth_user_id<>new.id then raise exception 'OWNER_SIGNUP_ALREADY_CLAIMED'; end if; if lower(btrim(coalesce(existing_owner.email,'')))<>requested_email then raise exception 'OWNER_SIGNUP_EMAIL_MISMATCH'; end if;
    update public.owners set auth_user_id=new.id,owner_first_name=requested_first_name,owner_last_name=requested_last_name,phone=requested_phone,terms_accepted_at=now(),terms_version=requested_terms_version where owner_id=requested_owner_id;
    if invite.invitation_id is not null then update public.clinic_invitations set accepted_at=now(),updated_at=now() where invitation_id=invite.invitation_id; end if;
  else
    if requested_invitation_token='' then raise exception 'OWNER_SIGNUP_INVITATION_REQUIRED'; end if;
    select invitation.* into invite from public.clinic_invitations as invitation where invitation.token_hash=encode(sha256(convert_to(requested_invitation_token,'UTF8')),'hex') and invitation.invitation_type='owner' and invitation.owner_id=requested_owner_id and lower(btrim(invitation.email))=requested_email and invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at>now() for update;
    if not found then raise exception 'OWNER_SIGNUP_INVITATION_INVALID'; end if; target_clinic_id:=invite.clinic_id;
    insert into public.owners(clinic_id,owner_id,auth_user_id,owner_first_name,owner_last_name,phone,email,terms_accepted_at,terms_version) values(target_clinic_id,requested_owner_id,new.id,requested_first_name,requested_last_name,requested_phone,requested_email,now(),requested_terms_version);
    update public.clinic_invitations set accepted_at=now(),updated_at=now() where invitation_id=invite.invitation_id;
  end if;
  new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-array['role','owner_id','full_name','phone','terms_version','invitation_token']; return new;
end;
$$;
revoke all on function private.myvet_handle_owner_signup() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_myvet_owner on auth.users; drop trigger if exists on_auth_user_confirmed_myvet_owner on auth.users; drop trigger if exists on_auth_user_metadata_myvet_owner on auth.users;
create trigger on_auth_user_created_myvet_owner before insert on auth.users for each row execute function private.myvet_handle_owner_signup();
create trigger on_auth_user_confirmed_myvet_owner before update of email_confirmed_at on auth.users for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function private.myvet_handle_owner_signup();
create trigger on_auth_user_metadata_myvet_owner before update of raw_user_meta_data on auth.users for each row when (old.raw_user_meta_data is distinct from new.raw_user_meta_data and lower(btrim(coalesce(new.raw_user_meta_data ->> 'role','')))='owner') execute function private.myvet_handle_owner_signup();

-- Rollback: restore the function and AFTER triggers from migration 20260915120000.
