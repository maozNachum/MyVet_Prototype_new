# Stage 3 — AI visit summary

## User flow

1. An active veterinarian opens an existing visit in the medical timeline.
2. The `visit-summary` Edge Function authenticates the JWT, derives the clinic from the visit, verifies an active `vet` membership and checks both feature switches.
3. The server loads only linked visit facts. Names, contacts, identifiers, links and payment data are excluded from the provider payload.
4. The gateway applies redaction, a versioned prompt and strict output validation.
5. A service-only atomic RPC stores a `draft`, source reference, operation metadata, approval history and metadata-only audit event.
6. Save, approve or reject creates a new immutable version; the previous editable version becomes `superseded`.
7. Only explicit `approve` creates an `approved` artifact. Generation never updates `medical_visits`.

## Structured output

`chief_complaint`, `symptoms`, `relevant_history`, `examination_findings`, `tests`, `clinical_assessment`, `treatments`, `medications`, `follow_up`, `warnings`, `unresolved_items`, `source_references`.

Every field is required by the provider schema and revalidated by the server. The database repeats a strict JSON shape/type/size check.

## Permissions

| Action | Server verification |
|---|---|
| Load/generate | visit RLS + active veterinarian in the visit clinic |
| Store generated draft | service-role-only RPC after Edge verification |
| Save/approve/reject | `auth.uid()`, clinic, veterinarian role and current version checked atomically |
| Owner | no access to draft/edited/rejected output |

The frontend never supplies clinic, pet, owner, user, provider, model or prompt.

## Failure handling

- Timeout, provider failure and invalid output create no medical artifact.
- A metadata-only failed operation is recorded for a verified visit and actor.
- The editor retains local text after save/approve/reject errors.
- UI double-click prevention is backed by advisory locks, idempotency and version checks.

## Feature switches

- `AI_GLOBAL_ENABLED`
- `AI_VISIT_SUMMARY_ENABLED`
- `AI_VISIT_SUMMARY_KILL_SWITCH`
- `ai_feature_flags(capability = 'visit_summary')`

`AI_VISIT_SUMMARY_ENABLED` now fails closed when missing. The independent kill switch blocks only visit-summary generation and does not affect VetBot.

## Rollback

1. Set `AI_VISIT_SUMMARY_ENABLED=false`.
2. Run `supabase/rollback/stage3/01_remove_visit_summary_workflow.sql` in Preview or a maintenance transaction.
3. Undeploy or route away from `visit-summary`.
4. Retain artifacts and approval history for integrity.

No Stage 4 capability is included.
