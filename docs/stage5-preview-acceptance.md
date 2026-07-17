# Stage 5 — Preview acceptance and controlled activation

Updated: 2026-07-17

## Current gate

- The only connected Supabase project is `Nisan&Maoz-my-vet` (`bavpqmopcrhtrwatmyng`), which is the production project.
- No existing Supabase Preview branch is available through the connected tools.
- Production migration history currently ends before the Stage 2–5 AI migrations.
- No Stage 2–5 migration, Edge Function, secret, fixture or feature flag was applied to Production during this acceptance run.
- Local `.env` points at the existing project and must not be used for remote acceptance writes.
- The RAG remains disabled.

## Acceptance result for this run

**Overall Preview gate: BLOCKED, not accepted for Stage 6.** The code and the
synthetic local security baseline pass, but there is no accessible Supabase
Preview branch on which to prove the real PostgreSQL/pgvector/HNSW, Auth, Edge
Function, Gemini and signed-session behaviour. Production was deliberately not
used as a substitute.

| Check | Result | Evidence |
|---|---|---|
| Stage 2–5 migrations in dependency order | PASS locally / BLOCKED in Preview | PGlite executed the reversible schema and permission flows; the vector operator and HNSW statements are excluded because PGlite is not Supabase PostgreSQL with pgvector |
| Tenant, owner and role separation | PASS locally / BLOCKED in Preview | negative fixtures cover two clinics, two veterinarians, a non-veterinarian employee and two owners |
| RAG service-only RPC grants | PASS static and locally / BLOCKED in Preview | browser roles are revoked; runtime `has_function_privilege` still requires Preview |
| HNSW creation and vector execution | BLOCKED | must be verified against the Preview branch catalog and query plan |
| Indexing with a real embedding provider | BLOCKED | no Preview Edge runtime or Preview-only provider secret was available |
| Grounded Q&A with real retrieval | BLOCKED | deliberately not enabled before the critical Preview authorization tests |
| Prompt-injection and secret-output guards | PASS locally / BLOCKED with real provider | malicious synthetic source lines are removed; forbidden answer patterns fail output validation |
| Build, AI type check, Deno check, frontend secret boundary | PASS | executed on 2026-07-17 |
| Unit/regression suite | PASS | 87/87 tests, including VetBot, appointment compatibility, visit summaries, DigitalCare and Stage 5 RAG |
| Lint | NOT CONFIGURED | `package.json` has no lint script; this is not reported as a pass |

No synthetic Preview users or records were created, because doing so in the only
connected project would have written to Production. The synthetic identities
below are the exact fixtures to create after a Preview branch is explicitly
approved and connected.

## Stage 5 acceptance fixes made before activation

- Indexing is now allowed while Q&A remains disabled, so the rollout order is
  enforceable rather than circular.
- Index replacement rejects a forged `content_hash` and duplicate chunk indexes.
- Source text is redacted and stripped of common embedded instruction patterns
  before embedding and again before generation context assembly.
- Suspicious-only retrieval fails closed with the standard insufficient-evidence
  answer and a metadata-only audit event.
- Answer validation rejects attempts to expose prompts, provider secrets or
  service-role material.
- The Mock embedding adapter is deterministic and lexical, enabling repeatable
  synthetic threshold testing without pretending to represent Gemini scores.

## Exact database order for a fresh Preview branch

The first six files are prerequisites already produced by Stages 2–4. The last two are the complete Stage 5 database change.

1. `supabase/migrations/20260716213752_ai_tenant_foundation.sql`
2. `supabase/migrations/20260716213800_ai_data_model.sql`
3. `supabase/migrations/20260716213806_ai_rls_and_rpc_hardening.sql`
4. `supabase/migrations/20260716213812_ai_storage_security.sql`
5. `supabase/migrations/20260717120000_visit_summary_workflow.sql`
6. `supabase/migrations/20260717150000_digitalcare_transcription_workflow.sql`
7. `supabase/migrations/20260717160000_secure_medical_record_rag.sql`
   - installs `extensions.vector` when missing;
   - extends the chunk and embedding tables;
   - adds constraints, tenant/source indexes and the 768-dimensional vector column;
   - creates the cosine HNSW index;
   - enables and forces RLS, revokes browser access and creates invalidation triggers.
8. `supabase/migrations/20260717160500_secure_medical_record_rag_rpc.sql`
   - creates status, source collection, idempotent replacement, filtered search and metadata-only audit RPCs;
   - every function uses `security definer` with `search_path = ''`;
   - `PUBLIC`, `anon` and `authenticated` execution is revoked;
   - only `service_role` receives execute permission.

After the SQL succeeds, deploy `supabase/functions/medical-record-rag` to the Preview project with JWT verification enabled. Do not point a Production frontend at this function.

## Initial Preview environment

