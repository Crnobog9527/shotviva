-- Admin 「流量与转化」 redesign: the database half of the page (ARCHITECTURE §16.2b). One call
-- returns, for the current and the previous period, what really happened on this site: sign-ups,
-- whether new users got a first image and paid, returning users who came back, and the money
-- (orders split first / repeat / renewal, plan / pack, Stripe / Waffo, refunds and disputes).
-- Refunds are counted on the period's orders (refunded later or not), like net revenue: a Stripe
-- refund only updates payments.amount_refunded and records no refund date (payment_refunds is
-- written for Waffo only). Disputes carry their own date and are counted when they were opened.
-- Admin accounts are left out everywhere; their ids are returned so the PostHog half of the page
-- can leave their visits out too. The test site has its own database, so nothing here can come
-- from it. Periods are passed in (Beijing days, worked out by the app) so both halves of the page
-- describe the same stretch of time.
--
-- Money: net is the pre-tax share of what was kept, (amount_total − amount_refunded) ×
-- (amount_total − amount_tax) ÷ amount_total, rounded to the cent per order, so a refund returns
-- its share of the tax and a full refund nets 0 (admin_revenue_stats moves to the same formula in
-- 1181). tax_usd is the tax kept, refunded_usd the pre-tax share refunded, so
-- net = (total − tax) − refunded. USD rows only (a non-USD row is counted as an order and
-- reported, never summed). Lost disputes are not deducted.
-- Renewal: a Stripe payment with no Checkout Session (apply_subscription_renewal writes only the
-- invoice), or a Waffo payment whose order already has an earlier payment (settle_waffo_order_v2
-- reuses the subscription's order id). First: the user's first payment of any kind. Repeat: the rest.
--
-- Security definer because payment_disputes is closed to service_role;
-- execute is granted to service_role only, and the result never leaves the server.
-- Indexes: profiles_created_at_idx (cohort), generation_jobs_user_id_created_at_idx and
-- payments_user_id_created_at_idx (per-user exists), payments_created_at_id_idx (period orders),
-- payments_waffo_order_id_idx (renewal), generation_jobs_created_at_id_idx (returning users),
-- payment_disputes_created_at_idx. No new index.

create function public.admin_growth_stats(
  p_start timestamptz,
  p_end timestamptz,
  p_prev_start timestamptz,
  p_prev_end timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_prev_start is null or p_prev_end is null
     or p_start >= p_end or p_prev_start >= p_prev_end or p_prev_end > p_start
     or p_end - p_start > interval '31 days' or p_prev_end - p_prev_start > interval '31 days'
     or p_end > now() + interval '5 minutes' then
    raise exception 'INVALID_INPUT' using detail = 'two ordered periods of at most 31 days, not in the future';
  end if;

  return (
    with periods(key, since, until) as (
      values ('current', p_start, p_end), ('previous', p_prev_start, p_prev_end)
    ),
    people as (
      select pr.id, pr.created_at, pr.referred_by is not null as referred
        from public.profiles pr
       where pr.role <> 'admin'
    ),
    pays as (
      select pm.user_id, pm.created_at, pm.channel, pm.product_id like 'pack\_%' as is_pack,
             pe.created_at as signed_at, pe.referred, pm.currency = 'usd' as usd,
             -- Kept, pre-tax: a refund returns its share of the tax (1181 uses the same formula).
             case when pm.currency = 'usd' and pm.amount_total > 0
                  then round((pm.amount_total - pm.amount_refunded)::numeric * (pm.amount_total - pm.amount_tax) / pm.amount_total)
                  else 0 end as net_cents,
             case when pm.currency = 'usd' and pm.amount_total > 0
                  then round((pm.amount_total - pm.amount_refunded)::numeric * pm.amount_tax / pm.amount_total)
                  else 0 end as tax_cents,
             case when pm.currency = 'usd' and pm.amount_total > 0
                  then round(pm.amount_refunded::numeric * (pm.amount_total - pm.amount_tax) / pm.amount_total)
                  else 0 end as refunded_cents,
             pm.amount_refunded > 0 as refunded_any,
             case
               when (pm.channel = 'stripe' and pm.stripe_session_id is null)
                 or (pm.channel = 'waffo' and exists (
                       select from public.payments e
                        where e.waffo_order_id = pm.waffo_order_id and (e.created_at, e.id) < (pm.created_at, pm.id)))
                 then 'renewal'
               when exists (
                       select from public.payments e
                        where e.user_id = pm.user_id and (e.created_at, e.id) < (pm.created_at, pm.id))
                 then 'repeat'
               else 'first'
             end as kind
        from public.payments pm
        join people pe on pe.id = pm.user_id
       where pm.created_at >= p_prev_start and pm.created_at < p_end
    )
    select jsonb_build_object(
             'timezone', 'Asia/Shanghai',
             'admin_ids', coalesce((select jsonb_agg(pr.id order by pr.id) from public.profiles pr where pr.role = 'admin'), '[]'::jsonb),
             'periods', jsonb_object_agg(p.key, s.stats)
           )
      from periods p
     cross join lateral (
       with cohort as (
         select pe.id, pe.referred,
                exists (select from public.generation_jobs g
                         where g.user_id = pe.id and g.status = 'succeeded'
                           and g.created_at >= pe.created_at and g.created_at < p.until) as imaged,
                exists (select from public.payments pm
                         where pm.user_id = pe.id and pm.created_at >= pe.created_at and pm.created_at < p.until) as paid
           from people pe
          where pe.created_at >= p.since and pe.created_at < p.until
       ),
       orders as (
         select x.* from pays x where x.created_at >= p.since and x.created_at < p.until
       ),
       buyers as (
         select o.user_id, sum(o.net_cents) as net_cents, count(*) as orders,
                bool_or(o.referred) as referred, min(o.signed_at) as signed_at
           from orders o
          group by o.user_id
       )
       select jsonb_build_object(
         'since', p.since,
         'until', p.until,
         'signups', (select count(*) from cohort),
         'new_users', (select jsonb_build_object('first_image', count(*) filter (where c.imaged),
                                                 'paid', count(*) filter (where c.paid)) from cohort c),
         'returning', jsonb_build_object(
           'active', (select count(distinct g.user_id)
                        from public.generation_jobs g
                        join people pe on pe.id = g.user_id
                       where g.created_at >= p.since and g.created_at < p.until
                         and g.status = 'succeeded' and pe.created_at < p.since),
           'paid', (select count(*) from buyers b where b.signed_at < p.since)),
         'payers', (select count(*) from buyers),
         'orders', (select jsonb_build_object(
                      'total', count(*),
                      'first', count(*) filter (where o.kind = 'first'),
                      'repeat', count(*) filter (where o.kind = 'repeat'),
                      'renewal', count(*) filter (where o.kind = 'renewal'),
                      'non_usd', count(*) filter (where not o.usd)) from orders o),
         'money', (select jsonb_build_object(
                     'net_usd', coalesce(sum(o.net_cents), 0) / 100.0,
                     'tax_usd', coalesce(sum(o.tax_cents), 0) / 100.0,
                     'refunded_usd', coalesce(sum(o.refunded_cents), 0) / 100.0) from orders o),
         'by_kind', (select jsonb_build_object(
                       'first', coalesce(sum(o.net_cents) filter (where o.kind = 'first'), 0) / 100.0,
                       'repeat', coalesce(sum(o.net_cents) filter (where o.kind = 'repeat'), 0) / 100.0,
                       'renewal', coalesce(sum(o.net_cents) filter (where o.kind = 'renewal'), 0) / 100.0) from orders o),
         'by_type', (select jsonb_build_object(
                       'plan', jsonb_build_object('orders', count(*) filter (where not o.is_pack),
                                                  'net_usd', coalesce(sum(o.net_cents) filter (where not o.is_pack), 0) / 100.0),
                       'pack', jsonb_build_object('orders', count(*) filter (where o.is_pack),
                                                  'net_usd', coalesce(sum(o.net_cents) filter (where o.is_pack), 0) / 100.0)) from orders o),
         'by_channel', (select jsonb_build_object(
                          'stripe', jsonb_build_object('orders', count(*) filter (where o.channel = 'stripe'),
                                                       'net_usd', coalesce(sum(o.net_cents) filter (where o.channel = 'stripe'), 0) / 100.0),
                          'waffo', jsonb_build_object('orders', count(*) filter (where o.channel = 'waffo'),
                                                      'net_usd', coalesce(sum(o.net_cents) filter (where o.channel = 'waffo'), 0) / 100.0)) from orders o),
         'refunds', (select jsonb_build_object('count', count(*) filter (where o.refunded_any),
                                               'usd', coalesce(sum(o.refunded_cents), 0) / 100.0) from orders o),
         'disputes', (select jsonb_build_object('count', count(*),
                                                'usd', coalesce(sum(d.amount) filter (where d.currency = 'usd'), 0) / 100.0)
                        from public.payment_disputes d
                       where d.created_at >= p.since and d.created_at < p.until
                         and (d.user_id is null or exists (select from people pe where pe.id = d.user_id))),
         'affiliate', jsonb_build_object(
           'signups', (select count(*) from cohort c where c.referred),
           'payers', (select count(*) from buyers b where b.referred),
           'net_usd', (select coalesce(sum(b.net_cents), 0) / 100.0 from buyers b where b.referred)),
         'cohort', (select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) from cohort c),
         'buyers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', b.user_id, 'net_usd', b.net_cents / 100.0,
                                                                 'orders', b.orders) order by b.user_id), '[]'::jsonb)
                      from buyers b)
       ) as stats
     ) s
  );
end;
$$;

revoke execute on function public.admin_growth_stats(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_growth_stats(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
