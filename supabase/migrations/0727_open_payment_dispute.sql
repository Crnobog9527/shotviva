-- T82 (ARCHITECTURE §6.3 「拒付申诉证据」 预防): charge.dispute.created records the dispute
-- (payment_disputes, 0725) and bans the buyer, in one transaction.
--
-- Idempotent by dispute id: a redelivered event finds the row and changes nothing (created =
-- false), so the ban and its audit row happen once. `drafted` tells the webhook whether the
-- evidence is staged yet: a draft that failed is retried on Stripe's redelivery.
-- Who answers (responder): 中国银行卡 (cn_card) is always us. A Managed Payments card group
-- payment ('card') is Stripe's unless the session went through the plain card fallback; the
-- payment row says which (managed_payments, 0720), a renewal reads the subscription's first
-- payment of the same product, and rows older than T82 fall back to p_managed_default (whether
-- Managed Payments is on now).
-- The ban goes through admin_ban_user (revokes the Graylum link, audit row with reason 拒付).
-- Never an admin (the Owner's own test purchase must not lock them out) and never twice: an
-- account already banned keeps its first ban, and auto_banned_at stays null.
create function public.open_payment_dispute(
  p_dispute_id text,
  p_charge_id text,
  p_amount integer,
  p_currency text,
  p_reason text,
  p_due_by timestamptz,
  p_managed_default boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payment_disputes;
  v_payment public.payments;
  v_managed boolean;
  v_profile public.profiles;
begin
  if p_dispute_id is null or p_charge_id is null or p_amount is null or p_currency is null
     or p_reason is null or p_managed_default is null then
    raise exception 'INVALID_INPUT' using detail = 'dispute id, charge id, amount, currency, reason and the default are required';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if found then
    return jsonb_build_object('created', false, 'user_id', v_row.user_id, 'payment_id', v_row.payment_id,
      'responder', v_row.responder, 'auto_banned', v_row.auto_banned_at is not null, 'drafted', v_row.evidence_drafted_at is not null);
  end if;

  select * into v_payment from public.payments where stripe_charge_id = p_charge_id;
  v_managed := case
    when v_payment.id is null then p_managed_default
    when v_payment.method = 'cn_card' then false
    when v_payment.method = 'card' then coalesce(
      v_payment.managed_payments,
      (select p.managed_payments from public.payments p
        where p.user_id = v_payment.user_id and p.product_id = v_payment.product_id
          and p.channel = 'stripe' and p.stripe_session_id is not null
          and p.created_at <= v_payment.created_at
        order by p.created_at desc limit 1),
      p_managed_default)
    else p_managed_default
  end;

  insert into public.payment_disputes
    (stripe_dispute_id, stripe_charge_id, payment_id, user_id, amount, currency, reason, responder, due_by)
  values
    (p_dispute_id, p_charge_id, v_payment.id, v_payment.user_id, p_amount, lower(p_currency), p_reason,
     case when v_managed then 'stripe' else 'shotviva' end, p_due_by)
  on conflict (stripe_dispute_id) do nothing
  returning * into v_row;
  if not found then
    -- A concurrent delivery inserted it first; that one bans.
    select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
    return jsonb_build_object('created', false, 'user_id', v_row.user_id, 'payment_id', v_row.payment_id,
      'responder', v_row.responder, 'auto_banned', v_row.auto_banned_at is not null, 'drafted', v_row.evidence_drafted_at is not null);
  end if;

  if v_row.user_id is not null then
    select * into v_profile from public.profiles where id = v_row.user_id for update;
    if found and v_profile.role <> 'admin' and v_profile.banned_at is null then
      perform public.admin_ban_user(v_row.user_id, '拒付');
      update public.payment_disputes set auto_banned_at = now()
       where stripe_dispute_id = p_dispute_id
      returning * into v_row;
    end if;
  end if;

  return jsonb_build_object('created', true, 'user_id', v_row.user_id, 'payment_id', v_row.payment_id,
    'responder', v_row.responder, 'auto_banned', v_row.auto_banned_at is not null, 'drafted', v_row.evidence_drafted_at is not null);
end;
$$;

revoke execute on function public.open_payment_dispute(text, text, integer, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.open_payment_dispute(text, text, integer, text, text, timestamptz, boolean)
  to service_role;
