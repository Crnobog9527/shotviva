-- Enterprise affiliates are exempt from the same_ip commission flag.
--
-- _affiliate_snapshot flags a payment 'same_ip' when the payer's signup_ip equals the referring
-- affiliate account's own signup_ip, and _affiliate_write_commission then holds the commission
-- (status on_hold, flags {same_ip}) until an admin releases it. For a personal affiliate that is a
-- self-referral / duplicate-account signal. For an enterprise (org) affiliate it is the normal case:
-- the owner and the staff register from one office network, so every employee payment would freeze.
-- The owner decided (2026-11-22) to drop the flag for them. The exemption keys on how the customer
-- was bound (referred_source org_l1 / org_l2), not on the affiliate row: an owner's old personal
-- affiliate row can later become an org account (1643 trigger), and customers bound in the personal
-- era keep their same_ip holding. Personal-source customers keep today's behaviour.
--
-- Level 2: the snapshot is computed once per payment from the level-1 referrer, and both commission
-- rows of that payment read the same 'same_ip' key. So an org level-1 payment gets no flag on either
-- row (an org account is never a parent, and a personal parent's team bonus on an org referral is
-- not a self-referral signal either). A personal level-1 payment is flagged on both rows as before.
--
-- Only the flag changes: signup rate limit and signup-gift same-IP rules are untouched. Rows already
-- written keep the flags stored on them (_affiliate_write_commission reads v_old.flags on recompute),
-- so no backfill and no change to refund / dispute / recompute paths. Expand-only: create or replace
-- of one function with the same signature; the code before this deploy keeps working.

-- Same as 1681 except the same_ip line.
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,s.org_l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
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
