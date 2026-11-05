-- T9: one paid Stripe Checkout Session settles in one call and one transaction (AGENTS §5.1):
-- for a subscription, mirror its current state into `subscriptions`; then grant the purchase
-- through apply_purchase, keyed by the session id (ARCHITECTURE §6.1), so every redelivery
-- or sibling event of one session grants once. If the grant fails, the mirror rolls back too.
-- The subscription fields are Stripe's state as the webhook just retrieved it, never the
-- event payload, so a late event cannot roll the mirror back to an older state.
create function public.settle_checkout(
  p_user_id uuid,
  p_product_id text,
  p_session_id text,
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
begin
  if p_subscription_id is not null then
    if p_subscription_status is null or p_current_period_end is null or p_cancel_at_period_end is null then
      raise exception 'INVALID_INPUT' using detail = 'subscription fields are all required';
    end if;
    -- Upsert by the primary key; a subscription id already mirrored for another user or
    -- product updates nothing and is refused.
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

  return public.apply_purchase(p_user_id, p_product_id, p_session_id);
end;
$$;

revoke execute on function public.settle_checkout(uuid, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_checkout(uuid, text, text, text, text, timestamptz, boolean)
  to service_role;
