# MyVet clean-room Supabase baseline

This package exists only to prove that the current MyVet database can be
recreated from an empty, isolated Supabase environment. It must never be linked
to or pushed into Production.

The package deliberately validates the database only. Edge Functions remain in
the repository's main `supabase/functions` directory and are verified by the
repository test scripts; they are not duplicated here.

## Why this is separate

`supabase/migrations` remains the historical migration chain used by the linked
project. The current-state baseline already contains those applied changes, so
replaying that history over the baseline would duplicate objects and create
false drift. This package contains:

1. a schema-only current-state baseline (no application data);
2. private Storage bucket configuration and policies;
3. verified Realtime publication membership;
4. migrations that were pending after the baseline snapshot.

The final clean-room migration removes all browser/service grants from every
`SECURITY DEFINER` function, then restores only an explicit allowlist derived
from the verified Production ACLs and the pending migration declarations. This
prevents both PostgreSQL's default `PUBLIC EXECUTE` and stale dump grants from
crossing into a fresh database.

## Safe local verification

Run the guarded repository check:

```powershell
npm run test:supabase-baseline
```

It refuses to run when this clean-room workdir contains a remote project link,
performs two complete resets, runs catalog and synthetic RAG checks, and runs
the Supabase database linter. The synthetic rows are wrapped in a transaction
and rolled back. The isolated stack is stopped automatically; pass
`-KeepRunning` directly to `verify-local.ps1` only when manual inspection is
needed.

The equivalent manual commands, also only for Supabase Local, are:

```powershell
npx --yes supabase@2.116.0 start --workdir tools/supabase-baseline
npx --yes supabase@2.116.0 db reset --local --workdir tools/supabase-baseline
Get-Content tools/supabase-baseline/verify/acceptance.sql -Raw |
  docker exec -i supabase_db_myvet-baseline psql -U postgres -d postgres
```

Repeat `db reset --local` to verify deterministic recreation. Stop the isolated
stack with:

```powershell
npx --yes supabase@2.116.0 stop --workdir tools/supabase-baseline
```

Do not run `link`, `db push`, `migration repair`, or `deploy` from this workdir.
No seed containing real people, clinics, owners, pets, or medical records belongs
in this package.

## Verified Staging acceptance

On 2026-08-29 this package was applied manually to the isolated persistent
Supabase branch `myvet-staging` (project ref `mofigaoqzlffmnrmocxu`). Production
was not changed. The catalog acceptance, medical-visit transaction fixture,
tenant/role matrix, synthetic RAG runtime, HNSW planner check, and database lint
all passed. The role and vector fixtures run inside transactions and roll back.

The branch's initial automatic bootstrap failed before the manual clean-room
application, so Supabase branch metadata can still report `MIGRATIONS_FAILED`.
Use the actual migration list and the acceptance results as the technical gate,
and resolve the stale platform status before relying on automatic branch
promotion.

## Logical restore warning

A schema dump alone is not a complete MyVet restore. The verified restore drill
also restored private bucket metadata, reapplied
`20260714000002_storage_policies.sql`, and reapplied
`20260828191000_enforce_definer_grant_baseline.sql` before acceptance. The last
step is mandatory because a logical restore may temporarily recreate functions
with PostgreSQL's broad default `EXECUTE` privileges. Storage object bytes need
a separate backup and restore process; database dumps cover metadata, not the
objects themselves.
