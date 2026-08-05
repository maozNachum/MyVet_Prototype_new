---
name: myvet-supabase-change
description: Evidence-driven workflow for MyVet Supabase changes. Use whenever work involves Supabase tables, columns, relationships, SQL migrations, constraints, indexes, Row Level Security, policies, database functions, triggers, RPC functions, authentication, Storage, Realtime, generated types, or application queries affected by database changes. Do not use for frontend-only work that neither reads from nor writes to Supabase.
---

# MyVet Supabase Change

Implement the requested change completely; do not stop at recommendations or leave required SQL only in an explanation. Read and obey the repository `AGENTS.md` before working and treat it as the authority for permanent security, migration, testing, and Production rules.

## Inspect and trace

1. Inspect the existing Supabase integration and repository structure before editing.
2. Locate every relevant migration, SQL file, generated type, application type, query, mutation, service, hook, database function, Edge Function, trigger, RPC, Auth flow, Storage policy, Realtime consumer, and RLS policy.
3. Trace how affected application code reads, writes, validates, authorizes, and handles errors before changing the schema.
4. Derive table names, columns, key types, relationships, ownership rules, and permissions from repository evidence. Never guess or invent them.
5. Identify compatibility risks, dependent code, existing data constraints, rollout order, backfill needs, and possible side effects.

## Design the change

1. Prefer additive, backward-compatible changes that preserve existing data and application behavior.
2. Avoid destructive SQL unless the user explicitly requests and approves it. Do not execute destructive or Production database operations without explicit approval.
3. Put every SQL change in a separate timestamped migration or clearly separated SQL file following repository conventions. Never conceal required SQL inside frontend code or prose.
4. Review primary keys, foreign keys, key types, unique constraints, validation constraints, indexes, and delete or update behavior for each affected relationship.
5. Plan any required data migration or backfill explicitly, including safe ordering and compatibility during rollout.

## Review access and privacy

1. Review RLS for every affected table, including the policies needed for each operation.
2. Apply least privilege and verify RLS, grants, function privileges, and exposed API access as separate security layers.
3. Check clinic isolation, staff access, administrator access, owner access, and pet-record privacy wherever relevant.
4. Review Auth claims, Storage access, Realtime publication behavior, views, database functions, triggers, and RPC privileges when affected.
5. Preserve the repository's established patterns for privileged functions, safe `search_path`, scoped grants, private medical storage, and signed access.

## Implement application compatibility

1. Update generated or application TypeScript types when the schema contract changes.
2. Update every affected query, mutation, service, hook, function, validation path, and error handler.
3. Keep old and new application paths compatible during rollout when deployment order can vary.
4. Keep SQL, frontend, and Edge Function changes clearly separated and reviewable.

## Verify and report

1. Run the relevant existing type-check, lint, database/RLS/security tests, broader tests, and production build required by `AGENTS.md`. If no lint command exists, do not invent or claim one.
2. Verify the affected application flow and database behavior proportionately to risk. Do not claim live Supabase verification unless it occurred.
3. Fix errors introduced by the change and distinguish unrelated pre-existing failures.
4. Report separately:
   - SQL and migration changes.
   - RLS and permission changes.
   - Application-code changes.
   - Commands or manual steps the user must run.
   - Data migration or backfill requirements.
   - Verification performed.
   - Risks and remaining limitations.
