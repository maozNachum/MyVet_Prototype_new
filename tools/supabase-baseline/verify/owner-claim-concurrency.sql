\set ON_ERROR_STOP on

-- Hosted Preview acceptance for P0 3.2. The nested psql process is a
-- genuinely independent PostgreSQL connection that holds the same-email
-- advisory lock while this connection attempts the owner claim.

begin;
set local session_replication_role = replica;
delete from public.owners where owner_id in ('claim-race-owner-a', 'claim-race-owner-b');
delete from auth.users where id = '71000000-0000-4000-8000-000000000001';
delete from public.ai_feature_flags
where clinic_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);
delete from public.clinics
where clinic_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);
commit;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '71000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'claim-race@example.invalid',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

insert into public.clinics (clinic_id, slug, display_name)
values
  ('72000000-0000-4000-8000-000000000001', 'claim-race-a', 'Claim race clinic A'),
  ('72000000-0000-4000-8000-000000000002', 'claim-race-b', 'Claim race clinic B');

insert into public.owners (owner_id, clinic_id, email)
values (
  'claim-race-owner-a',
  '72000000-0000-4000-8000-000000000001',
  'claim-race@example.invalid'
);

\! psql --no-psqlrc -qAt -v ON_ERROR_STOP=1 -c "begin; insert into public.owners (owner_id, clinic_id, email) values ('claim-race-owner-b', '72000000-0000-4000-8000-000000000002', 'claim-race@example.invalid'); select pg_sleep(3); commit;" > /tmp/myvet-owner-claim-inserter.log 2>&1 &

select pg_sleep(0.75);
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","email":"claim-race@example.invalid","aal":"aal1"}',
  true
);

do $$
declare
  started_at timestamptz := clock_timestamp();
  elapsed interval;
begin
  begin
    perform public.claim_owner_profile();
    perform set_config('myvet.owner_claim_concurrency_result', 'unexpected_success', false);
  exception
    when sqlstate 'P0001' then
      elapsed := clock_timestamp() - started_at;
      if sqlerrm = 'OWNER_PROFILE_AMBIGUOUS' and elapsed >= interval '1 second' then
        perform set_config('myvet.owner_claim_concurrency_result', 'pass', false);
      else
        perform set_config(
          'myvet.owner_claim_concurrency_result',
          concat('unexpected_p0001:', sqlerrm, ':', elapsed),
          false
        );
      end if;
    when others then
      perform set_config(
        'myvet.owner_claim_concurrency_result',
        concat('unexpected_error:', sqlstate, ':', sqlerrm),
        false
      );
  end;
end;
$$;
commit;

begin;
set local session_replication_role = replica;
delete from public.owners where owner_id in ('claim-race-owner-a', 'claim-race-owner-b');
delete from auth.users where id = '71000000-0000-4000-8000-000000000001';
delete from public.ai_feature_flags
where clinic_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);
delete from public.clinics
where clinic_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
);
commit;

do $$
begin
  if current_setting('myvet.owner_claim_concurrency_result', true) <> 'pass' then
    raise exception 'OWNER_CLAIM_CONCURRENCY_FAILED:%',
      current_setting('myvet.owner_claim_concurrency_result', true);
  end if;
end;
$$;

select 'owner_claim_independent_connections_passed';
