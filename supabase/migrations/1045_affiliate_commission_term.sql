-- The buyer's binding date determines eligibility for both the direct and team commission.
alter table public.affiliate_settings add column commission_months integer check (commission_months > 0);

create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set timezone='UTC' as $$
  select jsonb_build_object('owner',a.user_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',coalesce(o.l1_bp,r.l1_bp),'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',coalesce(customer.signup_ip=referrer.signup_ip,false),
    'confirm_after',p_payment.created_at+make_interval(days=>s.hold_days))
    from public.profiles customer join public.affiliates a on a.user_id=customer.referred_by
    join public.profiles referrer on referrer.id=a.user_id
    cross join public.affiliate_settings s
    join public.affiliate_rates r on r.product_kind=case when starts_with(p_payment.product_id,'pack_') then 'pack'
      when right(p_payment.product_id,8)='_monthly' then 'monthly' when right(p_payment.product_id,7)='_yearly' then 'yearly' end
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

create or replace function public.admin_affiliate_settings(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  update public.affiliate_settings set enabled=coalesce((p_input->>'enabled')::boolean,enabled),
    commission_months=case when p_input ? 'commission_months' then (p_input->>'commission_months')::integer else commission_months end,
    hold_days=coalesce((p_input->>'hold_days')::integer,hold_days),
    payout_min_usd=coalesce((p_input->>'payout_min_usd')::bigint,payout_min_usd),
    settlement_day=coalesce((p_input->>'settlement_day')::integer,settlement_day),
    apply_min_level=coalesce(p_input->>'apply_min_level',apply_min_level),
    terms_version=coalesce(p_input->>'terms_version',terms_version) where singleton;
  insert into public.affiliate_rates(product_kind,l1_bp,l2_bp)
    select r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_input->'rates') r(product_kind text,l1_bp integer,l2_bp integer)
    on conflict(product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
  perform public._affiliate_audit(p_actor,'settings','settings',p_input::text);
end;
$$;
