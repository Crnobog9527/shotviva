-- The org level-2 default rate (ARCHITECTURE §6.5, card E6): every product kind, 5%, kept in one
-- setting, affiliate_settings.org_l2_bp.
--
-- 1645 paid an org_l2 customer coalesce(override.l2_bp, affiliate_rates.l2_bp). The program default
-- l2_bp is the personal team bonus (lower for yearly), so an org account without its own level-2
-- override would earn less than the plan's single level-2 rate on yearly plans. Now an org_l2
-- customer earns coalesce(override.l2_bp, affiliate_settings.org_l2_bp): the admin's per-org value
-- when set, else the org default. Leaving the field blank in /admin/affiliates therefore means the
-- org default again. Every other source, and the team bonus of personal affiliates (still
-- coalesce(parent override, affiliate_rates.l2_bp)), is unchanged.
--
-- The template floor is unaffected: catalog_fee_components counts an account's own l1 and its
-- parent's team bonus, and an org account is never a parent.

alter table public.affiliate_settings
  add column org_l2_bp integer not null default 500 check (org_l2_bp between 0 and 10000);

-- Same as 1645 except the org_l2 fallback.
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,s.org_l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
    'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',coalesce(customer.signup_ip=referrer.signup_ip,false),
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
