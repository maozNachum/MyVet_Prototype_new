-- Keep the demo-card marker in the immutable transaction ledger while using
-- the existing credit value accepted by payments.payment_method.
create or replace function public.myvet_owner_settle_demo_payment(requested_payment_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_payment public.payments%rowtype;
  settled_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into target_payment
  from public.payments
  where payments.payment_id = requested_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if not public.myvet_owner_matches(target_payment.owner_id) then
    raise exception 'PAYMENT_NOT_OWNED';
  end if;

  if target_payment.status = 'paid' then
    return jsonb_build_object(
      'payment_id', target_payment.payment_id,
      'status', target_payment.status,
      'amount', target_payment.amount,
      'already_paid', true
    );
  end if;

  if target_payment.status not in ('unpaid', 'partial') then
    raise exception 'PAYMENT_NOT_OPEN';
  end if;

  update public.payments
  set status = 'paid',
      payment_method = 'credit',
      paid_at = settled_at
  where payment_id = target_payment.payment_id;

  insert into public.payment_transactions (
    payment_id, owner_id, amount, payment_method, tendered_amount,
    change_amount, source, processed_by, created_at
  ) values (
    target_payment.payment_id, target_payment.owner_id, target_payment.amount,
    'portal_demo', target_payment.amount, 0, 'owner_portal_demo', auth.uid(), settled_at
  );

  return jsonb_build_object(
    'payment_id', target_payment.payment_id,
    'status', 'paid',
    'amount', target_payment.amount,
    'payment_method', 'credit',
    'paid_at', settled_at,
    'already_paid', false
  );
end;
$$;

revoke all on function public.myvet_owner_settle_demo_payment(bigint) from public;
revoke all on function public.myvet_owner_settle_demo_payment(bigint) from anon;
grant execute on function public.myvet_owner_settle_demo_payment(bigint) to authenticated, service_role;
