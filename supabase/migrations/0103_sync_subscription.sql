-- T10: customer.subscription.updated / deleted only update the mirror (ARCHITECTURE §6.2):
-- status, period end and cancel_at_period_end, as the webhook just retrieved them from Stripe,
-- so a late event writes today's state, not the one it carried. Never touches credits or
-- paid_until; a cancelled subscription keeps its row with status 'canceled'.
--
-- Only updates a row settle_checkout created: the first payment is what ties a subscription to
-- a user and product. An unknown id (an update that beats the first payment's event, or a
-- subscription that never paid) changes nothing and returns false; settle_checkout writes the
-- current state when the first payment lands. Lookup by the primary key.
create function public.sync_subscription(
  p_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_subscription_id is null or p_status is null or p_current_period_end is null or p_cancel_at_period_end is null then
    raise exception 'INVALID_INPUT' using detail = 'subscription fields are all required';
  end if;

  update public.subscriptions
     set status = p_status,
         current_period_end = p_current_period_end,
         cancel_at_period_end = p_cancel_at_period_end,
         updated_at = now()
   where stripe_subscription_id = p_subscription_id;
  return found;
end;
$$;

revoke execute on function public.sync_subscription(text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.sync_subscription(text, text, timestamptz, boolean)
  to service_role;
