-- Delete a patient and every database row that depends on it in one transaction.
-- The public entry point is restricted to an authenticated clinic administrator.

create schema if not exists myvet_private;
revoke all on schema myvet_private from public, anon, authenticated;

create or replace function myvet_private.delete_dependent_rows(
  p_parent_table regclass,
  p_parent_predicate text,
  p_visited_constraints oid[] default '{}'::oid[],
  p_visited_tables oid[] default '{}'::oid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dependent record;
  child_predicate text;
begin
  for dependent in
    select
      constraint_row.oid as constraint_oid,
      constraint_row.conrelid as child_table_oid,
      format('%I.%I', child_namespace.nspname, child_table.relname) as child_table_name,
      format('%I.%I', parent_namespace.nspname, parent_table.relname) as parent_table_name,
      string_agg(format('%I', child_column.attname), ', ' order by key_columns.position) as child_columns,
      string_agg(format('%I', parent_column.attname), ', ' order by key_columns.position) as parent_columns
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as child_table
      on child_table.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as child_namespace
      on child_namespace.oid = child_table.relnamespace
    join pg_catalog.pg_class as parent_table
      on parent_table.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace as parent_namespace
      on parent_namespace.oid = parent_table.relnamespace
    cross join lateral unnest(constraint_row.conkey, constraint_row.confkey)
      with ordinality as key_columns(child_attribute_number, parent_attribute_number, position)
    join pg_catalog.pg_attribute as child_column
      on child_column.attrelid = constraint_row.conrelid
     and child_column.attnum = key_columns.child_attribute_number
    join pg_catalog.pg_attribute as parent_column
      on parent_column.attrelid = constraint_row.confrelid
     and parent_column.attnum = key_columns.parent_attribute_number
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = p_parent_table
    group by
      constraint_row.oid,
      constraint_row.conrelid,
      child_namespace.nspname,
      child_table.relname,
      parent_namespace.nspname,
      parent_table.relname
  loop
    if dependent.constraint_oid = any(p_visited_constraints)
      or dependent.child_table_oid = any(p_visited_tables) then
      continue;
    end if;

    child_predicate := format(
      '(%s) in (select %s from %s where %s)',
      dependent.child_columns,
      dependent.parent_columns,
      dependent.parent_table_name,
      p_parent_predicate
    );

    perform myvet_private.delete_dependent_rows(
      dependent.child_table_oid::regclass,
      child_predicate,
      array_append(p_visited_constraints, dependent.constraint_oid),
      array_append(p_visited_tables, dependent.child_table_oid)
    );

    execute format(
      'delete from %s where %s',
      dependent.child_table_name,
      child_predicate
    );
  end loop;
end;
$$;

revoke all on function myvet_private.delete_dependent_rows(regclass, text, oid[], oid[]) from public, anon, authenticated;

create or replace function public.myvet_delete_patient(p_pet_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  deleted_rows integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select patient.clinic_id
    into target_clinic_id
  from public.patients as patient
  where patient.pet_id = p_pet_id
  for update;

  if target_clinic_id is null then
    raise exception using errcode = 'P0002', message = 'Patient was not found';
  end if;

  if not exists (
    select 1
    from public.staff as staff_member
    where staff_member.auth_user_id = auth.uid()
      and staff_member.clinic_id = target_clinic_id
      and staff_member.is_active = true
      and staff_member.role = 'clinic_admin'
  ) then
    raise exception using errcode = '42501', message = 'Only a clinic administrator may delete a patient';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_clinic_id::text || ':' || p_pet_id::text, 0)
  );

  perform myvet_private.delete_dependent_rows(
    'public.patients'::regclass,
    format('clinic_id = %L and pet_id = %L', target_clinic_id, p_pet_id),
    '{}'::oid[],
    array['public.patients'::regclass::oid]
  );

  delete from public.patients
  where clinic_id = target_clinic_id
    and pet_id = p_pet_id;

  get diagnostics deleted_rows = row_count;

  if deleted_rows <> 1 then
    raise exception using errcode = 'P0002', message = 'Patient was not found';
  end if;

  return pg_catalog.jsonb_build_object(
    'deleted', true,
    'pet_id', p_pet_id
  );
end;
$$;

comment on function public.myvet_delete_patient(bigint) is
  'Atomically deletes one patient and dependent rows. Restricted to an active clinic administrator.';

revoke all on function public.myvet_delete_patient(bigint) from public, anon;
grant execute on function public.myvet_delete_patient(bigint) to authenticated, service_role;
