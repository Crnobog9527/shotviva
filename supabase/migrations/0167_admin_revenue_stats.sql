-- T23 PR B: revenue for the admin overview and /admin/orders (ARCHITECTURE §10). A separate
-- function from admin_dashboard_stats, created once (spec: no create-or-replace later).
--
-- Source is the ledger (Plan A, control 2026-11-06): every settled payment is a paid-pool
-- `purchase` row whose idempotency key carries the provider's id. Amounts are the product's
-- list price (products.price_usd), not what was charged: tax and refunds live in Stripe. A
-- payments table with real amounts arrives with T10, and this function's callers switch then.
--
-- Channel from the key: 'purchase:cs_…' (Stripe Checkout) and '…:in_…' (Stripe invoice,
-- T10 renewals) are Stripe; anything else is Waffo. Days are Beijing days, like the overview.
-- Index: credit_ledger_purchases_created_at_id_idx (0166); subscriptions is one row per
-- subscriber and is counted whole.

create function public.admin_revenue_stats(p_days integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz constant text := 'Asia/Shanghai';
  v_today timestamptz;
  v_start timestamptz;
  v_result jsonb;
begin
  if p_days is null or p_days < 7 or p_days > 90 then
    raise exception 'INVALID_INPUT' using detail = 'p_days must be between 7 and 90';
  end if;

  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_start := v_today - make_interval(days => p_days - 1);

  with windows(key, since) as (
    values ('today', v_today), ('7d', v_today - interval '6 days'), ('period', v_start)
  ),
  purchases as (
    select l.created_at,
           l.product_id,
           case when l.idempotency_key ~ ':(cs|in)_' then 'stripe' else 'waffo' end as channel,
           coalesce(p.price_usd, 0) as amount
      from public.credit_ledger l
      left join public.products p on p.id = l.product_id
     where l.kind = 'purchase' and l.created_at >= v_start
  )
  select jsonb_build_object(
           'timezone', v_tz,
           'days', p_days,
           'generated_at', now(),
           'windows', (
             select jsonb_agg(jsonb_build_object(
                      'key', w.key,
                      'since', w.since,
                      'purchases', (select count(*) from purchases x where x.created_at >= w.since),
                      'revenue_usd', (select coalesce(sum(x.amount), 0) from purchases x where x.created_at >= w.since)
                    ) order by w.since desc)
               from windows w
           ),
           'by_product', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'product_id', g.product_id, 'channel', g.channel,
                      'purchases', g.purchases, 'revenue_usd', g.revenue
                    ) order by g.revenue desc, g.product_id, g.channel)
               from (
                 select coalesce(x.product_id, 'unknown') as product_id, x.channel,
                        count(*) as purchases, sum(x.amount) as revenue
                   from purchases x
                  group by 1, 2
               ) g
           ), '[]'::jsonb),
           'trend', (
             select jsonb_agg(jsonb_build_object(
                      'day', to_char(d.day at time zone v_tz, 'YYYY-MM-DD'),
                      'revenue_usd', (select coalesce(sum(x.amount), 0) from purchases x
                                       where x.created_at >= d.day and x.created_at < d.day + interval '1 day')
                    ) order by d.day)
               from generate_series(v_start, v_today, interval '1 day') as d(day)
           ),
           'subscriptions', coalesce((
             select jsonb_object_agg(s.status, s.n)
               from (select status, count(*) as n from public.subscriptions group by status) s
           ), '{}'::jsonb)
         )
    into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_revenue_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_revenue_stats(integer) to service_role;
