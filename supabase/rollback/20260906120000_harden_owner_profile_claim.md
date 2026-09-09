# Rollback — hardened owner-profile claim

Do not restore the previous `ORDER BY ... LIMIT 1` implementation: it can link
an Auth user to an arbitrary clinic when email matches are ambiguous.

If the hardened claim must be withdrawn, use a new reviewed migration that:

1. revokes `EXECUTE` on `public.claim_owner_profile()` from `authenticated` and
   `service_role`;
2. leaves existing `owners.auth_user_id` values unchanged;
3. keeps the owner portal in its safe manual-contact fallback state; and
4. restores execution only after a replacement claim contract passes the
   duplicate-email, tenant-isolation and concurrency tests.

No data backfill or destructive rollback is required by this migration.
