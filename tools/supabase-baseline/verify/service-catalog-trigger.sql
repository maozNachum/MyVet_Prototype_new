-- Transaction-local fixture: no application rows or persistent objects changed.
begin;
do $$
begin
  if not exists (
    select 1 from pg_proc
    where oid = 'public.set_updated_at()'::regprocedure
      and proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'set_updated_at search_path is not pinned';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.service_catalog'::regclass
      and tgfoid = 'public.set_updated_at()'::regprocedure
      and tgenabled in ('O', 'A')
  ) then
    raise exception 'service_catalog timestamp trigger missing or disabled';
  end if;
end;
$$;
create temporary table myvet_timestamp_probe(id integer, updated_at timestamptz);
create trigger timestamp_probe before update on myvet_timestamp_probe
  for each row execute function public.set_updated_at();
insert into myvet_timestamp_probe values (1, '2000-01-01'::timestamptz);
-- Verify execution even with a caller-controlled search path.
set local search_path = pg_temp;
update myvet_timestamp_probe set id = 2;
do $$
begin
  if not exists(select 1 from myvet_timestamp_probe where id=2 and updated_at=now()) then
    raise exception 'timestamp trigger did not update the row';
  end if;
end;
$$;
rollback;
select 'service_catalog_trigger_search_path_passed' as result;
