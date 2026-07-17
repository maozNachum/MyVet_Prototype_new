-- Stage 9 hardening: every clinic receives an explicit, disabled row for each
-- post-Stage-1 AI capability. Protected rows cannot disappear and accidentally
-- turn an "if disabled" check into a fail-open path.

alter table public.ai_feature_flags drop constraint if exists ai_feature_flags_capability_check;
alter table public.ai_feature_flags add constraint ai_feature_flags_capability_check check (capability in (
  'vetbot', 'vetbot_actions', 'appointment_actions', 'visit_summary',
  'digitalcare_transcription', 'digitalcare_recording', 'digitalcare_summary',
  'record_qa', 'rag_index', 'document_ocr', 'client_explanation', 'reminder_suggestion'
));

create or replace function private.myvet_seed_disabled_ai_feature_flags(target_clinic_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_feature_flags (clinic_id, capability, enabled, kill_switch, configuration)
  select target_clinic_id, capability.name, false, false, '{}'::jsonb
  from (values
    ('visit_summary'::text),
    ('digitalcare_transcription'::text),
    ('digitalcare_recording'::text),
    ('digitalcare_summary'::text),
    ('rag_index'::text),
    ('record_qa'::text),
    ('document_ocr'::text),
    ('client_explanation'::text),
    ('reminder_suggestion'::text)
  ) as capability(name)
  on conflict (clinic_id, capability) do nothing;
$$;

create or replace function private.myvet_seed_disabled_ai_feature_flags_for_new_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.myvet_seed_disabled_ai_feature_flags(new.clinic_id);
  return new;
end;
$$;

create or replace function private.myvet_protect_required_ai_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.capability in (
    'visit_summary','digitalcare_transcription','digitalcare_recording','digitalcare_summary',
    'rag_index','record_qa','document_ocr','client_explanation','reminder_suggestion'
  ) then
    raise exception 'AI_FEATURE_FLAG_DELETE_FORBIDDEN';
  end if;
  return old;
end;
$$;

drop trigger if exists myvet_seed_disabled_ai_flags_after_clinic_insert on public.clinics;
create trigger myvet_seed_disabled_ai_flags_after_clinic_insert
after insert on public.clinics
for each row execute function private.myvet_seed_disabled_ai_feature_flags_for_new_clinic();

drop trigger if exists myvet_protect_required_ai_flags_before_delete on public.ai_feature_flags;
create trigger myvet_protect_required_ai_flags_before_delete
before delete on public.ai_feature_flags
for each row execute function private.myvet_protect_required_ai_feature_flags();

select private.myvet_seed_disabled_ai_feature_flags(clinic.clinic_id)
from public.clinics as clinic;

revoke all on function private.myvet_seed_disabled_ai_feature_flags(uuid) from public, anon, authenticated, service_role;
revoke all on function private.myvet_seed_disabled_ai_feature_flags_for_new_clinic() from public, anon, authenticated, service_role;
revoke all on function private.myvet_protect_required_ai_feature_flags() from public, anon, authenticated, service_role;
