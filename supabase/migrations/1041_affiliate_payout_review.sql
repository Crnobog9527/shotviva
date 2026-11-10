-- A payout owns the increase in confirmed cents above any previously accounted-for
-- portion of each commission. A partial payment freezes the covered portion at decision
-- time: if a dispute is later won the recovered cents can enter a subsequent payout.
create table public.affiliate_payout_items (
  payout_id bigint not null references public.affiliate_payouts(id) on delete cascade,
  commission_id bigint not null references public.affiliate_commissions(id) on delete cascade,
  prior_amount bigint not null,
  issue_amount bigint not null check (issue_amount > prior_amount and prior_amount >= 0),
  settled_amount bigint check (settled_amount between prior_amount and issue_amount),
  primary key (payout_id,commission_id,prior_amount)
);
create index affiliate_payout_items_commission_idx on public.affiliate_payout_items(commission_id);
alter table public.affiliate_payout_items enable row level security;
revoke all on public.affiliate_payout_items from public,anon,authenticated,service_role;
grant select on public.affiliate_payout_items to service_role;

alter table public.affiliate_payouts add column legacy_review_required boolean not null default false;

-- When a commission spans orders, forfeiting its unpaid remainder leaves
-- already-paid slices exposed to later refunds and disputes on the same sale.
alter table public.affiliate_commissions add column payout_retained int8multirange;

create function public._affiliate_retained_cents(p_ranges int8multirange,p_amount bigint)
returns bigint language sql immutable strict set search_path='' as $$
  select coalesce(sum(upper(s)-lower(s)),0)::bigint
    from unnest(p_ranges * int8multirange(int8range(0,p_amount))) s;
$$;
revoke all on function public._affiliate_retained_cents(int8multirange,bigint) from public,anon,authenticated,service_role;

-- Each cent of a commission can back one outstanding/paid slice. A returned
-- lower slice can become free while a later slice of the same commission is held.
create function public._affiliate_allocate_payout(p_owner uuid,p_face bigint,p_at timestamptz default null)
returns table(commission_id bigint,prior_amount bigint,issue_amount bigint)
language sql stable set search_path='' as $$
  with confirmed as (
    select c.id,c.amount from public.affiliate_commissions c
      where p_at is null and c.affiliate_user_id=p_owner and c.status='confirmed' and c.payout_retained is null
    union all
    select c.id,h.new_amount from public.affiliate_commissions c
      cross join lateral (select new_amount,new_status from public.affiliate_commission_changes
        where commission_id=c.id and at<=p_at order by at desc,id desc limit 1) h
      where p_at is not null and c.affiliate_user_id=p_owner and h.new_status='confirmed'
  ), free as (
    select c.id,lower(span) lo,upper(span) hi from confirmed c
    cross join lateral (select range_agg(int8range(i.prior_amount,coalesce(i.settled_amount,i.issue_amount))) used
      from public.affiliate_payout_items i join public.affiliate_payouts p on p.id=i.payout_id
      where i.commission_id=c.id and p.status<>'void') existing
    cross join lateral unnest(int8multirange(int8range(0,c.amount))-coalesce(existing.used,'{}'::int8multirange)) span
  ), ordered as (
    select *,sum(hi-lo) over(order by id,lo rows unbounded preceding)-(hi-lo) consumed from free
  )
  select id,lo,least(hi,lo+p_face-consumed)::bigint from ordered where consumed<p_face;
$$;
revoke all on function public._affiliate_allocate_payout(uuid,bigint,timestamptz) from public,anon,authenticated,service_role;

