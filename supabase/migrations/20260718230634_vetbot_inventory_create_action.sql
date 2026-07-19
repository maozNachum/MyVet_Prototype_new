-- Adds a separately approved VetBot action for creating an inventory item.
-- The Edge Function creates only a short-lived preview. This RPC revalidates
-- the authenticated actor and payload before the database write.

alter table public.vetbot_action_requests
  drop constraint if exists vetbot_action_requests_action_type_check;

alter table public.vetbot_action_requests
  add constraint vetbot_action_requests_action_type_check check (action_type in (
    'book_appointment', 'reschedule_appointment', 'cancel_appointment',
    'adjust_inventory', 'create_inventory_item', 'archive_conversation',
    'restore_conversation', 'set_conversation_priority', 'set_lab_urgency',
    'block_booking_time'
  ));

create or replace function public.myvet_execute_vetbot_inventory_create(requested_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.vetbot_action_requests%rowtype;
  actor_current_role text;
  created_id bigint;
  item_name_value text;
  category_value text;
  quantity_value bigint;
  threshold_value integer;
  price_value numeric;
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

  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if request_row.status <> 'pending' then raise exception 'ACTION_NOT_PENDING'; end if;
  if request_row.expires_at <= now() then raise exception 'ACTION_EXPIRED'; end if;
  if request_row.action_type <> 'create_inventory_item' then raise exception 'ACTION_TYPE_NOT_ALLOWED'; end if;

  select staff.role into actor_current_role
  from public.staff as staff
  where staff.auth_user_id = auth.uid()
    and staff.is_active = true
  limit 1;

  if actor_current_role not in ('clinic_admin', 'vet', 'nurse', 'secretary') then
    raise exception 'STAFF_REQUIRED';
  end if;
  if actor_current_role <> request_row.actor_role then
    raise exception 'ROLE_CHANGED_OR_NOT_ALLOWED';
  end if;

  begin
    item_name_value := btrim(request_row.payload ->> 'item_name');
    category_value := request_row.payload ->> 'category';
    quantity_value := (request_row.payload ->> 'stock_quantity')::bigint;
    threshold_value := (request_row.payload ->> 'low_stock_threshold')::integer;
    price_value := round((request_row.payload ->> 'price')::numeric, 2);

    if item_name_value is null or length(item_name_value) < 2 or length(item_name_value) > 160 then
      raise exception 'INVALID_ITEM_NAME';
    end if;
    if category_value not in ('medication', 'equipment', 'consumable', 'other') then
      raise exception 'INVALID_CATEGORY';
    end if;
    if quantity_value < 0 or quantity_value > 1000000
      or threshold_value < 0 or threshold_value > 1000000
      or price_value < 0 or price_value > 1000000 then
      raise exception 'INVALID_INVENTORY_VALUES';
    end if;
    if exists (
      select 1
      from public.inventory as existing_item
      where lower(regexp_replace(btrim(existing_item.item_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(item_name_value, '\s+', ' ', 'g'))
    ) then
      raise exception 'INVENTORY_ITEM_ALREADY_EXISTS';
    end if;

    insert into public.inventory (
      item_name, category, stock_quantity, low_stock_threshold, price
    ) values (
      item_name_value, category_value, quantity_value, threshold_value, price_value
    ) returning item_id into created_id;

    update public.vetbot_action_requests
    set status = 'executed',
        result = jsonb_build_object('item_id', created_id),
        confirmed_at = now(),
        executed_at = now(),
        error_code = null
    where action_request_id = requested_action_id;

    return jsonb_build_object(
      'ok', true,
      'action_type', request_row.action_type,
      'result', jsonb_build_object('item_id', created_id)
    );
  exception when others then
    update public.vetbot_action_requests
    set status = 'failed', error_code = left(sqlerrm, 120), confirmed_at = now()
    where action_request_id = requested_action_id;
    return jsonb_build_object(
      'ok', false,
      'action_type', request_row.action_type,
      'error_code', left(sqlerrm, 120)
    );
  end;
end;
$$;

revoke all on function public.myvet_execute_vetbot_inventory_create(uuid) from public;
revoke all on function public.myvet_execute_vetbot_inventory_create(uuid) from anon;
grant execute on function public.myvet_execute_vetbot_inventory_create(uuid) to authenticated, service_role;

comment on function public.myvet_execute_vetbot_inventory_create(uuid) is
  'Creates one inventory item only after VetBot preview approval and a fresh staff-role check.';

-- Safe rollback: deploy the previous Edge Function, revoke and drop the RPC.
-- Keep the widened action_type constraint until no create_inventory_item audit
-- requests remain; narrowing it while rows exist would fail and is unnecessary.
