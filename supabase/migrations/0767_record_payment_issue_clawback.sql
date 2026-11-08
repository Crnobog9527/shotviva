-- T71 (ARCHITECTURE §6.2 「退款自动扣回积分」, §6.3): charge.refunded now also takes the credits
-- back and ends a refunded membership, in the same transaction as the record (AGENTS §5.1 #1).
-- Same signature and the same record as 0104; the returned object only gains keys (the deployed
-- webhook reads it with a non-strict schema, and already reads credits_clawed_back /
-- clawback_shortfall as optional, T72).
--
-- Refund: amount_refunded is Stripe's running total for the charge and only ever grows; the
-- clawback ref is 'refund:<charge>:<that total>', so each new total settles once and a replay of
-- it takes nothing. A membership refund (any amount) ends the membership when it still counted
-- (_end_membership_after_refund: paid_until moved back, or this payment's own period is the
-- current one); only then does the webhook cancel the subscription it paid for. Refunding an old
-- renewal whose period is over ends nothing.
-- Dispute: status becomes disputed, nothing else here. open_payment_dispute (0768) takes the
-- credits back and keeps the dispute's own share, so a win can give exactly that back; the
-- clawback keys are left out of this answer so the deployed alert does not report 0 taken. A
-- redelivered charge.dispute.created after every dispute on the charge has closed (a win put the
-- status back) leaves the status alone; a genuinely new dispute is marked by open_payment_dispute.
--
-- Returns null when no payment has this charge (paid before payments existed, or not ours).
create or replace function public.record_payment_issue(
  p_charge_id text,
  p_kind text,
  p_amount_refunded integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_membership boolean := false;
  v_paid_until timestamptz;
begin
  if p_charge_id is null or p_kind is null or p_kind not in ('refunded', 'disputed') then
    raise exception 'INVALID_INPUT' using detail = 'charge id and kind (refunded / disputed) are required';
  end if;
  if p_kind = 'refunded' and (p_amount_refunded is null or p_amount_refunded < 0) then
    raise exception 'INVALID_INPUT' using detail = 'refund needs the refunded amount';
  end if;

  if p_kind = 'refunded' then
    update public.payments
       set amount_refunded = least(amount_total, greatest(amount_refunded, p_amount_refunded)),
           status = case
             when status = 'disputed' then status
             when least(amount_total, greatest(amount_refunded, p_amount_refunded)) >= amount_total then 'refunded'
             when greatest(amount_refunded, p_amount_refunded) > 0 then 'partially_refunded'
             else status
           end
     where stripe_charge_id = p_charge_id
    returning * into v_payment;
  else
    update public.payments
       set status = case
             when exists (select 1 from public.payment_disputes d where d.stripe_charge_id = p_charge_id)
              and not exists (select 1 from public.payment_disputes d where d.stripe_charge_id = p_charge_id and d.closed_at is null)
             then status
             else 'disputed'
           end
     where stripe_charge_id = p_charge_id
    returning * into v_payment;
  end if;

  if not found then
    return null;
  end if;

  if p_kind = 'disputed' then
    return jsonb_build_object(
      'payment_id', v_payment.id,
      'user_id', v_payment.user_id,
      'product_id', v_payment.product_id,
      'status', v_payment.status,
      'amount_total', v_payment.amount_total,
      'amount_refunded', v_payment.amount_refunded,
      'currency', v_payment.currency
    );
  end if;

  if v_payment.amount_refunded > 0 then
    perform public.clawback_payment_credits(
      v_payment.id, 'refund:' || p_charge_id || ':' || v_payment.amount_refunded, '退款扣回 ' || p_charge_id);
    if exists (select 1 from public.products where id = v_payment.product_id and days is not null) then
      v_membership := public._end_membership_after_refund(v_payment.user_id, v_payment);
    end if;
    select * into v_payment from public.payments where id = v_payment.id;
    select paid_until into v_paid_until from public.profiles where id = v_payment.user_id;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'user_id', v_payment.user_id,
    'product_id', v_payment.product_id,
    'status', v_payment.status,
    'amount_total', v_payment.amount_total,
    'amount_refunded', v_payment.amount_refunded,
    'currency', v_payment.currency,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall,
    'membership_ended', v_membership,
    'paid_until', v_paid_until,
    'stripe_session_id', v_payment.stripe_session_id,
    'stripe_invoice_id', v_payment.stripe_invoice_id
  );
end;
$$;