-- Open legacy payouts must be reviewable immediately after upgrading. Replay the
-- commission ledger as of each original issue (including earlier paid/held coverage).
do $$
declare v public.affiliate_payouts; v_supported numeric;
begin
  for v in select * from public.affiliate_payouts order by created_at,id loop
    -- Before T100 a held payout could be issued again. If the ledger cannot
    -- back all older reservations, no open legacy payout in this account may
    -- silently spend the same cents or forfeit a previously paid commission.
    select coalesce(sum(h.new_amount) filter(where h.new_status='confirmed'),0)
      + (select coalesce(sum(j.amount),0) from public.affiliate_adjustments j
          where j.affiliate_user_id=v.affiliate_user_id and j.created_at<=v.created_at)
      - (select coalesce(sum(earlier.amount),0) from public.affiliate_payouts earlier
          where earlier.affiliate_user_id=v.affiliate_user_id and (earlier.created_at,earlier.id)<(v.created_at,v.id))
      into v_supported from public.affiliate_commissions c
      cross join lateral (select new_status,new_amount from public.affiliate_commission_changes
        where commission_id=c.id and at<=v.created_at order by at desc,id desc limit 1) h
      where c.affiliate_user_id=v.affiliate_user_id;
    if v.amount>v_supported then
      update public.affiliate_payouts set legacy_review_required=true
        where affiliate_user_id=v.affiliate_user_id and status in ('due','held');
    end if;
  end loop;
  -- Once ambiguous open orders are released, already paid commissions must
  -- remain covered by the paid order, even when the earlier held order was first.
  for v in select * from public.affiliate_payouts where not legacy_review_required order by created_at,id loop
    insert into public.affiliate_payout_items(payout_id,commission_id,prior_amount,issue_amount)
    select v.id,a.* from public._affiliate_allocate_payout(v.affiliate_user_id,v.amount,v.created_at) a;
  end loop;
end $$;

-- Net this order's original cents against the loss on its own slices.
create function public._affiliate_linked_payable(p public.affiliate_payouts)
returns bigint language sql stable set search_path='' as $$
  select greatest(0,p.amount-coalesce(sum(i.issue_amount-greatest(i.prior_amount,
    least(i.issue_amount,case when c.status='confirmed' and c.payout_retained is null then c.amount else 0 end))),0))::bigint
    from public.affiliate_payout_items i join public.affiliate_commissions c on c.id=i.commission_id
    where i.payout_id=p.id;
$$;
revoke all on function public._affiliate_linked_payable(public.affiliate_payouts) from public,anon,authenticated,service_role;

-- Reserve other open orders at their linked amounts (unreviewable legacy orders
-- at face value). Subtracting their face values would charge their refunds twice.
create function public.affiliate_payout_payable(p public.affiliate_payouts)
returns bigint language sql stable security definer set search_path='' as $$
  select case when p.status in ('due','held') and not p.legacy_review_required then
    least(public._affiliate_linked_payable(p),greatest(0,b.confirmed-b.paid
      + (select coalesce(sum(j.amount),0) from public.affiliate_adjustments j where j.affiliate_user_id=p.affiliate_user_id)
      - (select coalesce(sum(case when o.legacy_review_required then o.amount else public._affiliate_linked_payable(o) end),0)
         from public.affiliate_payouts o where o.affiliate_user_id=p.affiliate_user_id and o.id<>p.id and o.status in ('due','held'))))::bigint
    end from public.affiliate_balances b where b.affiliate_user_id=p.affiliate_user_id;
$$;
revoke all on function public.affiliate_payout_payable(public.affiliate_payouts) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_payout_payable(public.affiliate_payouts) to service_role;

