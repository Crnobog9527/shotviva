-- Enterprise customers who came through the org account's own partner link (?ref=) are exempt
-- from the same_ip commission flag too (ARCHITECTURE §6.5; found validating #958 on the test site).
--
-- 1844 dropped the same_ip flag for enterprise customers, keyed on how the customer was bound:
-- referred_source org_l1 / org_l2 (a staff invite code). Since 2010 the org account's own ?ref link
-- is an enterprise path as well (it pays the org signup bonus), but affiliate_bind records it as
-- 'signup' (or 'first_checkout' at a first purchase), so those customers' commissions are still
-- flagged when the payer shares the owner's office network, and stay on_hold.
--
-- The exemption now also covers a 'signup' / 'first_checkout' customer bound to an org account
-- (affiliates.org_id is set) after that row became an org account. 1844 kept the flag for
-- customers bound in the personal era of a row that 1643 later converted, and that stays: the
-- conversion time is affiliates.approved_at. 1643 sets it to now() both when it creates an org's
-- account and when it converts a personal row in place; nothing writes it afterwards for an org row
-- (admin_affiliate_decide and the invite acceptance only touch pending rows, a suspension or
-- reactivation leaves it, and an owner transfer, 1930, copies the row with it). A personal-era
-- customer's referred_at is before it. A null approved_at or referred_at keeps the flag.
--
-- Unchanged: personal affiliates, org_l1 / org_l2, level 2 (the key is per payment, from the
-- level-1 referrer, as in 1844), the signup rate limit and signup-gift same-IP rules. Rows already
-- written keep their stored flags (recompute reads v_old.flags): an on_hold same_ip commission of
-- such a customer is released by an admin as before. Expand-only: create or replace of one
-- function with the same signature; the code before this deploy keeps working.

-- Same as 1930 except the same_ip line.
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'org',a.org_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,r.org_l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
    'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',not coalesce(customer.referred_source in ('org_l1','org_l2')
        or (a.org_id is not null and customer.referred_source in ('signup','first_checkout')
          and customer.referred_at>=a.approved_at),false)
      and coalesce(customer.signup_ip=referrer.signup_ip,false),
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
