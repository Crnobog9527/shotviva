-- T71 (ARCHITECTURE §6.2 「Waffo 退款与 Stripe 同一规则、同一函数」): refund.succeeded from Waffo.
-- Finds the payment by its PAY_ id, adds this refund once (payment_refunds, keyed by Waffo's event
-- id), then takes the credits back and ends a refunded membership (when it still counted) exactly
-- as record_payment_issue does for Stripe (clawback ref 'refund:<event id>'). p_amount is this refund in cents; null (Waffo
-- may leave refundedAmount out) counts as the whole rest of the payment, so a refund we cannot size
-- still takes the credits back. A disputed payment stays disputed.
-- Returns null when no payment has this PAY_ id (before T50, or not ours); the webhook alerts
-- either way. Lookup by payments_waffo_payment_id_key.
create or replace function public.record_waffo_refund(p_payment_id text, p_refund_ref text, p_amount integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_amount integer;
  v_membership boolean;
  v_paid_until timestamptz;
begin
  if p_payment_id is null or p_refund_ref is null or length(p_refund_ref) = 0 or p_amount < 0 then
    raise exception 'INVALID_INPUT' using detail = 'payment id and refund ref are required';
  end if;

  select * into v_payment from public.payments where waffo_payment_id = p_payment_id for update;
  if not found then
    return null;
  end if;

  v_amount := least(coalesce(p_amount, v_payment.amount_total - v_payment.amount_refunded), v_payment.amount_total);
  insert into public.payment_refunds (refund_ref, payment_id, amount)
  values (p_refund_ref, v_payment.id, v_amount)
  on conflict (refund_ref) do nothing;
  if found then
    update public.payments
       set amount_refunded = least(amount_total, amount_refunded + v_amount),
           status = case
             when status = 'disputed' then status
             when least(amount_total, amount_refunded + v_amount) >= amount_total then 'refunded'
             when amount_refunded + v_amount > 0 then 'partially_refunded'
             else status
           end
     where id = v_payment.id
    returning * into v_payment;
  end if;

  v_membership := false;
  if v_payment.amount_refunded > 0 then
    perform public.clawback_payment_credits(v_payment.id, 'refund:' || p_refund_ref, '退款扣回 ' || p_refund_ref);
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
    'waffo_order_id', v_payment.waffo_order_id
  );
end;
$$;

revoke execute on function public.record_waffo_refund(text, text, integer) from public, anon, authenticated;
grant execute on function public.record_waffo_refund(text, text, integer) to service_role;
