-- Channel partner promotion credits: the bonus (推广积分奖励) loses its two anti-abuse limits (the
-- Owner 2026-11-22; ARCHITECTURE §6.5 渠道商推广积分). It is now bonus_bp of all counted level-1
-- customer credits: no per-customer cap (was 20% of the month's total) and no minimum number of
-- paying customers (was 3). Base, the 30-day confirmation, what counts (org_l1 personal purchases
-- only), the clawback and the month-end expiry are unchanged.
--
-- Only functions change (create or replace, same signatures, plus one new overload). The sheet's
-- columns stay: a new sheet writes customer_cap = the uncapped total and capped_customers = 0, and
-- its detail records customer_cap_bp 10000 / min_customers 0. A decided sheet is never recomputed;
-- a pending one picks the new rules up on its next run or recompute (its fingerprint changes, so a
-- confirm from a page shown before is refused as stale).
--
-- The clawback re-measures each earlier granted sheet under the rules it was granted with (read
-- from its own detail), so a sheet granted under the old limits still owes exactly what it owed.

-- customer_cap_bp 10000 (one customer may be the whole total) and min_customers 0 mean "no limit";
-- the keys stay so every reader of the rules keeps working.
create or replace function public._partner_promo_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('base', 10000, 'bonus_bp', 1000, 'customer_cap_bp', 10000, 'min_customers', 0);
$$;
revoke all on function public._partner_promo_rules() from public, anon, authenticated, service_role;

-- The bonus for a set of counted orders, [{customer, credits}], under given limits. Credits are
-- summed per customer; each counts for at most p_cap_bp of the uncapped total (10000: no cap); the
-- bonus is bonus_bp of the counted total, and 0 below p_min paying customers (0: no minimum).
create function public._partner_promo_bonus(p_lines jsonb, p_cap_bp integer, p_min integer) returns jsonb
language sql stable set search_path = '' as $$
  with rules as (select public._partner_promo_rules() r),
  per as (
    select x.customer, sum(x.credits)::bigint as raw
      from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as x(customer uuid, credits bigint)
     group by x.customer having sum(x.credits) > 0
  ),
  tot as (
    select coalesce(sum(raw), 0)::bigint as raw, count(*)::integer as n,
           (coalesce(sum(raw), 0) * p_cap_bp::bigint / 10000)::bigint as cap
      from per
  ),
  counted as (
    select per.customer, per.raw, least(per.raw, tot.cap) as counted, per.raw > tot.cap as capped
      from per cross join tot
  )
  select jsonb_build_object(
    'customers', tot.n,
    'raw', tot.raw,
    'cap', tot.cap,
    'counted', coalesce((select sum(c.counted) from counted c), 0)::bigint,
    'capped_customers', (select count(*) from counted c where c.capped)::integer,
    'min_customers', p_min,
    'bonus', case when tot.n >= p_min
                  then (coalesce((select sum(c.counted) from counted c), 0) * (r->>'bonus_bp')::bigint / 10000)::integer
                  else 0 end,
    'per', coalesce((select jsonb_agg(jsonb_build_object('customer', c.customer, 'raw', c.raw, 'counted', c.counted,
                                       'capped', c.capped) order by c.raw desc, c.customer) from counted c), '[]'::jsonb))
  from tot cross join rules;
$$;
revoke all on function public._partner_promo_bonus(jsonb, integer, integer) from public, anon, authenticated, service_role;

-- The bonus under the current rules (no limits). _partner_promo_calc (1841) calls this one.
create or replace function public._partner_promo_bonus(p_lines jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select public._partner_promo_bonus(p_lines, (r->>'customer_cap_bp')::integer, (r->>'min_customers')::integer)
    from (select public._partner_promo_rules() r) x;
$$;
revoke all on function public._partner_promo_bonus(jsonb) from public, anon, authenticated, service_role;

-- What the partner's earlier granted sheets still owe: each one's bonus, minus its bonus measured
-- with the orders as they are today under the limits it was granted with, minus what later sheets
-- already took back. A sheet granted before this migration has 2000 / 3 in its detail (1842 always
-- stored them); the fallback is those old limits too.
create or replace function public._partner_promo_owed(p_org uuid, p_period text)
returns table(grant_id bigint, period text, owed integer)
language sql stable security definer set search_path = '' as $$
  select g.id, g.period,
         greatest(0, g.bonus
           - (public._partner_promo_bonus(coalesce((
               select jsonb_agg(jsonb_build_object('customer', l.customer_user_id,
                                                   'credits', public._partner_promo_payment_credits(p)))
                 from public.partner_promo_grant_lines l join public.payments p on p.id = l.payment_id
                where l.grant_id = g.id), '[]'::jsonb),
               coalesce((g.detail->>'customer_cap_bp')::integer, 2000),
               coalesce((g.detail->>'min_customers')::integer, 3))->>'bonus')::integer
           - coalesce((select sum(c.credits) from public.partner_promo_clawbacks c where c.source_grant_id = g.id), 0)::integer)
    from public.partner_promo_grants g
   where g.org_id = p_org and g.status = 'granted' and g.period < p_period and g.bonus > 0
   order by g.period, g.id;
$$;
revoke all on function public._partner_promo_owed(uuid, text) from public, anon, authenticated, service_role;
