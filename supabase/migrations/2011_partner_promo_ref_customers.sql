-- Channel partner promotion grants also count customers who came through the org account's own
-- partner link (?ref=), the Owner 2026-11-27 (ARCHITECTURE §6.5 渠道商推广积分). Every user an
-- enterprise referral link brings is a level-1 customer: a staff member's invite code binds
-- referred_source 'org_l1', the org account's ?ref= link binds 'signup' (at signup) or
-- 'first_checkout' (at a first purchase) through affiliate_bind. Commission already pays the org
-- account its level-1 rate on all three; 1841 counted only org_l1 for the promotion bonus.
--
-- Same function as 1841 (create or replace, same signature) except that one condition. 'admin' (a
-- binding an admin set by hand) is not a link and stays out; 'org_l2' stays out.
--
-- Nothing else moves: one sheet per org and month, an order a granted sheet of another month
-- counted is never counted again, the clawback re-measures each granted sheet from its own lines.
-- A decided sheet is never recomputed; a pending one picks this up on its next run or recompute
-- (its fingerprint changes, so a confirm from a page shown before is refused as stale). No
-- back-fill: on 2026-11-27 production had no paying customer bound through an org's ?ref= link,
-- so no granted sheet missed anything.

-- The whole sheet for one partner and grant month, as jsonb, with an md5 `fingerprint` of
-- everything else in it (the stale-form guard: any change to an order, a refund, the owner or a
-- clawback changes it). Counts the org account's level-1 commissions that are confirmed and were
-- confirmed in the month before `p_period` (UTC), of customers bound to the org at level 1: through
-- a staff invite (org_l1) or through the org account's own partner link (signup, first_checkout;
-- 2011). Level 2 (org_l2) customers are left out, and so are enterprise packages (offline, no
-- payment row, no commission). An order a granted sheet of another month already counted is never
-- counted again.
create or replace function public._partner_promo_calc(p_org uuid, p_period text) returns jsonb
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
         and cu.referred_by = v_account and cu.referred_source in ('org_l1', 'signup', 'first_checkout')
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
