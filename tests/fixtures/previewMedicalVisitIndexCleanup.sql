-- PREVIEW-ONLY corrective migration.
-- The initial acceptance run found that the synthetic Preview baseline already
-- had a unique (clinic_id, staff_id) index. The medical-entry foreign key uses
-- that existing index, so the later duplicate can be removed safely.

do $cleanup$
begin
  if to_regclass('public.staff_clinic_id_staff_id_key') is not null
     and to_regclass('public.staff_clinic_staff_key') is not null
     and exists (
       select 1
       from pg_constraint
       where conname = 'medical_visits_clinic_submitted_by_fkey'
         and conrelid = 'public.medical_visits'::regclass
         and conindid = 'public.staff_clinic_id_staff_id_key'::regclass
     ) then
    drop index public.staff_clinic_staff_key;
  end if;
end
$cleanup$;
