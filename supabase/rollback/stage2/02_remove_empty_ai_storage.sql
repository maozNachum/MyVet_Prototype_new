-- Run only after 01_quarantine_ai_data.sql. Existing secure document/chat
-- policies remain in place; unsafe anonymous policies are never restored.
begin;

drop policy if exists myvet_ai_medical_staff_all on storage.objects;
drop policy if exists myvet_ai_recordings_clinical_all on storage.objects;

do $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id in ('ai-medical-documents', 'ai-recordings')
  ) then
    raise exception 'AI_STORAGE_NOT_EMPTY';
  end if;

  delete from storage.buckets
  where id in ('ai-medical-documents', 'ai-recordings');
end $$;

commit;

