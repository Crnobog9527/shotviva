-- Settlement with payout fee rules (ARCHITECTURE §6.2 联盟返佣 · 打款扣费).
-- affiliate_daily: every new statement stores the rules in force for its payout method at
-- issue time (an empty array when none). The $200 threshold still compares the gross balance.
-- admin_affiliate_payout_decide: marking paid applies the stored rules to the gross payable at
-- that moment and records fee_amount / fee_lines; the admin confirms the net. Statements without
-- stored rules (issued before this release) are paid exactly as before.

create or replace function public.affiliate_daily(p_today date) returns void
language plpgsql security definer set search_path='' as $$
declare v_settings public.affiliate_settings; v_payment bigint; v_cutoff timestamptz; v_issue boolean:=false;
begin
  select s.* into strict v_settings from public.affiliate_settings s where singleton;
  if p_today is null then raise exception 'INVALID_INPUT'; end if;
  -- Serialize payout decisions and issuance; payment writes do not take this lock.
  perform pg_advisory_xact_lock(hashtextextended('affiliate_settlement',0));
  for v_payment in select payment_id from public.affiliate_recompute_errors where resolved_at is null order by payment_id loop
    perform public.affiliate_recompute_payment(v_payment);
  end loop;
  -- Mark the scheduled evaluation even when disabled or nobody qualifies.
  -- Any later failure rolls this insert back together with issuance.
  if extract(day from p_today)>=v_settings.settlement_day then
    insert into public.affiliate_settlement_runs(period) values(date_trunc('month',p_today)::date)
      on conflict(period) do nothing;
    v_issue:=found;
  end if;
  if not v_settings.enabled then return; end if;
  v_cutoff:=case when p_today=(now() at time zone 'UTC')::date then now() else p_today::timestamp at time zone 'UTC' end;
  -- A refund/dispute updates and locks this same commission. EvalPlanQual rechecks pending after waiting.
  with changed as (
    update public.affiliate_commissions c set status='confirmed',confirmed_at=v_cutoff,updated_at=now()
    where c.status='pending' and c.confirm_after<=v_cutoff and (cardinality(c.flags)=0 or c.released_by is not null)
      and not exists(select from public.payment_disputes d where d.payment_id=c.payment_id and
        (d.closed_at is null or d.closed_status not in ('won','warning_closed')))
      and not exists(select from public.affiliate_recompute_errors e where e.payment_id=c.payment_id and e.resolved_at is null)
    returning c.id,c.amount)
  insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
    select id,amount,amount,'pending','confirmed','confirmed' from changed;
  if not v_issue then return; end if;
  -- One MVCC snapshot for the balance and its commission backing. Refunds that
  -- commit after this statement are measured against these exact amounts at payment.
  with issued as (
    insert into public.affiliate_payouts(affiliate_user_id,period,amount,payout_snapshot,fee_rules)
      select a.user_id,date_trunc('month',p_today)::date,b.available,
        jsonb_build_object('payout_method',a.payout_method,'payout_details',a.payout_details),
        public.affiliate_payout_fee_rules_for('standard',a.payout_method,v_cutoff)
        from public.affiliates a join public.affiliate_balances b on b.affiliate_user_id=a.user_id
       where a.status='active' and a.payout_method is not null and b.available>0 and b.available>=v_settings.payout_min_usd
      on conflict(affiliate_user_id,period) do nothing returning id,affiliate_user_id,amount)
  insert into public.affiliate_payout_items(payout_id,commission_id,prior_amount,issue_amount)
    select n.id,a.* from issued n
      cross join lateral public._affiliate_allocate_payout(n.affiliate_user_id,n.amount) a;
end;
$$;

create or replace function public.admin_affiliate_payout_decide(p_actor uuid, p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v public.affiliate_payouts; v_status text:=p_input->>'status'; v_note text:=nullif(trim(p_input->>'note'),'');
  v_mode text:=p_input->>'void_mode'; v_method text:=nullif(trim(p_input->>'method'),'');
  v_ref text:=nullif(trim(p_input->>'paid_reference'),''); v_time timestamptz:=(p_input->>'paid_at')::timestamptz;
  v_expected bigint:=(p_input->>'expected_amount')::bigint; v_actual bigint; v_quote jsonb; v_fees bigint;
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
      if v.fee_rules is not null then
        v_quote:=public.affiliate_payout_fee_quote(v.fee_rules,v_actual);
        v_fees:=(v_quote->>'fees')::bigint;
        -- Fees ate the whole payout: nothing would be sent, so do not consume the balance.
        if v_fees>0 and (v_quote->>'net')::bigint=0 then raise exception 'AFFILIATE_PAYOUT_NET_ZERO'; end if;
        -- The admin confirms the net they sent. A form without expected_net (rendered before
        -- fees existed) may only pay statements that carry no fee.
        if (p_input ? 'expected_net' or v_fees>0)
          and (p_input->>'expected_net')::bigint is distinct from (v_quote->>'net')::bigint then
          raise exception 'AFFILIATE_PAYOUT_AMOUNT_CHANGED'; end if;
      end if;
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
    paid_reference=case when v_status='paid' then v_ref end,
    fee_amount=case when v_status='paid' and v_quote is not null then v_fees end,
    fee_lines=case when v_status='paid' and v_quote is not null then v_quote->'lines' end where id=v.id;
  perform public._affiliate_audit(p_actor,'payout_decide',v.id::text,
    concat_ws(': ',v.status||' -> '||v_status,case when v_status='void' then v_mode end,v_actual::text,
      case when v_quote is not null then 'fees '||v_fees||' net '||(v_quote->>'net') end,v_note));
end;
$$;
