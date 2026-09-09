# Rollback: staff Auth and MFA hardening

Do not disable MFA enforcement or restore long-lived sessions as an emergency
shortcut. If the TOTP flow fails, keep high-privilege access blocked and deploy
a forward fix after validating the affected account in a non-Production
environment.

If a rollback is explicitly approved, restore the four helper functions from
`20260716213752_ai_tenant_foundation.sql` and
`20260716213806_ai_rls_and_rpc_hardening.sql`, then drop only:

- `myvet_staff_self_select_for_mfa` on `public.staff`;
- trigger `myvet_revoke_staff_sessions` on `public.staff`;
- functions `private.myvet_revoke_staff_sessions()` and
  `private.myvet_staff_mfa_satisfied(text)`.

Rolling back the database does not change hosted Auth settings and does not
recreate sessions already revoked. Re-run the staff, owner, cross-clinic and
MFA acceptance tests before releasing any rollback.
