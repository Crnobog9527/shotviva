-- How a channel partner's monthly promotion grant is computed (ARCHITECTURE §6.5 渠道商推广积分; the
-- Owner 2026-11-22). Read-only functions: 1842 stores what they return as a pending sheet, and
-- the confirm recomputes it to refuse a stale page.

-- The program's numbers in one place (credits and basis points; no prices). base: granted every
-- month. bonus_bp: share of the counted customer credits. customer_cap_bp: the most one customer
-- may contribute, as a share of that month's uncapped total. min_customers: distinct paying
-- customers needed before any bonus is paid (below it only the base is granted).
create function public._partner_promo_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('base', 10000, 'bonus_bp', 1000, 'customer_cap_bp', 2000, 'min_customers', 3);
$$;
revoke all on function public._partner_promo_rules() from public, anon, authenticated, service_role;

-- The credits one personal purchase counts for: the credits it granted, in the share of the order
-- still paid (a partial refund counts pro rata), and nothing while it is disputed or for an order
-- that cost nothing. Measured again every month for the clawback, so it always reads the payment
-- as it is now.
create function public._partner_promo_payment_credits(p_payment public.payments) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when p_payment.status = 'disputed' or p_payment.amount_total <= 0 then 0
    else (public._payment_granted_credits(p_payment)::bigint
          * greatest(p_payment.amount_total - p_payment.amount_refunded, 0) / p_payment.amount_total)::integer
  end;
$$;
revoke all on function public._partner_promo_payment_credits(public.payments) from public, anon, authenticated, service_role;

-- The bonus for a set of counted orders, [{customer, credits}]. Credits are summed per customer;
-- each customer counts for at most customer_cap_bp of the uncapped total (a cap on the raw total,
-- not on the capped one: capped against itself, fewer than five customers would always round the
-- bonus down to nothing, which would make the three-customer minimum meaningless). The bonus is
-- bonus_bp of the capped total, and 0 below min_customers paying customers.
create function public._partner_promo_bonus(p_lines jsonb) returns jsonb
language sql stable set search_path = '' as $$
  with rules as (select public._partner_promo_rules() r),
  per as (
    select x.customer, sum(x.credits)::bigint as raw
      from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as x(customer uuid, credits bigint)
     group by x.customer having sum(x.credits) > 0
  ),
  tot as (
    select coalesce(sum(raw), 0)::bigint as raw, count(*)::integer as n,
           (coalesce(sum(raw), 0) * ((select r from rules)->>'customer_cap_bp')::bigint / 10000)::bigint as cap
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
    'min_customers', (r->>'min_customers')::integer,
    'bonus', case when tot.n >= (r->>'min_customers')::integer
                  then (coalesce((select sum(c.counted) from counted c), 0) * (r->>'bonus_bp')::bigint / 10000)::integer
                  else 0 end,
    'per', coalesce((select jsonb_agg(jsonb_build_object('customer', c.customer, 'raw', c.raw, 'counted', c.counted,
                                       'capped', c.capped) order by c.raw desc, c.customer) from counted c), '[]'::jsonb))
  from tot cross join rules;
$$;
revoke all on function public._partner_promo_bonus(jsonb) from public, anon, authenticated, service_role;

-- What the partner's earlier granted sheets still owe: each one's bonus, minus its bonus measured
-- with the orders as they are today, minus what later sheets already took back. One row per sheet
-- that owes something, oldest first (the order a deduction is booked in).
create function public._partner_promo_owed(p_org uuid, p_period text)
returns table(grant_id bigint, period text, owed integer)
language sql stable security definer set search_path = '' as $$
  select g.id, g.period,
         greatest(0, g.bonus
           - (public._partner_promo_bonus(coalesce((
               select jsonb_agg(jsonb_build_object('customer', l.customer_user_id,
                                                   'credits', public._partner_promo_payment_credits(p)))
                 from public.partner_promo_grant_lines l join public.payments p on p.id = l.payment_id
                where l.grant_id = g.id), '[]'::jsonb))->>'bonus')::integer
           - coalesce((select sum(c.credits) from public.partner_promo_clawbacks c where c.source_grant_id = g.id), 0)::integer)
    from public.partner_promo_grants g
   where g.org_id = p_org and g.status = 'granted' and g.period < p_period and g.bonus > 0
   order by g.period, g.id;
