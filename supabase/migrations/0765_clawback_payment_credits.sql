-- T71 (ARCHITECTURE §6.2 「退款自动扣回积分」): take a payment's credits back, by its own books.
--
-- _payment_granted_credits: what the payment added, read from its own ledger row (the grant's
-- idempotency key is 'purchase:<session id>' for a Stripe checkout, 'renewal:<invoice id>' for a
-- renewal, 'purchase:<PAY_ id>' for Waffo), so a later price change cannot alter it. Waffo rows from
-- before T50 have no payment id: the product's credits stand in.
--
-- clawback_payment_credits(payment, ref, reason): due = granted × the refunded share (floored, so a
-- pro-rata refund rounded up by a cent never asks for one credit more), or everything while the
-- payment is disputed. What the payment has not settled yet (due − clawed back − written off) is
-- taken from the paid balance, capped there: the balance never goes negative and the rest is
-- written off as clawback_shortfall. Settled credits are never asked for again, so a replay, a
-- second partial refund or a later top-up never takes more (no 「下次充值补扣」).
-- ref names what caused it (refund:<charge>:<total refunded>, refund:<Waffo event>, dispute:<id>,
-- …) and keys the ledger row 'clawback:<payment id>:<ref>'. The payment row is locked first, so two
-- deliveries at once settle one after the other. Internal: called by the functions below only.

create or replace function public._payment_granted_credits(p_payment public.payments)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.delta
       from public.credit_ledger l
      where l.idempotency_key = case
              when p_payment.stripe_session_id is not null then 'purchase:' || p_payment.stripe_session_id
              when p_payment.stripe_invoice_id is not null then 'renewal:' || p_payment.stripe_invoice_id
              when p_payment.waffo_payment_id is not null then 'purchase:' || p_payment.waffo_payment_id
            end
        and l.user_id = p_payment.user_id
        and l.kind = 'purchase'
        and l.pool = 'paid'),
    (select pr.credits from public.products pr where pr.id = p_payment.product_id),
    0
  );
$$;

revoke execute on function public._payment_granted_credits(public.payments) from public, anon, authenticated, service_role;

create or replace function public.clawback_payment_credits(p_payment_id bigint, p_ref text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_granted integer;
  v_due integer;
  v_owed integer;
  v_balance integer;
  v_take integer := 0;
  v_key text;
begin
  if p_payment_id is null or p_ref is null or length(p_ref) = 0 or p_reason is null or length(p_reason) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'payment id, ref and reason are required';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  v_granted := public._payment_granted_credits(v_payment);
  v_due := case
    when v_payment.status = 'disputed' then v_granted
    when v_payment.amount_refunded >= v_payment.amount_total then
      case when v_payment.amount_refunded > 0 or v_payment.status = 'refunded' then v_granted else 0 end
    else (v_granted::bigint * v_payment.amount_refunded / v_payment.amount_total)::integer
  end;
  v_owed := greatest(0, v_due - v_payment.credits_clawed_back - v_payment.clawback_shortfall);

  if v_owed > 0 then
    select credits into v_balance from public.profiles where id = v_payment.user_id for update;
    v_take := least(v_owed, greatest(coalesce(v_balance, 0), 0));
    if v_take > 0 then
      v_key := 'clawback:' || p_payment_id || ':' || p_ref;
      if not (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback', -v_take, p_reason, v_key)).applied then
        -- This ref already settled its share (nothing left to do for it).
        v_take := 0;
        v_owed := 0;
      else
        update public.credit_ledger set payment_id = p_payment_id where idempotency_key = v_key;
      end if;
    end if;
    update public.payments
       set credits_clawed_back = credits_clawed_back + v_take,
           clawback_shortfall = clawback_shortfall + (v_owed - v_take)
     where id = p_payment_id
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'granted', v_granted,
    'taken', v_take,
    'written_off', v_owed - v_take,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall
  );
end;
$$;

revoke execute on function public.clawback_payment_credits(bigint, text, text) from public, anon, authenticated, service_role;
