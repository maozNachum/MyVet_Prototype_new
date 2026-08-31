-- Clean-room baseline only: reproduce the verified Realtime publication.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'appointments',
    'conversations',
    'hospitalizations',
    'inventory',
    'lab_orders',
    'messages',
    'owners',
    'patients',
    'payments',
    'vaccinations'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
