# MyVet — Stage 8 follow-up suggestions

## Scope

Stage 8 adds veterinarian-reviewed follow-up suggestions based on an approved medical source. The demo UI is attached to an approved visit summary and supports exactly three reminder types: return visit, future vaccination and general medical follow-up.

The implementation reuses `public.reminders`. AI output is stored only as a `reminder_suggestion` artifact. A real reminder row is inserted only by `myvet_transition_follow_up_suggestion(..., 'approve', ...)` after server-side veterinarian and tenant validation.

## Flow

1. The authenticated Edge Function derives the veterinarian, clinic, visit, pet, owner and latest approved visit-summary artifact on the server.
2. `runFollowUpSuggestionGateway` sends only the approved `follow_up` section through the configured provider adapter and versioned `follow-up.suggest` prompt.
3. Strict output validation accepts up to three allowlisted reminder types. `source_text` must exactly match an approved follow-up line.
4. Absolute and clear relative dates are resolved deterministically by the server, relative to the source date. Ambiguous dates remain empty and set `requires_manual_date=true`.
5. The suggestion is a draft. The veterinarian can edit, reject or approve it. Missing dates are reported on submit.
6. Approval inserts a row into `public.reminders`. Owner visibility is possible only when the veterinarian explicitly selects the owner target; otherwise `owner_id` stays null.

## Authorization and privacy

- The browser cannot choose clinic, owner, pet, actor, provider, model or prompt.
- Only an active veterinarian in the source clinic can create or transition a suggestion.
- The source must still be approved at both draft creation and approval time.
- AI artifacts remain hidden from owners. Owners see only the approved reminder row for a pet verified as theirs by database RLS.
- Audit and telemetry contain status, provider/model versions, latency and token counts only; no medical source text is logged.
- Medication, dosage, warning and other text outside the approved `follow_up` allowlist cannot become a suggestion.

## Duplicate protection

Approval checks the existing reminder table by clinic, pet, source type, source ID, reminder type and exact due time under an advisory transaction lock. A possible duplicate returns the existing reminder ID and creates nothing. A second explicit approval with `duplicateConfirmed=true` is required to proceed.

## Feature flags

- `AI_FOLLOW_UP_SUGGESTIONS_ENABLED=false`
- `AI_FOLLOW_UP_SUGGESTIONS_KILL_SWITCH=false`

Both are server-only. The default remains disabled. RAG, OCR and client-summary flags are unchanged.

## Provider status

Gateway behavior, schemas, failures and permissions were verified with a mock provider. No live AI-provider call was performed in this workspace, so the feature flag must remain off until the Edge Function, migration and configured provider pass a Preview smoke test.

## Supabase changes

- Migration: `supabase/migrations/20260717180000_follow_up_suggestion_workflow.sql`
- Edge Function: `supabase/functions/follow-up-suggestions/index.ts`
- Rollback: `supabase/rollback/stage8/01_remove_follow_up_suggestion_workflow.sql`

The migration adds no parallel business table. It adds the approval RPCs, a duplicate lookup index, the vaccination source allowlist entry, and narrowly scoped reminder read policies for verified clinic staff and verified owners.

## Rollback

1. Set `AI_FOLLOW_UP_SUGGESTIONS_ENABLED=false` or `AI_FOLLOW_UP_SUGGESTIONS_KILL_SWITCH=true` in the affected non-Production environment.
2. Remove or stop routing to the `follow-up-suggestions` Edge Function.
3. Apply `supabase/rollback/stage8/01_remove_follow_up_suggestion_workflow.sql` only if database-level removal is required.
4. Do not delete existing reminders or AI artifacts. The rollback intentionally preserves both.

