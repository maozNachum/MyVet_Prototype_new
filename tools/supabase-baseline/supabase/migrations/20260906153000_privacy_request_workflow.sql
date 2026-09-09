-- Privacy-rights request workflow. Requests are tenant-scoped, append-only for
-- owners, and managed only by active clinic administrators.

create table if not exists public.privacy_requests (
  request_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(clinic_id) on delete restrict,
  owner_id text not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('access', 'correction', 'export', 'deletion', 'consent_withdrawal')),
  status text not null default 'submitted' check (status in ('submitted', 'identity_review', 'in_review', 'completed', 'rejected', 'cancelled')),
  request_details text null check (request_details is null or char_length(request_details) between 1 and 1000),
  resolution_notes text null check (resolution_notes is null or char_length(resolution_notes) between 1 and 2000),
  submitted_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  completed_at timestamptz null,
  handled_by uuid null references public.staff(staff_id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint privacy_requests_owner_fkey foreign key (clinic_id, owner_id)
    references public.owners(clinic_id, owner_id) on delete restrict,
  constraint privacy_requests_completion_time_check check (
    (status in ('completed', 'rejected', 'cancelled') and completed_at is not null)
    or (status not in ('completed', 'rejected', 'cancelled') and completed_at is null)
  )
);

create index if not exists privacy_requests_owner_created_idx
  on public.privacy_requests (clinic_id, owner_id, submitted_at desc);
create index if not exists privacy_requests_open_queue_idx
  on public.privacy_requests (clinic_id, submitted_at)
  where status in ('submitted', 'identity_review', 'in_review');

alter table public.privacy_requests enable row level security;
alter table public.privacy_requests force row level security;

revoke all on table public.privacy_requests from public, anon, authenticated;
grant select on table public.privacy_requests to authenticated;
grant all on table public.privacy_requests to service_role;

drop policy if exists privacy_requests_owner_select on public.privacy_requests;
create policy privacy_requests_owner_select on public.privacy_requests
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  and owner_id = (select public.myvet_current_owner_id())
);

drop policy if exists privacy_requests_staff_select on public.privacy_requests;
create policy privacy_requests_staff_select on public.privacy_requests
for select to authenticated
using (
  clinic_id = (select private.myvet_current_clinic_id())
  and (select public.myvet_is_active_staff())
);

create or replace function public.myvet_submit_privacy_request(
  requested_type text,
  requested_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_owner public.owners%rowtype;
  normalized_type text := lower(btrim(coalesce(requested_type, '')));
  normalized_details text := nullif(btrim(coalesce(requested_details, '')), '');
  existing_request_id uuid;
  created_request_id uuid;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if normalized_type not in ('access', 'correction', 'export', 'deletion', 'consent_withdrawal') then
    raise exception 'PRIVACY_REQUEST_TYPE_INVALID' using errcode = '22023';
  end if;
  if normalized_details is not null and char_length(normalized_details) > 1000 then
    raise exception 'PRIVACY_REQUEST_DETAILS_INVALID' using errcode = '22023';
  end if;

  select owner.* into target_owner
  from public.owners as owner
  where owner.auth_user_id = actor_id;

  if not found then
    raise exception 'OWNER_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select request.request_id into existing_request_id
  from public.privacy_requests as request
  where request.clinic_id = target_owner.clinic_id
    and request.owner_id = target_owner.owner_id
    and request.request_type = normalized_type
    and request.status in ('submitted', 'identity_review', 'in_review')
  order by request.submitted_at desc
  limit 1;

  if existing_request_id is not null then
    return existing_request_id;
  end if;

  insert into public.privacy_requests (
    clinic_id, owner_id, auth_user_id, request_type, request_details
  ) values (
    target_owner.clinic_id, target_owner.owner_id, actor_id,
    normalized_type, normalized_details
  ) returning request_id into created_request_id;

  return created_request_id;
end;
$$;

revoke all on function public.myvet_submit_privacy_request(text, text) from public, anon;
grant execute on function public.myvet_submit_privacy_request(text, text) to authenticated, service_role;

create or replace function public.myvet_manage_privacy_request(
  requested_request_id uuid,
  requested_status text,
  requested_resolution_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_staff public.staff%rowtype;
  target public.privacy_requests%rowtype;
  normalized_status text := lower(btrim(coalesce(requested_status, '')));
  normalized_notes text := nullif(btrim(coalesce(requested_resolution_notes, '')), '');
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if normalized_status not in ('identity_review', 'in_review', 'completed', 'rejected', 'cancelled') then
    raise exception 'PRIVACY_REQUEST_STATUS_INVALID' using errcode = '22023';
  end if;
  if normalized_notes is not null and char_length(normalized_notes) > 2000 then
    raise exception 'PRIVACY_REQUEST_NOTES_INVALID' using errcode = '22023';
  end if;

  select staff_row.* into actor_staff
  from public.staff as staff_row
  where staff_row.auth_user_id = actor_id
    and staff_row.is_active = true
    and staff_row.role = 'clinic_admin';
  if not found then
    raise exception 'CLINIC_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select request.* into target
  from public.privacy_requests as request
  where request.request_id = requested_request_id
    and request.clinic_id = actor_staff.clinic_id
  for update;
  if not found then
    raise exception 'PRIVACY_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target.status in ('completed', 'rejected', 'cancelled') then
    raise exception 'PRIVACY_REQUEST_ALREADY_CLOSED' using errcode = 'P0001';
  end if;

  update public.privacy_requests
  set status = normalized_status,
      resolution_notes = normalized_notes,
      acknowledged_at = coalesce(acknowledged_at, now()),
      completed_at = case when normalized_status in ('completed', 'rejected', 'cancelled') then now() else null end,
      handled_by = actor_staff.staff_id,
      updated_at = now()
  where request_id = requested_request_id;

  return requested_request_id;
end;
$$;

revoke all on function public.myvet_manage_privacy_request(uuid, text, text) from public, anon;
grant execute on function public.myvet_manage_privacy_request(uuid, text, text) to authenticated, service_role;

create or replace function public.myvet_privacy_retention_preview()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'expired_ai_documents', (
      select count(*) from public.ai_documents
      where retention_until is not null and retention_until < now() and deleted_at is null
    ),
    'expired_ai_artifacts', (
      select count(*) from public.ai_artifacts
      where retention_until is not null and retention_until < now() and deleted_at is null
    )
  )
$$;

revoke all on function public.myvet_privacy_retention_preview() from public, anon, authenticated;
grant execute on function public.myvet_privacy_retention_preview() to service_role;

comment on table public.privacy_requests is
  'Tenant-scoped privacy-rights requests. Does not itself authorize deletion of medical or legally retained records.';
