# Rollback: definer MFA and action scope

This additive migration changes four function bodies and preserves their API signatures and intended grants. It changes no table or stored data. The migration is atomic (`BEGIN`/`COMMIT`).

Prefer a forward fix. Restoring prior definitions reopens the known MFA replay and clinic-binding gaps and must not be promoted for real customer use.

If rollback is explicitly approved for the selected environment, restore only these function definitions, inside one transaction, from the listed reviewed migration sources (do not rerun those entire migrations):

- `public.myvet_save_medical_entry(uuid,jsonb)`: `20260826143000_atomic_medical_visit_save.sql`.
- `public.myvet_execute_vetbot_inventory_create(uuid)`: `20260718230634_vetbot_inventory_create_action.sql`.
- `public.myvet_execute_vetbot_action_v2(uuid)`: `20260825191948_atomic_appointment_mutations.sql`.
- `public.myvet_execute_vetbot_action(uuid)`: `20260716194751_vetbot_action_orchestration.sql` (its direct execution must stay revoked from PUBLIC, anon, authenticated and service_role, as required by the later v2 migration).

Do not restore legacy grants. Re-run `tools/supabase-baseline/verify/definer-grants.sql` and the relevant acceptance checks. Record the rollback version and keep P0 blocked until a corrected migration passes.
