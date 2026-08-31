-- Ensure table owners and privileged maintenance code cannot accidentally
-- bypass the tenant policies protecting the core medical record tables.
-- Service flows that intentionally bypass RLS continue to do so through the
-- narrowly granted SECURITY DEFINER functions reviewed elsewhere.

begin;

-- FORCE RLS is safe only after every protected table already exists, has RLS
-- enabled, and has at least one policy. Abort the migration before changing
-- anything if the target schema is incomplete or out of order.
do $preflight$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'medical_visits',
    'vaccinations',
    'physical_exams',
    'medical_problems',
    'differential_diagnoses',
    'prescriptions',
    'lab_orders'
  ]
  loop
    if to_regclass(format('public.%I', protected_table)) is null then
      raise exception 'FORCE_RLS_PREFLIGHT_MISSING_TABLE: public.%', protected_table;
    end if;

    if not exists (
      select 1
      from pg_class as relation
      join pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = protected_table
        and relation.relkind in ('r', 'p')
        and relation.relrowsecurity
    ) then
      raise exception 'FORCE_RLS_PREFLIGHT_RLS_DISABLED: public.%', protected_table;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = protected_table
    ) then
      raise exception 'FORCE_RLS_PREFLIGHT_NO_POLICY: public.%', protected_table;
    end if;
  end loop;
end;
$preflight$;

alter table public.medical_visits enable row level security;
alter table public.medical_visits force row level security;

alter table public.vaccinations enable row level security;
alter table public.vaccinations force row level security;

alter table public.physical_exams enable row level security;
alter table public.physical_exams force row level security;

alter table public.medical_problems enable row level security;
alter table public.medical_problems force row level security;

alter table public.differential_diagnoses enable row level security;
alter table public.differential_diagnoses force row level security;

alter table public.prescriptions enable row level security;
alter table public.prescriptions force row level security;

alter table public.lab_orders enable row level security;
alter table public.lab_orders force row level security;

commit;
