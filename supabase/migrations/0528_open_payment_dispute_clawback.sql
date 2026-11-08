-- T71 (ARCHITECTURE §6.2 「拒付」): a new dispute also takes the purchase's credits back in full
-- (the same clawback_payment_credits, capped at the paid balance) and keeps its own share on the
-- dispute row, so a win gives exactly that back (close_payment_dispute, 0529). Everything else is
-- 0727 unchanged: idempotent by dispute id (a redelivery takes nothing again), the same ban.
-- The answer gains the payment's clawback totals for the Owner's one alert (T72).
create or replace function public._payment_dispute_answer(p_row public.payment_disputes, p_created boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'created', p_created,
    'user_id', p_row.user_id,
    'payment_id', p_row.payment_id,
    'responder', p_row.responder,
    'auto_banned', p_row.auto_banned_at is not null,
    'drafted', p_row.evidence_drafted_at is not null,
    'credits_clawed_back', (select p.credits_clawed_back from public.payments p where p.id = p_row.payment_id),
    'clawback_shortfall', (select p.clawback_shortfall from public.payments p where p.id = p_row.payment_id)
  );
$$;

revoke execute on function public._payment_dispute_answer(public.payment_disputes, boolean) from public, anon, authenticated, service_role;

create or replace function public.open_payment_dispute(
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
  v_claw jsonb;
begin
  if p_dispute_id is null or p_charge_id is null or p_amount is null or p_currency is null
     or p_reason is null or p_managed_default is null then
    raise exception 'INVALID_INPUT' using detail = 'dispute id, charge id, amount, currency, reason and the default are required';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if found then
    return public._payment_dispute_answer(v_row, false);
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
    -- A concurrent delivery inserted it first; that one bans and claws back.
    select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
    return public._payment_dispute_answer(v_row, false);
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

  if v_row.payment_id is not null then
    -- record_payment_issue marks it first; set here too so the clawback asks for everything.
    update public.payments set status = 'disputed' where id = v_row.payment_id and status <> 'disputed';
    v_claw := public.clawback_payment_credits(v_row.payment_id, 'dispute:' || p_dispute_id, '拒付扣回 ' || p_dispute_id);
    update public.payment_disputes
       set credits_clawed_back = (v_claw ->> 'taken')::integer,
           clawback_shortfall = (v_claw ->> 'written_off')::integer
     where stripe_dispute_id = p_dispute_id
    returning * into v_row;
  end if;

  return public._payment_dispute_answer(v_row, true);
end;
$$;
