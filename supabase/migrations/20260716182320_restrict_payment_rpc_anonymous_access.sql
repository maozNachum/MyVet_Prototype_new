-- Supabase default privileges can grant anon EXECUTE explicitly even after
-- revoking the pseudo-role PUBLIC. Restrict only the two payment RPCs added by
-- the preceding migration; their bodies also enforce owner/staff authorization.

revoke all on function public.myvet_owner_settle_demo_payment(bigint) from public;
revoke all on function public.myvet_owner_settle_demo_payment(bigint) from anon;
revoke all on function public.myvet_staff_settle_payment(bigint, text, numeric) from public;
revoke all on function public.myvet_staff_settle_payment(bigint, text, numeric) from anon;

grant execute on function public.myvet_owner_settle_demo_payment(bigint) to authenticated, service_role;
grant execute on function public.myvet_staff_settle_payment(bigint, text, numeric) to authenticated, service_role;
