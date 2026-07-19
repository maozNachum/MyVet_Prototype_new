-- Human-approved VetBot actions. The model can only propose an action; this
-- table and RPC form the authoritative, short-lived approval boundary.

create table if not exists public.vetbot_action_requests (
  action_request_id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_role text not null check (actor_role in ('clinic_admin', 'vet', 'nurse', 'secretary', 'owner')),
  action_type text not null check (action_type in (
    'book_appointment', 'reschedule_appointment', 'cancel_appointment',
    'adjust_inventory', 'archive_conversation', 'restore_conversation',
    'set_conversation_priority', 'set_lab_urgency', 'block_booking_time'
  )),
  payload jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'executed', 'rejected', 'expired', 'failed')),
  result jsonb null,
  error_code text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  confirmed_at timestamptz null,
  executed_at timestamptz null
);

create index if not exists vetbot_action_requests_actor_created_idx
  on public.vetbot_action_requests(actor_id, created_at desc);
create index if not exists vetbot_action_requests_pending_expiry_idx
  on public.vetbot_action_requests(expires_at)
  where status = 'pending';

alter table public.vetbot_action_requests enable row level security;
revoke all privileges on table public.vetbot_action_requests from anon;
revoke insert, update, delete on table public.vetbot_action_requests from authenticated;
grant select on table public.vetbot_action_requests to authenticated;
grant all privileges on table public.vetbot_action_requests to service_role;

drop policy if exists "myvet_vetbot_action_select_own" on public.vetbot_action_requests;
create policy "myvet_vetbot_action_select_own"
  on public.vetbot_action_requests for select to authenticated
  using ((select auth.uid()) = actor_id);

