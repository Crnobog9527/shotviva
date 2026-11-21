-- F3 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): what the webhook needs before it writes a payment's
-- fees with payment_fee_record (1703), in one read: the payments row it settled (found by the
-- Stripe Checkout Session / invoice id, the Waffo PAY_ id, or the row id), whether that payment
-- is on or after payment_fee_settings.record_from, and the published rates in force when it was
-- created, one per fee kind for its channel and method. Read-only; the webhook asks before it
-- calls Stripe again, so with record_from unset nothing past this read ever runs.
-- NULL when no payments row matches.
create function public.payment_fee_target(p_payment_id bigint, p_ref text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_payment public.payments;
  v_from timestamptz;
begin
  if (p_payment_id is null) = (p_ref is null) then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_target: give a payment id or a reference';
  end if;
  if p_payment_id is not null then
    select * into v_payment from public.payments where id = p_payment_id;
  elsif p_ref like 'cs\_%' then
    select * into v_payment from public.payments where stripe_session_id = p_ref;
  elsif p_ref like 'in\_%' then
    select * into v_payment from public.payments where stripe_invoice_id = p_ref;
  elsif p_ref like 'PAY\_%' then
    select * into v_payment from public.payments where waffo_payment_id = p_ref;
  else
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_target: unknown reference';
  end if;
  if not found then return null; end if;
  select record_from into v_from from public.payment_fee_settings where singleton;
  return jsonb_build_object(
    'payment_id', v_payment.id,
    'channel', v_payment.channel,
    'method', v_payment.method,
    'currency', v_payment.currency,
    'amount_total', v_payment.amount_total,
    'recordable', v_from is not null and v_payment.created_at >= v_from,
    -- Same choice as payment_fee_schedule_for: the latest active version in force at created_at.
    'schedules', coalesce((
      select jsonb_object_agg(s.kind, jsonb_build_object('id', s.id, 'rate_bp', s.rate_bp, 'fixed_cents', s.fixed_cents))
        from (select distinct on (kind) * from public.payment_fee_schedules
               where channel = v_payment.channel and method = v_payment.method and active
                 and effective_from <= v_payment.created_at
               order by kind, effective_from desc, id desc) s), '{}'::jsonb));
end;
$$;
revoke all on function public.payment_fee_target(bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_target(bigint,text) to service_role;
