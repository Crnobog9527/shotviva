-- T13: one paid Waffo one-time order settles in one call and one transaction (AGENTS §5.1):
-- grant through apply_purchase keyed by Waffo's payment id (the order.completed event id,
-- ARCHITECTURE §6.1), then, only when that grant applied, record the payment in T10's
-- payments table with channel 'waffo'. A redelivered event grants nothing and records
-- nothing more. The amounts are what the signed webhook says Waffo charged, never client input.
-- A second payment row for the same Waffo order violates payments.waffo_order_id's unique
-- constraint and rolls the grant back too (the webhook answers 500 and alerts).
create function public.settle_waffo_order(
  p_user_id uuid,
  p_product_id text,
  p_payment_id text,
  p_order_id text,
  p_amount_total integer,
  p_currency text,
  p_amount_tax integer,
  p_method text
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change public.credit_change;
begin
  if p_order_id is null or p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  v_change := public.apply_purchase(p_user_id, p_product_id, p_payment_id);

  if v_change.applied then
    insert into public.payments
      (user_id, product_id, channel, waffo_order_id, amount_total, amount_tax, currency, method)
    values
      (p_user_id, p_product_id, 'waffo', p_order_id, p_amount_total, p_amount_tax, lower(p_currency), p_method);
  end if;

  return v_change;
end;
$$;

revoke execute on function public.settle_waffo_order(uuid, text, text, text, integer, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_waffo_order(uuid, text, text, text, integer, text, integer, text)
  to service_role;
