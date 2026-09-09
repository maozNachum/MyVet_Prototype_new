\set ON_ERROR_STOP on

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'mfa-admin@example.invalid', now(), now()),
  ('61000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'mfa-vet@example.invalid', now(), now()),
  ('61000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'mfa-nurse@example.invalid', now(), now()),
  ('61000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'mfa-owner@example.invalid', now(), now());

insert into public.clinics (clinic_id, slug, display_name)
values
  ('62000000-0000-4000-8000-000000000001', 'auth-hardening-a', 'Auth Hardening Clinic A'),
  ('62000000-0000-4000-8000-000000000002', 'auth-hardening-b', 'Auth Hardening Clinic B');

insert into public.staff (staff_id, clinic_id, auth_user_id, role, is_active, name)
values
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'clinic_admin', true, 'MFA Admin'),
  ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 'vet', true, 'MFA Vet'),
  ('63000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', 'nurse', true, 'MFA Nurse');

insert into public.owners (owner_id, clinic_id, auth_user_id, email)
values
  ('AUTH-OWNER-A', '62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000004', 'mfa-owner@example.invalid'),
  ('AUTH-OWNER-B', '62000000-0000-4000-8000-000000000002', null, 'mfa-owner-b@example.invalid');

insert into public.patients (pet_id, clinic_id, owner_id, pet_name, weight)
values
  (961001, '62000000-0000-4000-8000-000000000001', 'AUTH-OWNER-A', 'MFA Pet A', 1),
  (961002, '62000000-0000-4000-8000-000000000002', 'AUTH-OWNER-B', 'MFA Pet B', 1);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$
begin
  if public.myvet_is_active_staff() then
    raise exception 'AAL1_ADMIN_RETAINED_STAFF_ACCESS';
  end if;
  if (select count(*) from public.staff) <> 1 then
    raise exception 'AAL1_ADMIN_MFA_BOOTSTRAP_PROFILE_UNAVAILABLE';
  end if;
  if exists (select 1 from public.patients) then
    raise exception 'AAL1_ADMIN_RETAINED_PATIENT_ACCESS';
  end if;
end;
$$;

reset role;
do $$
begin
  if private.myvet_current_clinic_id() is not null then
    raise exception 'AAL1_ADMIN_RETAINED_TENANT_RESOLUTION';
  end if;
end;
$$;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$
begin
  if not public.myvet_is_active_staff() then
    raise exception 'AAL2_ADMIN_STAFF_ACCESS_DENIED';
  end if;
  if (select count(*) from public.patients) <> 1 then
    raise exception 'AAL2_ADMIN_PATIENT_ISOLATION_FAILED';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$
begin
  if public.myvet_is_active_staff() or exists (select 1 from public.patients) then
    raise exception 'AAL1_VET_RETAINED_CLINIC_ACCESS';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$
begin
  if not public.myvet_is_active_staff() then
    raise exception 'AAL1_NURSE_LOST_STAFF_ACCESS';
  end if;
  if (select count(*) from public.patients) <> 1 then
    raise exception 'AAL1_NURSE_TENANT_ACCESS_FAILED';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.patients) <> 1 then
    raise exception 'OWNER_PATIENT_ACCESS_CHANGED_BY_MFA';
  end if;
end;
$$;

reset role;
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values
  ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', now(), now(), 'aal2'),
  ('64000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', now(), now(), 'aal1');

update public.staff
set role = 'vet'
where auth_user_id = '61000000-0000-4000-8000-000000000001';

update public.staff
set is_active = false
where auth_user_id = '61000000-0000-4000-8000-000000000003';

do $$
begin
  if exists (
    select 1 from auth.sessions
    where user_id in (
      '61000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003'
    )
  ) then
    raise exception 'STAFF_SESSION_REVOCATION_FAILED';
  end if;
end;
$$;

rollback;

select 'auth_hardening_passed' as result;
