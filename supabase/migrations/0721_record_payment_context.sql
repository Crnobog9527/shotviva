-- T82: copy the checkout context onto the payment row its session settled into (0720). Called
-- by the Stripe webhook right after settle_checkout, for the first and every redelivered event:
-- first write wins (coalesce), so a replay changes nothing. Answers false when the session has
-- no payment row (not settled yet), which the caller ignores.
create function public.record_payment_context(
  p_session_id text,
  p_ip inet default null,
  p_user_agent text default null,
  p_terms_accepted_at timestamptz default null,
  p_managed_payments boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_id is null or p_session_id not like 'cs\_%' then
    raise exception 'INVALID_INPUT' using detail = 'a cs_ session id is required';
  end if;

  update public.payments
     set purchase_ip = coalesce(purchase_ip, p_ip),
         purchase_user_agent = coalesce(purchase_user_agent, nullif(left(p_user_agent, 500), '')),
         terms_accepted_at = coalesce(terms_accepted_at, p_terms_accepted_at),
         managed_payments = coalesce(managed_payments, p_managed_payments)
   where stripe_session_id = p_session_id;
  return found;
end;
$$;

revoke execute on function public.record_payment_context(text, inet, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.record_payment_context(text, inet, text, timestamptz, boolean)
  to service_role;
