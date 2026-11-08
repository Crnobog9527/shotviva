-- T71 (ARCHITECTURE §6.2 「人工审核」, §10 退款工单): 「扣回这笔付款的剩余积分」. Before a pro-rata
-- refund of a purchase whose credits were partly used, the Owner takes back what the user still
-- has of it: least(paid balance, granted − what the payment already settled), booked on the
-- payment (credits_clawed_back), so the refund callback that follows only takes what its share
-- still asks for (usually nothing). Never writes a shortfall: that is for refunds that are due.
--
-- payment_clawback_preview: the numbers for the confirm dialog. admin_clawback_payment: does it,
-- with an audit row ('clawback_payment'); p_actor is passed by the server (service role has no
-- auth.uid(), as admin_mark_dispute_submitted). A double submit takes nothing the second time:
-- the ledger key carries what was settled before, and after the first take nothing is left.
create or replace function public.payment_clawback_preview(p_payment_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_granted integer;
  v_balance integer;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  v_granted := public._payment_granted_credits(v_payment);
  select credits into v_balance from public.profiles where id = v_payment.user_id;
  return jsonb_build_object(
    'payment_id', v_payment.id,
    'user_id', v_payment.user_id,
    'product_id', v_payment.product_id,
    'granted', v_granted,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall,
    'balance', coalesce(v_balance, 0),
    'available', greatest(0, least(coalesce(v_balance, 0), v_granted - v_payment.credits_clawed_back - v_payment.clawback_shortfall))
  );
end;
$$;

revoke execute on function public.payment_clawback_preview(bigint) from public, anon, authenticated;
grant execute on function public.payment_clawback_preview(bigint) to service_role;

create or replace function public.admin_clawback_payment(p_payment_id bigint, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_granted integer;
  v_balance integer;
  v_take integer;
  v_key text;
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  v_granted := public._payment_granted_credits(v_payment);
  select credits into v_balance from public.profiles where id = v_payment.user_id for update;
  v_take := greatest(0, least(coalesce(v_balance, 0), v_granted - v_payment.credits_clawed_back - v_payment.clawback_shortfall));

  if v_take > 0 then
    v_key := 'clawback:' || p_payment_id || ':admin:' || (v_payment.credits_clawed_back + v_payment.clawback_shortfall);
    if (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback', -v_take,
          '后台扣回付款 #' || p_payment_id || ' 的剩余积分 · 操作人 ' || p_actor::text, v_key)).applied then
      update public.credit_ledger set payment_id = p_payment_id where idempotency_key = v_key;
      update public.payments set credits_clawed_back = credits_clawed_back + v_take
       where id = p_payment_id
      returning * into v_payment;
      insert into public.admin_audit_log (action, user_id, reason, target_id)
      values ('clawback_payment', v_payment.user_id, '扣回 ' || v_take || ' 积分 · 操作人 ' || p_actor::text, p_payment_id::text);
    else
      v_take := 0;
    end if;
  end if;

  return jsonb_build_object(
    'taken', v_take,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall
  );
end;
$$;

revoke execute on function public.admin_clawback_payment(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_clawback_payment(bigint, uuid) to service_role;
