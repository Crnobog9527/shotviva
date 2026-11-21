-- Enterprise statements (ARCHITECTURE §6.5): marking an org account's statement paid also records
-- the day's CNY-per-USD rate and the CNY actually sent (paid_fx_cny_per_usd, paid_amount_cny_fen,
-- 1641); both are required there. They are refused on a personal statement and on any decision
-- other than paid, so personal payouts behave exactly as before. Fees (#768) are still quoted and
-- confirmed in USD.
create or replace function public.admin_affiliate_payout_decide(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v public.affiliate_payouts; v_status text:=p_input->>'status'; v_note text:=nullif(trim(p_input->>'note'),'');
  v_mode text:=p_input->>'void_mode'; v_method text:=nullif(trim(p_input->>'method'),'');
  v_ref text:=nullif(trim(p_input->>'paid_reference'),''); v_time timestamptz:=(p_input->>'paid_at')::timestamptz;
  v_expected bigint:=(p_input->>'expected_amount')::bigint; v_actual bigint; v_quote jsonb; v_fees bigint;
  v_fx numeric:=(p_input->>'paid_fx_cny_per_usd')::numeric; v_cny bigint:=(p_input->>'paid_amount_cny_fen')::bigint;
  v_org boolean;
begin
  perform public._affiliate_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('affiliate_settlement',0));
  select * into strict v from public.affiliate_payouts where id=(p_input->>'payout_id')::bigint for update;
  if (v.status,v_status) not in (('due','held'),('due','paid'),('held','due'),('held','void'))
    or v_status is null then raise exception 'AFFILIATE_INVALID_PAYOUT_TRANSITION'; end if;
  if (v_status in ('held','void') and v_note is null) or (v_status='void' and (v_mode is null or v_mode not in ('return','forfeit')))
    or (v_status='paid' and (v_method is null or v_time is null or coalesce(v_ref,v_note) is null)) then raise exception 'INVALID_INPUT'; end if;
  select a.org_id is not null into strict v_org from public.affiliates a where a.user_id=v.affiliate_user_id;
  if (v_status='paid' and v_org and (v_fx is null or v_fx<=0 or v_fx>=1000 or v_cny is null or v_cny<=0))
    or ((v_fx is not null or v_cny is not null) and not (v_status='paid' and v_org)) then
    raise exception 'INVALID_INPUT';
  end if;
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
    fee_lines=case when v_status='paid' and v_quote is not null then v_quote->'lines' end,
    paid_fx_cny_per_usd=v_fx,paid_amount_cny_fen=v_cny where id=v.id;
  perform public._affiliate_audit(p_actor,'payout_decide',v.id::text,
    concat_ws(': ',v.status||' -> '||v_status,case when v_status='void' then v_mode end,v_actual::text,
      case when v_quote is not null then 'fees '||v_fees||' net '||(v_quote->>'net') end,
      case when v_cny is not null then 'cny_fen '||v_cny||' fx '||v_fx end,v_note));
end;
$$;
