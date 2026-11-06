-- T10: settle_checkout also writes the payments row, in the same transaction as the mirror and
-- the grant (ARCHITECTURE §6.1 "付款记录与续费函数").
--
-- Why drop and recreate instead of create or replace (AGENTS §5 allows it when the signature
-- must change): the payment facts (amount, tax, currency, method, invoice / charge id) have to
-- reach the function to be written in its transaction, and the 0083 signature has no room for
-- them. Adding parameters to a create or replace would leave the old 7-argument version behind
-- as an overload that grants without recording a payment, so it is removed.
--
-- Everything else is unchanged from 0083: mirror first (refusing a subscription id owned by
-- another user or product), then apply_purchase keyed by the session id. The payment row is
-- written only when the grant applies, so a redelivered or sibling event records nothing more.
drop function public.settle_checkout(uuid, text, text, text, text, timestamptz, boolean);

create function public.settle_checkout(
  p_user_id uuid,
  p_product_id text,
  p_session_id text,
  p_amount_total integer,
  p_currency text,
  p_amount_tax integer,
  p_method text,
  p_invoice_id text default null,
  p_charge_id text default null,
  p_subscription_id text default null,
  p_subscription_status text default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default null
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change public.credit_change;
begin
  if p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  if p_subscription_id is not null then
    if p_subscription_status is null or p_current_period_end is null or p_cancel_at_period_end is null then
      raise exception 'INVALID_INPUT' using detail = 'subscription fields are all required';
    end if;
    insert into public.subscriptions
      (stripe_subscription_id, user_id, product_id, status, current_period_end, cancel_at_period_end)
    values
      (p_subscription_id, p_user_id, p_product_id, p_subscription_status, p_current_period_end, p_cancel_at_period_end)
    on conflict (stripe_subscription_id) do update
       set status = excluded.status,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = now()
     where public.subscriptions.user_id = excluded.user_id
       and public.subscriptions.product_id = excluded.product_id;
    if not found then
      raise exception 'IDEMPOTENCY_CONFLICT' using detail = 'subscription belongs to another user or product';
    end if;
  end if;

  v_change := public.apply_purchase(p_user_id, p_product_id, p_session_id);

  if v_change.applied then
    insert into public.payments
      (user_id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id,
       amount_total, amount_tax, currency, method)
    values
      (p_user_id, p_product_id, 'stripe', p_session_id, p_invoice_id, p_charge_id,
       p_amount_total, p_amount_tax, lower(p_currency), p_method);
  end if;

  return v_change;
end;
$$;

revoke execute on function public.settle_checkout(uuid, text, text, integer, text, integer, text, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_checkout(uuid, text, text, integer, text, integer, text, text, text, text, text, timestamptz, boolean)
  to service_role;