create or replace function public.myvet_execute_vetbot_action(requested_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  affected_count integer := 0;
  created_id bigint;
  action_result jsonb := '{}'::jsonb;
  pet_id_value bigint;
  appointment_id_value bigint;
  start_value timestamptz;
  end_value timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.vetbot_action_requests
  set status = 'expired'
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  select * into request_row
  from public.vetbot_action_requests
  where action_request_id = requested_action_id
    and actor_id = auth.uid()
  for update;

  if not found then
    raise exception 'ACTION_NOT_FOUND';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'ACTION_NOT_PENDING';
  end if;
  if request_row.expires_at <= now() then
    raise exception 'ACTION_EXPIRED';
  end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = auth.uid()
    and staff.is_active = true
  limit 1;

  if actor_current_role is null and exists (
    select 1 from public.owners as owner_profile where owner_profile.auth_user_id = auth.uid()
  ) then
    actor_current_role := 'owner';
  end if;

  if actor_current_role is null or actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    case request_row.action_type
      when 'book_appointment' then
        pet_id_value := (request_row.payload ->> 'pet_id')::bigint;
        start_value := (request_row.payload ->> 'start_time')::timestamptz;
        end_value := (request_row.payload ->> 'end_time')::timestamptz;

        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'PET_NOT_OWNED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        if not public.myvet_slot_is_bookable(start_value, end_value, null) then
          raise exception 'SLOT_NOT_AVAILABLE';
        end if;

        insert into public.appointments (
          pet_id, start_time, end_time, department, vet_name, room,
          appointment_type, appointment_mode, color, notes
        ) values (
          pet_id_value,
          start_value,
          end_value,
          left(coalesce(nullif(request_row.payload ->> 'department', ''), 'כללי'), 80),
          left(coalesce(nullif(request_row.payload ->> 'vet_name', ''), 'טרם שובץ'), 120),
          left(coalesce(nullif(request_row.payload ->> 'room', ''), case when request_row.payload ->> 'appointment_mode' = 'video' then 'דיגיטל' else 'טרם שובץ' end), 80),
          left(request_row.payload ->> 'appointment_type', 120),
          case when request_row.payload ->> 'appointment_mode' = 'video' then 'video' else 'physical' end,
          case when request_row.payload ->> 'urgency' = 'urgent' then 'red' else 'blue' end,
          nullif(left(coalesce(request_row.payload ->> 'notes', ''), 1000), '')
        ) returning appointment_id into created_id;
        action_result := jsonb_build_object('appointment_id', created_id);

      when 'reschedule_appointment' then
        appointment_id_value := (request_row.payload ->> 'appointment_id')::bigint;
        start_value := (request_row.payload ->> 'start_time')::timestamptz;
        end_value := (request_row.payload ->> 'end_time')::timestamptz;

        select appointment.pet_id into pet_id_value
        from public.appointments as appointment
        where appointment.appointment_id = appointment_id_value;
        if pet_id_value is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'APPOINTMENT_NOT_ALLOWED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        if not public.myvet_slot_is_bookable(start_value, end_value, appointment_id_value) then
          raise exception 'SLOT_NOT_AVAILABLE';
        end if;
        update public.appointments
        set start_time = start_value, end_time = end_value
        where appointment_id = appointment_id_value;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'APPOINTMENT_UPDATE_FAILED'; end if;
        action_result := jsonb_build_object('appointment_id', appointment_id_value);

      when 'cancel_appointment' then
        appointment_id_value := (request_row.payload ->> 'appointment_id')::bigint;
        select appointment.pet_id into pet_id_value
        from public.appointments as appointment
        where appointment.appointment_id = appointment_id_value;
        if pet_id_value is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
        if actor_current_role = 'owner' and not public.myvet_pet_owned(pet_id_value::text) then
          raise exception 'APPOINTMENT_NOT_ALLOWED';
        elsif actor_current_role <> 'owner' and not public.myvet_is_active_staff() then
          raise exception 'STAFF_REQUIRED';
        end if;
        delete from public.appointments where appointment_id = appointment_id_value;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'APPOINTMENT_DELETE_FAILED'; end if;
        action_result := jsonb_build_object('appointment_id', appointment_id_value);

      when 'adjust_inventory' then
        if actor_current_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
          raise exception 'STAFF_REQUIRED';
        end if;
        if (request_row.payload ->> 'new_quantity')::bigint < 0
          or (request_row.payload ->> 'new_quantity')::bigint > 1000000 then
          raise exception 'INVALID_QUANTITY';
        end if;
        update public.inventory
        set stock_quantity = (request_row.payload ->> 'new_quantity')::bigint
        where item_id = (request_row.payload ->> 'item_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
        action_result := jsonb_build_object('item_id', (request_row.payload ->> 'item_id')::bigint, 'new_quantity', (request_row.payload ->> 'new_quantity')::bigint);

      when 'archive_conversation' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        update public.conversations
        set status = 'closed', closed_at = now(), updated_at = now()
        where conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint);

      when 'restore_conversation' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        update public.conversations
        set status = 'waiting_staff', closed_at = null, updated_at = now()
        where conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint);

      when 'set_conversation_priority' then
        if actor_current_role = 'owner' then raise exception 'STAFF_REQUIRED'; end if;
        if request_row.payload ->> 'priority' not in ('normal', 'urgent') then
          raise exception 'INVALID_PRIORITY';
        end if;
        update public.conversations
        set priority = request_row.payload ->> 'priority', updated_at = now()
        where conversation_id = (request_row.payload ->> 'conversation_id')::bigint;
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'CONVERSATION_NOT_FOUND'; end if;
        action_result := jsonb_build_object('conversation_id', (request_row.payload ->> 'conversation_id')::bigint, 'priority', request_row.payload ->> 'priority');

      when 'set_lab_urgency' then
        if actor_current_role not in ('clinic_admin', 'vet', 'nurse') then
          raise exception 'MEDICAL_ROLE_REQUIRED';
        end if;
        update public.lab_orders
        set is_urgent = coalesce((request_row.payload ->> 'is_urgent')::boolean, false)
        where lab_order_id = (request_row.payload ->> 'lab_order_id')::bigint
          and coalesce(status, '') <> 'completed';
        get diagnostics affected_count = row_count;
        if affected_count <> 1 then raise exception 'OPEN_LAB_ORDER_NOT_FOUND'; end if;
        action_result := jsonb_build_object('lab_order_id', (request_row.payload ->> 'lab_order_id')::bigint);

      when 'block_booking_time' then
        if actor_current_role not in ('clinic_admin', 'secretary') then
          raise exception 'SCHEDULING_ROLE_REQUIRED';
        end if;
        insert into public.clinic_booking_blocks (
          block_date, is_all_day, starts_at, ends_at, reason, created_by
        ) values (
          (request_row.payload ->> 'block_date')::date,
          coalesce((request_row.payload ->> 'is_all_day')::boolean, false),
          case when coalesce((request_row.payload ->> 'is_all_day')::boolean, false) then null else (request_row.payload ->> 'starts_at')::time end,
          case when coalesce((request_row.payload ->> 'is_all_day')::boolean, false) then null else (request_row.payload ->> 'ends_at')::time end,
          nullif(left(coalesce(request_row.payload ->> 'reason', ''), 200), ''),
          auth.uid()
        ) returning block_id into created_id;
        action_result := jsonb_build_object('block_id', created_id);
      else
        raise exception 'ACTION_TYPE_NOT_ALLOWED';
    end case;

    update public.vetbot_action_requests
    set status = 'executed', result = action_result, confirmed_at = now(), executed_at = now(), error_code = null
    where action_request_id = requested_action_id;

    return jsonb_build_object('ok', true, 'action_type', request_row.action_type, 'result', action_result);
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object('ok', false, 'action_type', request_row.action_type, 'error_code', left(sqlerrm, 120));
  end;
end;
$$;

revoke all on function public.myvet_execute_vetbot_action(uuid) from public;
revoke all on function public.myvet_execute_vetbot_action(uuid) from anon;
grant execute on function public.myvet_execute_vetbot_action(uuid) to authenticated, service_role;

comment on table public.vetbot_action_requests is
  'Short-lived, server-created VetBot action previews. Payloads are never sent back to the browser; execution requires the same authenticated actor and a fresh role check.';
comment on function public.myvet_execute_vetbot_action(uuid) is
  'Executes only a fixed allowlist of human-approved VetBot actions after authorization, expiry and current-state validation.';
