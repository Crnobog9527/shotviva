-- T10: a paid renewal invoice (invoice.paid, billing_reason = subscription_cycle) grants one
-- period of credits (ARCHITECTURE §6.1, §6.2). Keyed by the invoice id, so a redelivered event
-- grants once. paid_until aligns to Stripe's period end instead of adding days, so it never
-- drifts with month lengths, and greatest() means a late or replayed older invoice can never
-- move it backwards. Reuses _apply_credit_change for the balance, ledger and idempotency; the
-- payments row is written in the same transaction.
--
-- Signature per ARCHITECTURE §6.1 "付款记录与续费函数": the payment facts follow
-- (user, product_id, invoice_id, period_end), since they are written in this transaction.
-- The ledger key 'renewal:in_…' is what admin_revenue_stats reads as a Stripe invoice (0167).
create function public.apply_subscription_renewal(
  p_user_id uuid,
  p_product_id text,
  p_invoice_id text,
  p_period_end timestamptz,
  p_amount_total integer,
  p_currency text,
  p_amount_tax integer,
  p_method text,
  p_charge_id text default null
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_change public.credit_change;
  v_key text := 'renewal:' || p_invoice_id;
begin
  if p_invoice_id is null or p_invoice_id not like 'in\_%' then
    raise exception 'INVALID_INPUT' using detail = 'invoice id is required';
  end if;
  if p_period_end is null then
    raise exception 'INVALID_INPUT' using detail = 'period end is required';
  end if;
  if p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  -- Only memberships renew; packs are always one-time.
  select * into v_product from public.products
   where id = p_product_id and active and days is not null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  -- No days here: paid_until is set below from the period end, not by adding days.
  v_change := public._apply_credit_change(
    p_user_id, 'paid', 'purchase', v_product.credits, 'renewal ' || v_product.id,
    v_key, null, v_product.id, null
  );
  if not v_change.applied then
    return v_change;
  end if;

  update public.profiles
     set paid_until = greatest(paid_until, p_period_end)
   where id = p_user_id
  returning paid_until into v_change.paid_until;

  -- The row was inserted just above in this transaction; record where paid_until landed, as
  -- membership purchases do.
  update public.credit_ledger
     set paid_until_after = v_change.paid_until
   where idempotency_key = v_key;

  insert into public.payments
    (user_id, product_id, channel, stripe_invoice_id, stripe_charge_id,
     amount_total, amount_tax, currency, method)
  values
    (p_user_id, p_product_id, 'stripe', p_invoice_id, p_charge_id,
     p_amount_total, p_amount_tax, lower(p_currency), p_method);

  return v_change;
end;
$$;

revoke execute on function public.apply_subscription_renewal(uuid, text, text, timestamptz, integer, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_renewal(uuid, text, text, timestamptz, integer, text, integer, text, text)
  to service_role;
