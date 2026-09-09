# Rollback: inactive staff Storage revocation

Do not restore the former direct object-owner exceptions. They allowed a staff
member whose `staff.is_active` value was changed to `false` to retain access to
private medical or chat files uploaded by that user.

If this migration blocks a legitimate flow, keep the revocation in place and
ship a forward-fix migration that scopes that flow to an active clinic
membership and its linked `documents` or `message_attachments` row. Re-run the
inactive-staff, owner and cross-clinic Storage acceptance tests before release.

This migration changes policies only. It does not modify or delete files,
Storage metadata, medical rows or user accounts.
