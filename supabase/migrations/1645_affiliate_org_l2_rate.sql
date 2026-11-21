-- The only commission change for enterprise (ARCHITECTURE §6.5): a customer whose source is org_l2
-- (a level-2 customer of an org, bound by E6) earns the org account its l2_bp; every other customer
-- earns l1_bp exactly as before. Org accounts have no parent, so they never produce a team bonus.
-- Rates come from affiliate_rate_overrides for the org account, else the program defaults.
--
-- A customer who is, at payment time, an active member of the org whose account they are bound
-- to is not the org's customer (a colleague joined later): the level-1 commission is written as
-- void with reason org_member, like affiliate_inactive. The snapshot carries it as 'void'.
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,r.l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
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

-- Same as 1041 except the org_member void reason, kept like affiliate_inactive on every recompute.
create or replace function public._affiliate_write_commission(p_payment public.payments,p_snapshot jsonb,p_level smallint,
  p_open boolean,p_lost boolean,p_release boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_old public.affiliate_commissions; v_id bigint; v_amount bigint; v_status text; v_reason text;
  v_owner uuid; v_rate integer; v_confirm timestamptz; v_flags text[]; v_void text;
begin
  select c.* into v_old from public.affiliate_commissions c where c.payment_id=p_payment.id and c.level=p_level for update;
  if not found then
    v_owner:=(p_snapshot->>case p_level when 1 then 'owner' else 'parent' end)::uuid;
    if v_owner is null then return; end if;
    v_rate:=(p_snapshot->>case p_level when 1 then 'rate' else 'bonus' end)::integer;
    v_confirm:=(p_snapshot->>'confirm_after')::timestamptz;
    v_flags:=case when (p_snapshot->>'same_ip')::boolean then array['same_ip'] else '{}' end;
    if p_level=1 and (p_snapshot->>'inactive')::boolean then v_void:='affiliate_inactive';
    elsif p_level=1 and p_snapshot->>'void'='org_member' then v_void:='org_member'; end if;
  else
    v_owner:=v_old.affiliate_user_id; v_rate:=v_old.rate_bp; v_confirm:=v_old.confirm_after; v_flags:=v_old.flags;
    if v_old.void_reason in ('affiliate_inactive','admin_void','org_member') then v_void:=v_old.void_reason; end if;
  end if;
  v_amount:=public._affiliate_due(p_payment.amount_total,p_payment.amount_tax,p_payment.amount_refunded,v_rate);
  if v_old.payout_retained is not null then
    v_amount:=public._affiliate_retained_cents(v_old.payout_retained,v_amount);
  end if;
  if v_void is not null or p_lost then
    v_void:=coalesce(v_void,'dispute_lost'); v_amount:=0;
  elsif v_amount=0 then
    v_void:=case when p_payment.amount_refunded=p_payment.amount_total then 'refunded' else 'zero' end;
  end if;
  v_status:=case when v_amount=0 then 'void' when p_open or (cardinality(v_flags)>0 and v_old.released_by is null and not p_release)
    then 'on_hold' when now()>=v_confirm then 'confirmed' else 'pending' end;
  if not p_release and v_old.id is not null and (v_amount,v_status,v_void) is not distinct from (v_old.amount,v_old.status,v_old.void_reason) then return; end if;
  v_reason:=case when p_release then 'admin_release' when v_void is not null then v_void
    when p_open then 'dispute_open' when v_status='on_hold' then 'same_ip'
    when v_old.status='on_hold' then 'dispute_won'
    when v_amount<v_old.amount then 'partial_refund' when v_status='confirmed' and v_old.id is not null then 'confirmed'
    else 'payment' end;
  insert into public.affiliate_commissions(payment_id,affiliate_user_id,level,product_id,rate_bp,base_usd,amount,status,
    confirm_after,confirmed_at,void_reason,flags,created_at)
  values(p_payment.id,v_owner,p_level,p_payment.product_id,v_rate,p_payment.amount_total-p_payment.amount_tax,v_amount,v_status,
    v_confirm,case when v_status='confirmed' then now() end,v_void,v_flags,p_payment.created_at)
  on conflict(payment_id,level) do update set amount=excluded.amount,status=excluded.status,
    confirmed_at=case when excluded.status='confirmed' then coalesce(affiliate_commissions.confirmed_at,now()) end,
    void_reason=excluded.void_reason,updated_at=now() returning id into v_id;
  insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
    values(v_id,v_old.amount,v_amount,v_old.status,v_status,v_reason);
end;
$$;
