-- GoTrue may enrich raw_user_meta_data after the initial auth.users insert.
-- Re-run the existing, idempotent owner-signup handler when that metadata is
-- updated so the protected owner profile is completed and one-time transport
-- fields are removed from Auth metadata as intended.

drop trigger if exists on_auth_user_metadata_myvet_owner on auth.users;
create trigger on_auth_user_metadata_myvet_owner
after update of raw_user_meta_data on auth.users
for each row
when (
  old.raw_user_meta_data is distinct from new.raw_user_meta_data
  and lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', ''))) = 'owner'
)
execute function private.myvet_handle_owner_signup();

-- Rollback (does not alter users or owner records):
-- drop trigger if exists on_auth_user_metadata_myvet_owner on auth.users;
