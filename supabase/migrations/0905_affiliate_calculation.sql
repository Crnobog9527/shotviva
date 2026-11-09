-- Snapshot enrollment, eligibility, rates and flags in one statement. Existing commissions
-- always keep their recipient, even after rebind. Backfilled disputes/refunds cannot originate sales.
create function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' as $$
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
    where s.singleton and customer.id=p_payment.user_id;
$$;

create function public._affiliate_due(p_total integer,p_tax integer,p_refunded integer,p_rate integer)
returns bigint language sql immutable strict set search_path='' as $$
  select case when p_total=0 then 0 else
    div((p_total-p_tax)::numeric*(p_total-p_refunded)*p_rate,p_total::numeric*10000)::bigint end;
$$;

-- T71 marks a charge disputed before it necessarily receives the Stripe dispute row.
create function public._affiliate_dispute_state(p_payment public.payments)
returns table(is_open boolean,is_lost boolean) language sql stable security definer set search_path='' as $$
  select coalesce(bool_or(closed_at is null),false) or (count(*)=0 and p_payment.status='disputed'),
         coalesce(bool_or(closed_status not in ('won','warning_closed')),false)
    from public.payment_disputes where payment_id=p_payment.id;
$$;

create function public._affiliate_write_commission(p_payment public.payments,p_snapshot jsonb,p_level smallint,
  p_open boolean,p_lost boolean,p_release boolean default false)
returns void language plpgsql security definer set search_path='' as $$
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
    if p_level=1 and (p_snapshot->>'inactive')::boolean then v_void:='affiliate_inactive'; end if;
  else
    v_owner:=v_old.affiliate_user_id; v_rate:=v_old.rate_bp; v_confirm:=v_old.confirm_after; v_flags:=v_old.flags;
    if v_old.void_reason in ('affiliate_inactive','admin_void') then v_void:=v_old.void_reason; end if;
  end if;
  v_amount:=public._affiliate_due(p_payment.amount_total,p_payment.amount_tax,p_payment.amount_refunded,v_rate);
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

revoke all on function public._affiliate_snapshot(public.payments) from public,anon,authenticated,service_role;

revoke all on function public._affiliate_due(integer,integer,integer,integer) from public,anon,authenticated,service_role;

revoke all on function public._affiliate_write_commission(public.payments,jsonb,smallint,boolean,boolean,boolean) from public,anon,authenticated,service_role;

revoke all on function public._affiliate_dispute_state(public.payments) from public,anon,authenticated,service_role;