create or replace function public._affiliate_write_commission(p_payment public.payments,p_snapshot jsonb,p_level smallint,
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

-- Forfeiture only touches linked commissions. Preserve any slice that was already
-- accounted for by an older payout; unrelated earnings and adjustments remain intact.
create function public._affiliate_payout_forfeit(p public.affiliate_payouts,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare r record; v_paid int8multirange; v_keep bigint; v_status text;
begin
  for r in select c.* from public.affiliate_commissions c where exists
    (select from public.affiliate_payout_items i where i.payout_id=p.id and i.commission_id=c.id)
    and c.void_reason is distinct from 'admin_void' and c.payout_retained is null order by c.id loop
    select range_agg(int8range(i.prior_amount,coalesce(i.settled_amount,i.issue_amount))) into v_paid
      from public.affiliate_payout_items i join public.affiliate_payouts o on o.id=i.payout_id
      where i.commission_id=r.id and o.status='paid' and coalesce(i.settled_amount,i.issue_amount)>i.prior_amount;
    v_keep:=coalesce(public._affiliate_retained_cents(v_paid,r.amount),0);
    v_status:=case when v_keep=0 then 'void' else r.status end;
    update public.affiliate_commissions set amount=v_keep,status=v_status,payout_retained=v_paid,
      void_reason=case when v_paid is null then 'admin_void' when v_keep=0 then coalesce(r.void_reason,'zero') end,
      updated_at=now() where id=r.id;
    insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
      values(r.id,r.amount,v_keep,r.status,v_status,'payout '||p.id||': '||p_note);
  end loop;
end;
$$;
revoke all on function public._affiliate_payout_forfeit(public.affiliate_payouts,text) from public,anon,authenticated,service_role;

create or replace function public.admin_affiliate_payout_decide(p_actor uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v public.affiliate_payouts; v_status text:=p_input->>'status'; v_note text:=nullif(trim(p_input->>'note'),'');
  v_mode text:=p_input->>'void_mode'; v_method text:=nullif(trim(p_input->>'method'),'');
  v_ref text:=nullif(trim(p_input->>'paid_reference'),''); v_time timestamptz:=(p_input->>'paid_at')::timestamptz;
  v_expected bigint:=(p_input->>'expected_amount')::bigint; v_actual bigint;
begin
  perform public._affiliate_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('affiliate_settlement',0));
  select * into strict v from public.affiliate_payouts where id=(p_input->>'payout_id')::bigint for update;
  if (v.status,v_status) not in (('due','held'),('due','paid'),('held','due'),('held','void'))
    or v_status is null then raise exception 'AFFILIATE_INVALID_PAYOUT_TRANSITION'; end if;
  if (v_status in ('held','void') and v_note is null) or (v_status='void' and (v_mode is null or v_mode not in ('return','forfeit')))
    or (v_status='paid' and (v_method is null or v_time is null or coalesce(v_ref,v_note) is null)) then raise exception 'INVALID_INPUT'; end if;
  if v_status='paid' or (v_status='void' and v_mode='forfeit') then
    if v.legacy_review_required then raise exception 'AFFILIATE_PAYOUT_LEGACY_REVIEW'; end if;
    -- Refunds/retries lock payment then commission. The quote now depends on
    -- the entire account, even if the order itself is backed by adjustments.
    perform pay.id from public.payments pay join public.affiliate_commissions c on c.payment_id=pay.id
      where c.affiliate_user_id=v.affiliate_user_id order by pay.id for update of pay;
    -- An adjustment insert takes a foreign-key key-share lock on this owner.
    perform a.user_id from public.affiliates a where a.user_id=v.affiliate_user_id for update;
    perform c.id from public.affiliate_commissions c where c.affiliate_user_id=v.affiliate_user_id
      order by c.payment_id,c.level for update;
    if exists(select from public.affiliate_commissions c join public.affiliate_recompute_errors e
      on e.payment_id=c.payment_id and e.resolved_at is null where c.affiliate_user_id=v.affiliate_user_id)
      then raise exception 'AFFILIATE_PAYOUT_RECOMPUTE_PENDING'; end if;
    if v_status='paid' then
      v_actual:=public.affiliate_payout_payable(v);
      if (v_expected is not null or v_actual<>v.amount) and v_expected is distinct from v_actual then
        raise exception 'AFFILIATE_PAYOUT_AMOUNT_CHANGED'; end if;
      with backed as (
        select i.commission_id,i.prior_amount,greatest(0,least(i.issue_amount,
          case when c.status='confirmed' and c.payout_retained is null then c.amount else 0 end)-i.prior_amount) cents
          from public.affiliate_payout_items i join public.affiliate_commissions c on c.id=i.commission_id where i.payout_id=v.id
      ), ranked as (
        select *,sum(cents) over(order by commission_id,prior_amount rows unbounded preceding)-cents before_slice from backed
      )
      update public.affiliate_payout_items i set settled_amount=r.prior_amount+greatest(0,least(r.cents,v_actual-r.before_slice))
        from ranked r where i.payout_id=v.id and (i.commission_id,i.prior_amount)=(r.commission_id,r.prior_amount);
    else
      perform public._affiliate_payout_forfeit(v,v_note);
    end if;
  end if;
  update public.affiliate_payouts set status=v_status,paid_amount=v_actual,decided_by=p_actor,note=v_note,
    paid_at=case when v_status='paid' then v_time end,paid_method=case when v_status='paid' then v_method end,
    paid_reference=case when v_status='paid' then v_ref end where id=v.id;
  perform public._affiliate_audit(p_actor,'payout_decide',v.id::text,
    concat_ws(': ',v.status||' -> '||v_status,case when v_status='void' then v_mode end,v_actual::text,v_note));
end;
$$;
