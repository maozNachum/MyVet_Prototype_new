-- Local / explicitly verified Staging only. Synthetic rows, always rolled back.
begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
values ('97000000-0000-4000-8000-000000000001','authenticated','authenticated','p0-boundary@example.invalid',now(),now(),now());
insert into public.clinics(clinic_id,slug,display_name) values
('97000000-0000-4000-8000-000000000010','p0-boundary-a','P0 Boundary A'),
('97000000-0000-4000-8000-000000000020','p0-boundary-b','P0 Boundary B');
insert into public.staff(staff_id,clinic_id,auth_user_id,role,is_active,name)
values ('97000000-0000-4000-8000-000000000030','97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000001','vet',true,'P0 Boundary Vet');
insert into public.owners(owner_id,clinic_id,auth_user_id,email) values
('P0-BOUNDARY-A','97000000-0000-4000-8000-000000000010',null,'p0-owner-a@example.invalid'),
('P0-BOUNDARY-B','97000000-0000-4000-8000-000000000020','97000000-0000-4000-8000-000000000001','p0-boundary@example.invalid');
insert into public.patients(pet_id,clinic_id,owner_id,pet_name,weight)
values (970001,'97000000-0000-4000-8000-000000000010','P0-BOUNDARY-A','P0 Boundary Pet',1);
insert into public.inventory(clinic_id,item_name,category,stock_quantity,low_stock_threshold,price)
values ('97000000-0000-4000-8000-000000000020','P0 shared name','equipment',1,0,2);
insert into public.vetbot_action_requests(action_request_id,actor_id,actor_role,clinic_id,action_type,payload)
values ('97000000-0000-4000-8000-000000000040','97000000-0000-4000-8000-000000000001','vet','97000000-0000-4000-8000-000000000010','create_inventory_item',
'{"item_name":"P0 shared name","category":"equipment","stock_quantity":1,"low_stock_threshold":0,"price":2}');

insert into public.vetbot_action_requests(action_request_id,actor_id,actor_role,clinic_id,action_type,payload)
select '97000000-0000-4000-8000-000000000041','97000000-0000-4000-8000-000000000001','vet','97000000-0000-4000-8000-000000000010','adjust_inventory',
  jsonb_build_object('item_id',item_id,'new_quantity',50)
from public.inventory where clinic_id='97000000-0000-4000-8000-000000000020' and item_name='P0 shared name';

select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select public.myvet_set_active_clinic('97000000-0000-4000-8000-000000000010');
do $$
declare r jsonb;
begin
  r := public.myvet_save_medical_entry('97000000-0000-4000-8000-000000000050',
    '{"petId":970001,"visitDate":"2030-01-01T10:00:00Z","visitType":"note","reason":"P0 synthetic note","treatment":"P0 synthetic treatment"}');
  if (r->>'idempotentReplay')::boolean is distinct from false then raise exception 'INITIAL_SAVE_FAILED'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$
declare blocked boolean := false;
begin
  begin
    perform public.myvet_save_medical_entry('97000000-0000-4000-8000-000000000050',
      '{"petId":970001,"visitDate":"2030-01-01T10:00:00Z","visitType":"note","reason":"P0 synthetic note","treatment":"P0 synthetic treatment"}');
  exception when others then
    if sqlerrm='MFA_REQUIRED' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'AAL1_REPLAY_NOT_BLOCKED'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
do $$
declare r jsonb;
begin
  r := public.myvet_save_medical_entry('97000000-0000-4000-8000-000000000050',
    '{"petId":970001,"visitDate":"2030-01-01T10:00:00Z","visitType":"note","reason":"P0 synthetic note","treatment":"P0 synthetic treatment"}');
  if (r->>'idempotentReplay')::boolean is distinct from true then raise exception 'AAL2_REPLAY_FAILED'; end if;
end;
$$;
-- Same user legitimately owns a profile in B; switching must not move a staff
-- action prepared for A into B, or use the staff role from A in B.
select public.myvet_set_active_clinic('97000000-0000-4000-8000-000000000020');
do $$
declare blocked boolean := false;
begin
  begin
    perform public.myvet_execute_vetbot_inventory_create('97000000-0000-4000-8000-000000000040');
  exception when others then
    if sqlerrm='ACTION_CLINIC_CHANGED' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'ACTION_CLINIC_SWITCH_NOT_BLOCKED'; end if;
end;
$$;
select public.myvet_set_active_clinic('97000000-0000-4000-8000-000000000010');
do $$
declare r jsonb;
begin
  r := public.myvet_execute_vetbot_inventory_create('97000000-0000-4000-8000-000000000040');
  if (r->>'ok')::boolean is distinct from true then raise exception 'INVENTORY_CREATE_FAILED: %',r; end if;
  if not exists(select 1 from public.inventory where item_id=(r->'result'->>'item_id')::bigint and clinic_id='97000000-0000-4000-8000-000000000010') then
    raise exception 'INVENTORY_WRONG_CLINIC';
  end if;
end;
$$;
do $$
declare r jsonb;
begin
  r := public.myvet_execute_vetbot_action_v2('97000000-0000-4000-8000-000000000041');
  if (r->>'ok')::boolean is distinct from false or r->>'error_code' is distinct from 'INVENTORY_ITEM_NOT_FOUND' then
    raise exception 'FOREIGN_INVENTORY_DELEGATION_NOT_BLOCKED: %',r;
  end if;
end;
$$;
reset role;
do $$
begin
  if not exists(select 1 from public.inventory where clinic_id='97000000-0000-4000-8000-000000000020' and item_name='P0 shared name' and stock_quantity=1) then
    raise exception 'FOREIGN_INVENTORY_CHANGED';
  end if;
end;
$$;
rollback;
do $$
begin
  if exists(select 1 from public.clinics where clinic_id in ('97000000-0000-4000-8000-000000000010','97000000-0000-4000-8000-000000000020'))
    or exists(select 1 from auth.users where id='97000000-0000-4000-8000-000000000001') then
    raise exception 'P0_BOUNDARY_FIXTURES_REMAIN';
  end if;
end;
$$;
select 'definer_boundary_acceptance_passed' as result;