| Name | Location | Purpose | Initial Preview value | Secret | Frontend |
|---|---|---|---|---|---|
| `SUPABASE_URL` | Preview Edge runtime | Branch API URL | injected by Supabase | no | do not copy manually |
| `SUPABASE_ANON_KEY` | Preview Edge runtime | user JWT validation | injected by Supabase | publishable | do not expose from server code |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview Edge runtime | service-only RPC access after JWT validation | injected by Supabase | yes | forbidden |
| `GEMINI_API_KEY` | Preview Edge secrets | embeddings and grounded answer generation | Preview/test key | yes | forbidden |
| `AI_GLOBAL_ENABLED` | Preview Edge config | global AI gate | `true` only in Preview | no | server only |
| `AI_RAG_INDEX_ENABLED` | Preview Edge config | indexing kill switch | `false` initially | no | server only |
| `AI_RAG_QA_ENABLED` | Preview Edge config | Q&A kill switch | `false` initially | no | server only |
| `AI_ALLOW_MOCK_PROVIDER` | Preview Edge config | test-adapter guard | `false` | no | server only |
| `AI_EMBEDDING_PROVIDER` | Preview Edge config | provider selection | `gemini` | no | server only |
| `AI_EMBEDDING_MODEL` | Preview Edge config | fixed embedding model | `gemini-embedding-2` | no | server only |
| `AI_EMBEDDING_VERSION` | Preview Edge config | re-index boundary | `preview-gemini-embedding-2-768-v1` | no | server only |
| `AI_EMBEDDING_TIMEOUT_MS` | Preview Edge config | provider timeout | `10000` | no | server only |
| `AI_RAG_MAX_CHUNKS_PER_SOURCE` | Preview Edge config | indexing bound | `24` | no | server only |
| `AI_RAG_MAX_RESULTS` | Preview Edge config | retrieval/context bound | `6` | no | server only |
| `AI_RAG_MINIMUM_SIMILARITY` | Preview Edge config | retrieval threshold | keep `0.62` only as a disabled baseline until Preview calibration | no | server only |
| `GEMINI_MODEL` | Preview Edge config | grounded answer model | `gemini-3.5-flash` (stable model currently configured by the server) | no | server only |
| `AI_REQUEST_TIMEOUT_MS` | Preview Edge config | one generation attempt | `8000` | no | server only |
| `AI_TOTAL_TIMEOUT_MS` | Preview Edge config | total generation budget | `24000` | no | server only |
| `AI_MAX_SAFE_RETRIES` | Preview Edge config | safe retry count | `1` | no | server only |
| `AI_RATE_LIMIT_PER_MINUTE` | Preview Edge config | gateway rate limit | `20` | no | server only |
| `VITE_SUPABASE_URL` | Vercel/local Preview frontend | Preview API URL | branch URL | no | allowed |
| `VITE_SUPABASE_ANON_KEY` | Vercel/local Preview frontend | Preview publishable key | branch publishable/anon key | publishable | allowed |

No service-role key, Gemini key, provider/model selector, prompt or role value may use a `VITE_` prefix.

## Read-only SQL checks after migrations

```sql
select extname, extversion from pg_extension where extname = 'vector';

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ai_document_chunks', 'ai_document_embeddings');

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'ai_document_chunks_active_source_idx',
    'ai_document_chunks_rag_scope_idx',
    'ai_document_embeddings_rag_filter_idx',
    'ai_document_embeddings_hnsw_idx'
  )
order by indexname;

select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'myvet_rag_%'
order by p.proname;

select clinic_id, capability, enabled, kill_switch, configuration
from public.ai_feature_flags
where capability in ('rag_index', 'record_qa')
order by clinic_id, capability;
```

Expected: vector is installed; both raw tables have RLS and FORCE RLS; all four indexes exist and HNSW is valid; only `service_role` can execute the RPCs; all RAG flags are disabled.

## Synthetic Preview identities

Create these users only inside the Preview branch using Supabase Auth. Use generated Preview-only passwords and do not reuse personal accounts:

- `stage5-vet-a@example.invalid`
- `stage5-vet-b@example.invalid`
- `stage5-secretary-a@example.invalid`
- `stage5-owner-a@example.invalid`
- `stage5-owner-b@example.invalid`

Then create two synthetic clinics, map one veterinarian to each clinic, map the secretary only to clinic A, create one owner and at least two pets in clinic A and one owner/pet in clinic B. Add only synthetic medical visits, an approved released summary, a draft summary, a raw draft transcript and released/non-released document fixtures.

Do not copy Production rows into Preview. Record the generated IDs in the test report and delete the fixtures when acceptance completes.

## Controlled activation

1. Keep Edge and database flags disabled while testing schema, RLS, grants and direct-RPC denial.
2. Enable only the database `rag_index` flag for the synthetic clinic and set `AI_RAG_INDEX_ENABLED=true` in Preview. Keep `AI_RAG_QA_ENABLED=false`.
3. Sign in as the synthetic veterinarian and index only the synthetic pets.
4. Verify chunk/embedding metadata, dimensions, provider/model/version, idempotency and invalidation.
5. Run real Gemini calibration using only synthetic questions. Test at least `0.45`, `0.55`, `0.62`, `0.70` and `0.78`; choose the lowest threshold that retains every relevant source without returning a known unrelated source. Local Mock results do not determine the Gemini value.
6. Only after all negative authorization tests pass, enable the database `record_qa` flag and set `AI_RAG_QA_ENABLED=true` temporarily in Preview.
7. Run grounded Q&A, no-result, conflict, prompt-injection and provider-failure tests.
8. Disable both flags again after acceptance unless an explicitly approved Preview demo window remains open.

## Local calibration evidence

`npm run test:rag-calibration` uses a deterministic, synthetic-only Mock provider. It tested `0.20`, `0.30`, `0.40`, `0.50`, `0.60`, `0.70` and the computed midpoint `0.14`. At `0.20`, all four expected sources were returned and an unrelated clinic-address question returned no source. At `0.30`, the lameness source was lost; at `0.50` and above all expected sources were lost. This validates the harness, not the Gemini threshold.

## Rollback order

1. Set `AI_RAG_INDEX_ENABLED=false` and `AI_RAG_QA_ENABLED=false` in Preview.
2. Run `supabase/rollback/stage5/01_disable_medical_record_rag.sql`.
3. Confirm no new indexing or Q&A succeeds while the medical record remains available.
4. Keep indexed data quarantined for diagnosis. Do not drop source medical rows.
5. Run `supabase/rollback/stage5/02_remove_empty_medical_record_rag.sql` only when the Preview database has no Stage 5 chunks. It aborts if indexed content exists.
6. Revert Stage 5 through a normal Git revert and redeploy only the Preview Edge Function.
