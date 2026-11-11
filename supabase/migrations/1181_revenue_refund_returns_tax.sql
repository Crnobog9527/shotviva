-- Net revenue that returns tax with a refund (ARCHITECTURE §16.2b, control review of #482).
-- 0168 counted net as amount_total − amount_tax − amount_refunded. A refund gives the buyer back
-- the tax too, so a fully refunded taxed order came out at −tax. Net is now the pre-tax share of
-- what was kept: (amount_total − amount_refunded) × (amount_total − amount_tax) ÷ amount_total,
-- rounded to the cent per order. A full refund nets 0, a partial refund keeps its share, an order
-- without tax is unchanged. Same signature and jsonb shape as 0168; create or replace only.
-- admin_growth_stats (1180) uses the same formula, so the overview, the orders page and
-- 流量与转化 agree on money (the overview and orders page still include admin accounts).

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
           case when pm.currency = 'usd' and pm.amount_total > 0
                then round((pm.amount_total - pm.amount_refunded)::numeric * (pm.amount_total - pm.amount_tax) / pm.amount_total) / 100.0
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

revoke execute on function public.admin_revenue_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_revenue_stats(integer) to service_role;
