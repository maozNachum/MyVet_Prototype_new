# Rollback — force RLS on medical tables

This migration changes only the RLS enforcement mode and does not alter or
delete medical data. Roll it back only after confirming that the table-owner
bypass is required for a reviewed maintenance path.

```sql
alter table public.medical_visits no force row level security;
alter table public.vaccinations no force row level security;
alter table public.physical_exams no force row level security;
alter table public.medical_problems no force row level security;
alter table public.differential_diagnoses no force row level security;
alter table public.prescriptions no force row level security;
alter table public.lab_orders no force row level security;
```

RLS remains enabled after this rollback. No rows, policies, grants, functions
or indexes are removed.
