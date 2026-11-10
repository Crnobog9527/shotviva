-- A payout owns the increase in confirmed cents above any previously accounted-for
-- portion of each commission. A partial payment freezes the covered portion at decision
-- time: if a dispute is later won the recovered cents can enter a subsequent payout.
create table public.affiliate_payout_items (
  payout_id bigint not null references public.affiliate_payouts(id) on delete cascade,
  commission_id bigint not null references public.affiliate_commissions(id) on delete cascade,
  prior_amount bigint not null,
  issue_amount bigint not null check (issue_amount > prior_amount and prior_amount >= 0),
  settled_amount bigint check (settled_amount between prior_amount and issue_amount),
  primary key (payout_id,commission_id)
);
create index affiliate_payout_items_commission_idx on public.affiliate_payout_items(commission_id);
alter table public.affiliate_payout_items enable row level security;
revoke all on public.affiliate_payout_items from public,anon,authenticated,service_role;
grant select on public.affiliate_payout_items to service_role;

alter table public.affiliate_payouts add column legacy_review_required boolean not null default false;

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
    select v.id,c.id,b.covered,h.new_amount from public.affiliate_commissions c
    cross join lateral (select new_status,new_amount from public.affiliate_commission_changes
      where commission_id=c.id and at<=v.created_at order by at desc,id desc limit 1) h
    cross join lateral (select coalesce(max(i.issue_amount),0) covered from public.affiliate_payout_items i
      where i.commission_id=c.id) b
    where c.affiliate_user_id=v.affiliate_user_id and h.new_status='confirmed' and h.new_amount>b.covered;
  end loop;
end $$;

-- PostgREST computed field; no client role may inspect settlement data.
create function public.affiliate_payout_payable(p public.affiliate_payouts)
returns bigint language sql stable security invoker set search_path='' as $$
  select case when p.status not in ('due','held') or p.legacy_review_required then null
    else greatest(0,
      p.amount - coalesce((select sum(i.issue_amount-greatest(i.prior_amount,
        least(i.issue_amount,case when c.status='confirmed' then c.amount else 0 end)))
        from public.affiliate_payout_items i join public.affiliate_commissions c on c.id=i.commission_id
        where i.payout_id=p.id),0)::bigint) end;
$$;
revoke all on function public.affiliate_payout_payable(public.affiliate_payouts) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_payout_payable(public.affiliate_payouts) to service_role;

-- Forfeiture only touches linked commissions. Preserve any slice that was already
-- accounted for by an older payout; unrelated earnings and adjustments remain intact.
create function public._affiliate_payout_forfeit(p public.affiliate_payouts,p_actor uuid,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select c.*,i.prior_amount from public.affiliate_payout_items i
    join public.affiliate_commissions c on c.id=i.commission_id where i.payout_id=p.id
    and c.void_reason is distinct from 'admin_void' order by c.id loop
    if r.prior_amount>0 then
      insert into public.affiliate_adjustments(request_id,affiliate_user_id,amount,reason,created_by)
        select gen_random_uuid(),p.affiliate_user_id,least(r.amount,r.prior_amount),
          'payout '||p.id||': preserve previously covered commission '||r.id,p_actor
          where least(r.amount,r.prior_amount)>0;
    end if;
    update public.affiliate_commissions set amount=0,status='void',void_reason='admin_void',updated_at=now() where id=r.id;
    insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
      values(r.id,r.amount,0,r.status,'void','payout '||p.id||': '||p_note);
  end loop;
end;
$$;
revoke all on function public._affiliate_payout_forfeit(public.affiliate_payouts,uuid,text) from public,anon,authenticated,service_role;

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
    perform pay.id from public.affiliate_payout_items i join public.affiliate_commissions c on c.id=i.commission_id
      join public.payments pay on pay.id=c.payment_id where i.payout_id=v.id order by pay.id for update of pay;
    if exists(select from public.affiliate_payout_items i join public.affiliate_commissions c on c.id=i.commission_id
      join public.affiliate_recompute_errors e on e.payment_id=c.payment_id and e.resolved_at is null
      where i.payout_id=v.id) then raise exception 'AFFILIATE_PAYOUT_RECOMPUTE_PENDING'; end if;
    perform c.id from public.affiliate_payout_items i join public.affiliate_commissions c on c.id=i.commission_id
      where i.payout_id=v.id order by c.payment_id,c.level for update of c;
    if v_status='paid' then
      v_actual:=public.affiliate_payout_payable(v);
      if (v_expected is not null or v_actual<>v.amount) and v_expected is distinct from v_actual then
        raise exception 'AFFILIATE_PAYOUT_AMOUNT_CHANGED'; end if;
      update public.affiliate_payout_items i set settled_amount=greatest(i.prior_amount,least(i.issue_amount,
        case when c.status='confirmed' then c.amount else 0 end))
        from public.affiliate_commissions c where i.payout_id=v.id and c.id=i.commission_id;
    else
      perform public._affiliate_payout_forfeit(v,p_actor,v_note);
    end if;
  end if;
  update public.affiliate_payouts set status=v_status,paid_amount=v_actual,decided_by=p_actor,note=v_note,
    paid_at=case when v_status='paid' then v_time end,paid_method=case when v_status='paid' then v_method end,
    paid_reference=case when v_status='paid' then v_ref end where id=v.id;
  perform public._affiliate_audit(p_actor,'payout_decide',v.id::text,
    concat_ws(': ',v.status||' -> '||v_status,case when v_status='void' then v_mode end,v_actual::text,v_note));
end;
$$;
