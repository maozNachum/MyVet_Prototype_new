-- Complete the privacy-request workflow after staff MFA enforcement exists.
-- Open requests are unique per owner/type, submission is concurrency-safe,
-- and only an AAL2 clinic administrator may read or manage the clinic queue.

create unique index if not exists privacy_requests_one_open_owner_type_uidx
  on public.privacy_requests (clinic_id, owner_id, request_type)
  where status in ('submitted', 'identity_review', 'in_review');

drop policy if exists privacy_requests_staff_select on public.privacy_requests;
create policy privacy_requests_staff_select on public.privacy_requests
for select to authenticated
using (
  private.myvet_is_clinic_staff(
    clinic_id,
    array['clinic_admin']::text[]
  )
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
  actor_id uuid := (select auth.uid());
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || normalized_type, 0)
  );

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
  )
  on conflict (clinic_id, owner_id, request_type)
    where status in ('submitted', 'identity_review', 'in_review')
  do nothing
  returning request_id into created_request_id;

  if created_request_id is not null then
    return created_request_id;
  end if;

  select request.request_id into existing_request_id
  from public.privacy_requests as request
  where request.clinic_id = target_owner.clinic_id
    and request.owner_id = target_owner.owner_id
    and request.request_type = normalized_type
    and request.status in ('submitted', 'identity_review', 'in_review')
  order by request.submitted_at desc
  limit 1;

  if existing_request_id is null then
    raise exception 'PRIVACY_REQUEST_SUBMISSION_CONFLICT' using errcode = 'P0001';
  end if;

  return existing_request_id;
end;
$$;

revoke all on function public.myvet_submit_privacy_request(text, text)
from public, anon;
grant execute on function public.myvet_submit_privacy_request(text, text)
to authenticated, service_role;

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
  actor_id uuid := (select auth.uid());
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

  if not private.myvet_staff_mfa_satisfied(actor_staff.role) then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
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
      completed_at = case
        when normalized_status in ('completed', 'rejected', 'cancelled') then now()
        else null
      end,
      handled_by = actor_staff.staff_id,
      updated_at = now()
  where request_id = requested_request_id;

  return requested_request_id;
end;
$$;

revoke all on function public.myvet_manage_privacy_request(uuid, text, text)
from public, anon;
grant execute on function public.myvet_manage_privacy_request(uuid, text, text)
to authenticated, service_role;

comment on index public.privacy_requests_one_open_owner_type_uidx is
  'Prevents duplicate open privacy requests for the same owner and request type.';
comment on function public.myvet_submit_privacy_request(text, text) is
  'Submits one tenant-derived, concurrency-safe open privacy request for the authenticated owner.';
comment on function public.myvet_manage_privacy_request(uuid, text, text) is
  'Allows only an active AAL2 clinic administrator to manage a request in the same clinic.';
