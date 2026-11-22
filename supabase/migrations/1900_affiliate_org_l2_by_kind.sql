-- The enterprise (org) level-2 default rate per product kind (ARCHITECTURE §6.5; Owner 2026-11-22):
-- monthly 5%, pack 5%, yearly 3%. Level 1 is unchanged.
--
-- 1681 kept one org level-2 default for every kind in affiliate_settings.org_l2_bp. It moves to
-- affiliate_rates.org_l2_bp, next to the level-1 rate and the personal team bonus of each kind. The
-- new column starts at the live single value (so monthly and pack keep it), then yearly is set to
-- 3%. An org_l2 customer now earns coalesce(override.l2_bp, affiliate_rates.org_l2_bp): the
-- admin's per-org value when set, else the default of the payment's kind.
--
-- Only payments snapshotted after this migration use it: commissions already written keep their
-- rate until something recomputes that payment (refund, dispute, admin recompute), exactly like any
-- other rate change.
--
-- Expand-only. affiliate_settings.org_l2_bp stays (the admin pages deployed before this read it;
-- nothing reads it once the new code is live). The settings RPC deployed before this sends rates
-- without org_l2_bp, and the new one leaves org_l2_bp untouched then.

alter table public.affiliate_rates
  add column org_l2_bp integer not null default 500 check (org_l2_bp between 0 and 10000);

-- The break-even fee (admin.catalog_fee_components, used by catalogue price checks and the template
-- credit floor) must cover the highest commission any payment of a kind can pay. Before 1900 it
-- counted the policy, the program l1+l2 and each active account's own l1 plus its parent's team
-- bonus, but no enterprise level 2. An org_l2 payment pays the org account its level-2 rate alone
-- (no level-1 row, an org account has no parent), so the new candidates are the kind's org default
-- and, per active org account, coalesce(override.l2_bp, org default). Same as 1127 otherwise.
-- Created before the rate updates below so their floor-budget refresh already uses it.
create or replace function admin.catalog_fee_components(p_kind text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('payment_bp',(policy->>'payment_bp')::int,'refund_bp',(policy->>'refund_bp')::int,
    'commission_bp',greatest((policy->>case when p_kind='yearly' then 'yearly_commission_bp' else 'other_commission_bp' end)::int,
      (select greatest(r.l1_bp+r.l2_bp,r.org_l2_bp) from public.affiliate_rates r where product_kind=p_kind),
      (select max(greatest(coalesce(o.l1_bp,r.l1_bp) +
          case when parent.status='active' and parent.team_enabled then coalesce(po.l2_bp,r.l2_bp) else 0 end,
          case when a.org_id is not null then coalesce(o.l2_bp,r.org_l2_bp) else 0 end))
        from public.affiliates a join public.affiliate_rates r on r.product_kind=p_kind
        left join public.affiliate_rate_overrides o on (o.user_id,o.product_kind)=(a.user_id,p_kind)
        left join public.affiliates parent on parent.user_id=a.parent_user_id
        left join public.affiliate_rate_overrides po on (po.user_id,po.product_kind)=(parent.user_id,p_kind)
        where a.status='active'))) from (select admin.catalog_policy() policy) x where policy is not null
$$;

-- Backfill from the live single setting (the singleton row exists once 0901 has run).
update public.affiliate_rates r set org_l2_bp = s.org_l2_bp from public.affiliate_settings s where s.singleton;

-- Owner 2026-11-22: yearly plans 3%.
update public.affiliate_rates set org_l2_bp = 300 where product_kind = 'yearly';

-- Same as 1844 except the org_l2 fallback (r.org_l2_bp instead of s.org_l2_bp).
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,r.org_l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
    'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',coalesce(customer.referred_source not in ('org_l1','org_l2'),true) and coalesce(customer.signup_ip=referrer.signup_ip,false),
    'confirm_after',p_payment.created_at+make_interval(days=>s.hold_days),
    'void',case when a.org_id is not null and exists(select from public.org_members m
      where m.org_id=a.org_id and m.user_id=customer.id and m.status='active') then 'org_member' end)
    from public.profiles customer join public.affiliates a on a.user_id=customer.referred_by
    join public.profiles referrer on referrer.id=a.user_id
    cross join public.affiliate_settings s
    join admin.catalog_products sku on sku.product_id=p_payment.product_id
    join public.affiliate_rates r on r.product_kind=sku.kind
    left join public.affiliates parent on parent.user_id=a.parent_user_id
    left join public.affiliate_rate_overrides o on (o.user_id,o.product_kind)=(a.user_id,r.product_kind)
    left join public.affiliate_rate_overrides po on (po.user_id,po.product_kind)=(parent.user_id,r.product_kind)
    where s.singleton and customer.id=p_payment.user_id
      and (s.commission_months is null or case
        -- A term extending beyond the payment year always covers this sale. Avoid overflowing
        -- timestamp arithmetic for long terms accepted by the integer setting.
        when s.commission_months > 12 * (1 + extract(year from p_payment.created_at) - extract(year from customer.referred_at)) then true
        else p_payment.created_at <= customer.referred_at + make_interval(months => s.commission_months)
      end);
$$;

-- Same as 1880 except the rates: a rate may also carry org_l2_bp, which is set only when given.
-- The form deployed before this migration sends rates without it, so the org defaults stay as they
-- are. The audit row is as 1880 (the whole input, org_l2_bp included).
create or replace function public.admin_affiliate_settings(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  update public.affiliate_settings set enabled=coalesce((p_input->>'enabled')::boolean,enabled),
    commission_months=case when p_input ? 'commission_months' then (p_input->>'commission_months')::integer else commission_months end,
    hold_days=coalesce((p_input->>'hold_days')::integer,hold_days),
    payout_min_usd=coalesce((p_input->>'payout_min_usd')::bigint,payout_min_usd),
    org_payout_min_usd=coalesce((p_input->>'org_payout_min_usd')::bigint,org_payout_min_usd),
    settlement_day=coalesce((p_input->>'settlement_day')::integer,settlement_day),
    apply_min_level=coalesce(p_input->>'apply_min_level',apply_min_level) where singleton;
  insert into public.affiliate_rates(product_kind,l1_bp,l2_bp)
    select r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_input->'rates') r(product_kind text,l1_bp integer,l2_bp integer)
    on conflict(product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
  update public.affiliate_rates t set org_l2_bp=r.org_l2_bp
    from jsonb_to_recordset(p_input->'rates') r(product_kind text,org_l2_bp integer)
    where t.product_kind=r.product_kind and r.org_l2_bp is not null;
  perform public._affiliate_audit(p_actor,'settings','settings',(p_input - 'terms_version')::text);
end;
$$;
