# Rollback: privacy-request concurrency and MFA hardening

Do not weaken privacy-request tenant isolation or administrator MFA as an
emergency shortcut. Prefer a forward fix after validation outside Production.

If rollback is explicitly approved:

1. Restore `myvet_submit_privacy_request` and `myvet_manage_privacy_request`
   from `20260906153000_privacy_request_workflow.sql`.
2. Restore `privacy_requests_staff_select` from that migration.
3. Drop `privacy_requests_one_open_owner_type_uidx` only after confirming that
   no concurrent submission path is active.

Rollback does not delete existing requests. Re-run owner, clinic-isolation,
MFA and concurrent-submission acceptance tests before release.
