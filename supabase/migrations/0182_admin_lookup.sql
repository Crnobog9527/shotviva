-- T25: the support lookup box (ARCHITECTURE §10「万能查找」). Whatever the Owner pastes — an
-- account or job id, a Stripe id from a receipt, a Waffo order number or part of an email — is
-- routed by its shape and answered with at most one row {kind, user_id, job_id}; the page then
-- opens that user's detail (and highlights the job). One round trip; every branch is a unique
-- index or primary key except the email substring, which scans auth.users like
-- admin_search_users (0165).
--   uuid        profiles_pkey, then generation_jobs_pkey
--   cs_…        payments_stripe_session_id_key, then credit_ledger_idempotency_key_key
--               ('purchase:cs_…', checkouts settled before T10's payments table)
--   in_…        payments_stripe_invoice_id_key, then the renewal ledger key 'renewal:in_…'
--   ch_… / py_  payments_stripe_charge_id_key
--   sub_…       subscriptions_pkey
--   other       payments_waffo_order_id_key, the Waffo payment id ledger key, then an email
--               substring that matches exactly one account (several matches: no row, and the
--               page falls back to the list from admin_search_users)

create function public.admin_lookup(p_query text)
returns table (kind text, user_id uuid, job_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_users uuid[];
begin
  if length(v_q) = 0 or length(v_q) > 320 then
    return;
  end if;

  if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return query select 'user'::text, p.id, null::uuid from public.profiles p where p.id = v_q::uuid;
    if found then return; end if;
    return query select 'job'::text, j.user_id, j.id from public.generation_jobs j where j.id = v_q::uuid;
    return;
  end if;

  if v_q like 'cs\_%' then
    return query select 'checkout'::text, pay.user_id, null::uuid from public.payments pay where pay.stripe_session_id = v_q;
    if found then return; end if;
    return query select 'checkout'::text, l.user_id, null::uuid from public.credit_ledger l where l.idempotency_key = 'purchase:' || v_q;
    return;
  end if;

  if v_q like 'in\_%' then
    return query select 'invoice'::text, pay.user_id, null::uuid from public.payments pay where pay.stripe_invoice_id = v_q;
    if found then return; end if;
    return query select 'invoice'::text, l.user_id, null::uuid from public.credit_ledger l where l.idempotency_key = 'renewal:' || v_q;
    return;
  end if;

  if v_q ~ '^(ch|py)_' then
    return query select 'charge'::text, pay.user_id, null::uuid from public.payments pay where pay.stripe_charge_id = v_q;
    return;
  end if;

  if v_q like 'sub\_%' then
    return query select 'subscription'::text, s.user_id, null::uuid from public.subscriptions s where s.stripe_subscription_id = v_q;
    return;
  end if;

  return query select 'waffo'::text, pay.user_id, null::uuid from public.payments pay where pay.waffo_order_id = v_q;
  if found then return; end if;
  return query select 'waffo'::text, l.user_id, null::uuid from public.credit_ledger l where l.idempotency_key = 'purchase:' || v_q;
  if found then return; end if;

  -- The query is a literal substring: % and _ typed by the admin match themselves.
  select array_agg(u.id) into v_users
    from (select au.id from auth.users au
           where au.email ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           limit 2) u;
  if cardinality(v_users) = 1 then
    return query select 'email'::text, v_users[1], null::uuid;
  end if;
end;
$$;

revoke execute on function public.admin_lookup(text) from public, anon, authenticated;
grant execute on function public.admin_lookup(text) to service_role;
