-- Safe code rollback for 20260826143000_atomic_medical_visit_save.sql.
-- Existing medical records and idempotency metadata are intentionally preserved.

revoke all on function public.myvet_save_medical_entry(uuid, jsonb)
  from public, anon, authenticated, service_role;

drop function if exists public.myvet_save_medical_entry(uuid, jsonb);

-- Deliberately keep public.medical_visits.submission_id, submission_hash, submitted_by,
-- their constraints and supporting indexes.
-- Dropping them after use could remove replay protection metadata from saved visits.
