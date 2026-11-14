-- T10 follow-up (numbered in T23's range so it runs after 0167, which creates the function):
-- admin_revenue_stats reads what was actually charged (payments, 0100) instead
-- of list prices from the ledger (0167, Plan A). Same signature and the same jsonb shape, so
-- the overview and /admin/orders callers are unchanged; create or replace, approved by control
-- (ARCHITECTURE §10: a documented exception to "written once"; the source table only existed
-- after T10).
--
-- revenue_usd is net: amount_total − amount_tax − amount_refunded, in dollars. Managed Payments
-- withholds the tax, and refunds are money returned. Disputed payments still count; their
-- status shows on the list. Stripe amounts are in the Price's currency (USD) — Adaptive Pricing
-- keeps the buyer's currency in presentment_details — so a non-USD row is not expected; one
-- would count as a purchase and add nothing to revenue_usd. The return shape is 0167's,
-- unchanged (ARCHITECTURE §10).
-- Payments made before T10 are not in the table (no backfill).
-- Index: payments_created_at_id_idx (0105) for the created_at range; subscriptions is one row
-- per subscriber and is counted whole.

create or replace function public.admin_revenue_stats(p_days integer)
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
    select pm.created_at,
           pm.product_id,
           pm.channel,
           case when pm.currency = 'usd'
                then (pm.amount_total - pm.amount_tax - pm.amount_refunded) / 100.0
                else 0 end as amount
      from public.payments pm
     where pm.created_at >= v_start
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

