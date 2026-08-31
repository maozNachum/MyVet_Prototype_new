# MyVet Staging acceptance evidence — 29–30.08.2026

## Scope and target

- Source branch: `Full_Demo`.
- Supabase parent Production project: unchanged; read-only inspection only.
- Isolated persistent branch: `myvet-staging`.
- Staging project ref: `mofigaoqzlffmnrmocxu`.
- Data: synthetic only. Transactional fixtures ended with `ROLLBACK`; the Storage object was deleted after the drill.
- No commit, push, merge, Edge Function deployment, or Production migration was performed.

## Database bootstrap

The clean-room package under `tools/supabase-baseline` was applied manually to
Staging. The remote migration history matched all 11 files in the package:

1. `20260714000000_current_production_schema.sql`
2. `20260714000001_storage_bucket_baseline.sql`
3. `20260714000002_storage_policies.sql`
4. `20260714000003_realtime_publication_baseline.sql`
5. `20260805185316_appointment_status_workflow.sql`
6. `20260825191948_atomic_appointment_mutations.sql`
7. `20260826093922_enforce_staff_appointment_capacity.sql`
8. `20260826143000_atomic_medical_visit_save.sql`
9. `20260828190000_fix_rag_vector_operator.sql`
10. `20260828191000_enforce_definer_grant_baseline.sql`
11. `20260829194859_force_rls_medical_tables.sql`

Result: PASS. Supabase `db lint --level error` returned no schema errors.

## Acceptance results

| Verification | Result |
|---|---|
| Catalog acceptance | PASS — 43 public tables, 78 public policies, 14 Storage policies, 4 private buckets, 1 HNSW index |
| SECURITY DEFINER boundary | PASS — 0 functions executable by `anon`; safe `search_path` enforced |
| Medical visit acceptance | PASS — atomic save, idempotency, rollback, cross-clinic denial, non-veterinarian denial and appointment completion |
| JWT/role matrix | PASS — two clinics, two veterinarians, secretary, two owners and two pets |
| Owner release boundary | PASS — owner received only the released artifact for the owned pet; no draft, transcript, audit or raw chunk |
| Storage isolation | PASS — staff/owner/other-clinic paths followed the tested role boundary |
| RAG runtime | PASS — authorized synthetic source returned; transaction rolled back |
| HNSW planner | PASS — representative `EXPLAIN` with 5,000 synthetic embeddings naturally selected `ai_document_embeddings_hnsw_idx`; sequential scans were not disabled |
| Synthetic cleanup | PASS — 0 synthetic clinics and 0 `restore-drill/` objects remained |

## Restore drill

This was a manual, operator-attested technical drill; it is documented and
repeatable but is not yet automated in CI.

1. A schema-only logical dump was created from Staging.
2. A clean temporary Supabase Local stack was started in Docker.
3. The application schema was restored.
4. Storage bucket metadata was restored separately.
5. `20260714000002_storage_policies.sql` restored the 14 object policies.
6. `20260828191000_enforce_definer_grant_baseline.sql` restored the verified
   least-privilege function allowlist. Before this step, the local default roles
   demonstrated why post-restore grant normalization is mandatory.
7. Catalog acceptance and HNSW planner verification passed on the restored DB.
8. Database lint returned no schema errors.
9. A private synthetic text object was uploaded to Staging, downloaded and
   hashed, deleted, restored, downloaded and hashed again. Both SHA-256 values
   matched. The object was deleted in a `finally` cleanup.
10. The temporary local Docker environment and volumes were removed.

Database dumps do not back up Storage object bytes. Production still requires
an automated object backup, approved RPO/RTO, retention and a scheduled restore
exercise.

## Repository regression gates

| Command/check | Result |
|---|---|
| `npm run test:supabase-baseline` | PASS — two clean resets, RAG rollback and DB lint |
| `npm run test:medical-visits` | PASS — 17/17 |
| `npm run test:vetbot` | PASS — 218/218 |
| `npm run typecheck:ai` | PASS |
| Deno check for 7 Edge Functions | PASS via `npx --yes deno@2.5.2 check --frozen ...` |
| `npm run test:frontend-secrets` | PASS |
| `npm run build` | PASS — 1,833 modules |
| `npm audit --omit=dev` | PASS — 0 Production vulnerabilities |
| `git diff --check` | PASS; line-ending warnings only |
| Guarded Staging acceptance wrapper | PASS — catalog, JWT role matrix, medical visit, RAG runtime, natural HNSW and final cleanup completed against the fixed Staging branch; Production target rejected by design |

## Known limitations

- Supabase branch metadata still reports the initial automatic bootstrap status
  `MIGRATIONS_FAILED`, although the manual migration history and acceptance
  checks passed. Do not use automatic promotion until this platform status is
  resolved.
- Edge Functions were not deployed to this Staging branch in this exercise.
- The role matrix uses authenticated SQL/JWT claim context, not a complete
  browser login journey through Supabase Auth.
- The role matrix covers the documented read-isolation scenarios and selected
  privileged mutations; it is not an exhaustive write matrix for every role.
- The HNSW planner check uses 5,000 synthetic 768-dimensional vectors and lets
  PostgreSQL choose the plan naturally. It proves the index/operator path is
  usable at that scale, not production RAG latency or filtered-search capacity.
- The current SECURITY DEFINER grant allowlist matches verified function names.
  A future function overload with the same name requires signature-level review.
- RAG and other advanced AI production flags remain disabled. No real provider
  acceptance was performed in this exercise.

## Repeatable guarded acceptance

The canonical rerun command is:

`powershell -NoProfile -ExecutionPolicy Bypass -File tools/supabase-baseline/verify-staging.ps1 -Execute`

The wrapper resolves only the fixed Staging branch, verifies the returned
Staging project ref and database username, rejects a Production database URL,
requires an explicit execution switch, and passes the short-lived database
credential through a deleted temporary env file instead of a process argument.
It runs every SQL file with `ON_ERROR_STOP=1` and finishes with cleanup and
disabled-feature assertions. It does not apply migrations or deploy Edge
Functions.
