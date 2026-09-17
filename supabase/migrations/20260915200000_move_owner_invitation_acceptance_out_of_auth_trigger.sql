-- Supabase Auth must not depend on writes to application tables. Owner
-- invitations are accepted after email verification by the authenticated RPC.
drop trigger if exists a_myvet_prepare_owner_signup_context on auth.users;
drop trigger if exists on_auth_user_created_myvet_owner on auth.users;
drop trigger if exists on_auth_user_confirmed_myvet_owner on auth.users;
drop trigger if exists on_auth_user_metadata_myvet_owner on auth.users;

comment on function private.myvet_handle_owner_signup() is
  'Legacy owner provisioning function retained for rollback only. No Auth trigger invokes it; verified invitation acceptance uses public.myvet_accept_clinic_invitation.';

-- Rollback: recreate the BEFORE triggers from migrations 20260915180000 and 20260915190000.
