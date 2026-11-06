-- T50 (ARCHITECTURE §6.3): a Waffo card subscription is one order (ORD_…) with a charge every
-- period, so payments gets one row per charge, keyed by Waffo's payment id (PAY_…, the same id
-- apply_purchase is keyed by). waffo_order_id stops being unique and keeps an index for the
-- admin lookup. Every new Waffo row carries its payment id; rows written before T50 may not
-- (NOT VALID: the check applies to new and changed rows only, ARCHITECTURE §6.3 payments).
alter table public.payments
  add column waffo_payment_id text,
  add constraint payments_waffo_payment_id_check check (waffo_payment_id ~ '^PAY_'),
  add constraint payments_waffo_payment_id_key unique (waffo_payment_id);
alter table public.payments
  add constraint payments_waffo_payment_ids_check check (channel <> 'waffo' or waffo_payment_id is not null) not valid;

alter table public.payments drop constraint payments_waffo_order_id_key;
create index payments_waffo_order_id_idx on public.payments (waffo_order_id) where waffo_order_id is not null;

-- Same signature as 0200: every Waffo charge (order.completed, subscription.payment_succeeded)
-- grants through apply_purchase keyed by the payment id and, when that grant is new, records
-- one payments row with both ids. A redelivered charge grants and records nothing.
create or replace function public.settle_waffo_order(
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
      (user_id, product_id, channel, waffo_order_id, waffo_payment_id, amount_total, amount_tax, currency, method)
    values
      (p_user_id, p_product_id, 'waffo', p_order_id, p_payment_id, p_amount_total, p_amount_tax, lower(p_currency), p_method);
  end if;

  return v_change;
end;
$$;