$$;
revoke all on function public._partner_promo_owed(uuid, text) from public, anon, authenticated, service_role;

-- The whole sheet for one partner and grant month, as jsonb, with an md5 `fingerprint` of
-- everything else in it (the stale-form guard: any change to an order, a refund, the owner or a
-- clawback changes it). Counts the org account's level-1 commissions that are confirmed and were
-- confirmed in the month before `p_period` (UTC), of customers bound to the org at level 1
-- (org_l1). Level 2 (org_l2) customers are left out, and so are enterprise packages (offline, no
-- payment row, no commission). An order a granted sheet of another month already counted is never
-- counted again.
create function public._partner_promo_calc(p_org uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date;
  v_start timestamptz;
  v_end timestamptz;
  v_recipient uuid;
  v_account uuid;
  v_rules jsonb := public._partner_promo_rules();
  v_lines jsonb;
  v_bonus jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_owed integer := 0;
  v_gross integer;
  v_left integer;
  v_take integer;
  o record;
  v_result jsonb;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  v_month := (p_period || '-01')::date;
  v_start := (v_month - interval '1 month')::timestamp at time zone 'UTC';
  v_end := v_month::timestamp at time zone 'UTC';
  select owner_user_id into v_recipient from public.orgs where id = p_org;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  select a.user_id into v_account from public.affiliates a where a.org_id = p_org;

  select coalesce(jsonb_agg(jsonb_build_object('payment_id', x.payment_id, 'customer', x.customer, 'credits', x.credits,
                                               'confirmed_at', x.confirmed_at) order by x.payment_id), '[]'::jsonb)
    into v_lines
    from (
      select c.payment_id, p.user_id as customer, public._partner_promo_payment_credits(p) as credits, c.confirmed_at
        from public.affiliate_commissions c
        join public.payments p on p.id = c.payment_id
        join public.profiles cu on cu.id = p.user_id
       where v_account is not null and c.affiliate_user_id = v_account and c.level = 1 and c.status = 'confirmed'
         and c.confirmed_at >= v_start and c.confirmed_at < v_end
         and cu.referred_by = v_account and cu.referred_source = 'org_l1'
         and not exists(select from public.partner_promo_grant_lines l join public.partner_promo_grants g on g.id = l.grant_id
                         where l.payment_id = c.payment_id and g.status = 'granted' and g.period <> p_period)
    ) x
   where x.credits > 0;
  v_bonus := public._partner_promo_bonus(v_lines);

  v_gross := (v_rules->>'base')::integer + (v_bonus->>'bonus')::integer;
  v_left := v_gross;
  for o in select * from public._partner_promo_owed(p_org, p_period) where owed > 0 loop
    v_take := least(o.owed, v_left);
    v_left := v_left - v_take;
    v_owed := v_owed + o.owed;
    v_sources := v_sources || jsonb_build_array(jsonb_build_object('grant_id', o.grant_id, 'period', o.period,
                                                                   'owed', o.owed, 'applied', v_take));
  end loop;

  v_result := jsonb_build_object(
    'org_id', p_org, 'period', p_period, 'recipient', v_recipient,
    'window_start', v_start, 'window_end', v_end,
    'expires_at', (v_month + interval '1 month')::timestamp at time zone 'UTC',
    'base', (v_rules->>'base')::integer, 'bonus_bp', (v_rules->>'bonus_bp')::integer,
    'customer_cap_bp', (v_rules->>'customer_cap_bp')::integer,
    'bonus', (v_bonus->>'bonus')::integer, 'raw', (v_bonus->>'raw')::bigint, 'counted', (v_bonus->>'counted')::bigint,
    'cap', (v_bonus->>'cap')::bigint, 'customers', (v_bonus->>'customers')::integer,
    'capped_customers', (v_bonus->>'capped_customers')::integer, 'min_customers', (v_bonus->>'min_customers')::integer,
    'per', v_bonus->'per', 'lines', v_lines, 'sources', v_sources,
    'clawback_owed', v_owed, 'clawback_applied', v_gross - v_left, 'total', v_left);
  return v_result || jsonb_build_object('fingerprint', md5(v_result::text));
end;
$$;
revoke all on function public._partner_promo_calc(uuid, text) from public, anon, authenticated, service_role;
