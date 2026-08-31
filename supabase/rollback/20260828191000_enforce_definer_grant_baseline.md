# Rollback: SECURITY DEFINER grant baseline

Do not automatically roll this migration back by granting broad function access.
Its purpose is to remove implicit `PUBLIC`/`anon` execution and restore the
verified least-privilege allowlist.

If a legitimate caller is blocked, use a forward-fix migration that grants
`EXECUTE` only on the specific function and only to the required role. Re-run
`tools/supabase-baseline/verify/acceptance.sql` after the change.

No application or medical data is changed by this migration.
