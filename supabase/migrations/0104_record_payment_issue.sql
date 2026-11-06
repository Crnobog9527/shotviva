-- T10: charge.refunded and charge.dispute.created are recorded on the payment and alerted;
-- credits are never clawed back (ARCHITECTURE §6.2: Link support can refund within 60 days
-- without us; the Owner adjusts credits by hand with admin_adjust_credits).
--
-- Refund: amount_refunded is Stripe's running total for the charge, as just retrieved; it only
-- ever grows, so redelivered or out-of-order refund events cannot lower it. Status becomes
-- refunded (all of it) or partially_refunded. A disputed payment stays disputed: the dispute is
-- what the Owner must act on.
-- Dispute: status becomes disputed.
--
-- Returns the payment's owner, product, status and amounts, or null when no payment has this
-- charge (paid before payments existed, or not ours); the webhook alerts either way.
-- Lookup by payments_stripe_charge_id_key.
create function public.record_payment_issue(
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
       set status = 'disputed'
     where stripe_charge_id = p_charge_id
    returning * into v_payment;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_payment.user_id,
    'product_id', v_payment.product_id,
    'status', v_payment.status,
    'amount_total', v_payment.amount_total,
    'amount_refunded', v_payment.amount_refunded,
    'currency', v_payment.currency
  );
end;
$$;

revoke execute on function public.record_payment_issue(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_payment_issue(text, text, integer)
  to service_role;
