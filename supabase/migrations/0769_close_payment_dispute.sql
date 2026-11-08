-- T71 (ARCHITECTURE §6.2 「拒付」, §6.3): charge.dispute.closed. When the money stays with us the
-- credits the dispute took are given back; when the bank sides with the buyer they stay taken.
--
-- Kept: 'won', and 'warning_closed' (an inquiry the bank closed without turning it into a
-- chargeback: no money left on it). Every other final status ('lost', …) keeps the clawback.
-- A payment can carry more than one dispute (an inquiry that escalates into a chargeback has its
-- own id), so a close looks at the payment's other disputes:
--   - another one still open: the payment stays disputed; a kept close hands its share
--     (credits_clawed_back, clawback_shortfall) to the newest open dispute, which then decides;
--     a lost one keeps its share;
--   - none open, and none closed lost: a kept close gives its share back to the paid pool as a
--     'clawback_restore' row, takes its written-off part off the payment's shortfall, and puts
--     the payment's status back to what its refunds say; a refund recorded meanwhile is settled;
--   - none open, but another closed lost (the money went back to the buyer): nothing is restored.
-- The ban stays (the Owner can lift it in the admin). Lock order as everywhere in T71: payment,
-- then its disputes, then the profile. Idempotent by dispute id: only the first close acts; later
-- deliveries answer first_close = false; superseded says another dispute on the payment is still
-- open. Returns null for a dispute we have no row for (opened
-- before T82).
create or replace function public.close_payment_dispute(p_dispute_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payment_disputes;
  v_open public.payment_disputes;
  v_payment public.payments;
  v_first boolean := false;
  v_superseded boolean := false;
  v_kept boolean := p_status in ('won', 'warning_closed');
  v_key text := 'clawback_restore:' || p_dispute_id;
begin
  if p_dispute_id is null or p_status is null or p_status !~ '^[a-z_]{1,40}$' then
    raise exception 'INVALID_INPUT' using detail = 'dispute id and status are required';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if not found then
    return null;
  end if;
  if v_row.payment_id is not null then
    select * into v_payment from public.payments where id = v_row.payment_id for update;
  end if;
  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id for update;

  if v_row.closed_at is null then
    v_first := true;
    update public.payment_disputes set closed_status = p_status, closed_at = now()
     where stripe_dispute_id = p_dispute_id
    returning * into v_row;

    if v_row.payment_id is not null then
      select * into v_open from public.payment_disputes
       where payment_id = v_row.payment_id and closed_at is null
       order by created_at desc, stripe_dispute_id desc
       limit 1
       for update;
      if found then
        v_superseded := true;
        if v_kept then
          update public.payment_disputes
             set credits_clawed_back = credits_clawed_back + v_row.credits_clawed_back,
                 clawback_shortfall = clawback_shortfall + v_row.clawback_shortfall
           where stripe_dispute_id = v_open.stripe_dispute_id;
          update public.payment_disputes set credits_clawed_back = 0, clawback_shortfall = 0
           where stripe_dispute_id = p_dispute_id
          returning * into v_row;
        end if;
      elsif v_kept and not exists (
        select 1 from public.payment_disputes d
         where d.payment_id = v_row.payment_id
           and d.stripe_dispute_id <> p_dispute_id
           and d.closed_status not in ('won', 'warning_closed')
      ) then
        if v_row.credits_clawed_back > 0
           and (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback_restore', v_row.credits_clawed_back,
                  '拒付胜诉还回 ' || p_dispute_id, v_key)).applied then
          update public.credit_ledger set payment_id = v_payment.id where idempotency_key = v_key;
        end if;
        update public.payments
           set credits_clawed_back = greatest(0, credits_clawed_back - v_row.credits_clawed_back),
               clawback_shortfall = greatest(0, clawback_shortfall - v_row.clawback_shortfall),
               status = case
                 when status <> 'disputed' then status
                 when amount_total > 0 and amount_refunded >= amount_total then 'refunded'
                 when amount_refunded > 0 then 'partially_refunded'
                 else 'paid'
               end
         where id = v_payment.id;
        update public.payment_disputes set credits_restored = v_row.credits_clawed_back
         where stripe_dispute_id = p_dispute_id
        returning * into v_row;
        perform public.clawback_payment_credits(v_payment.id, 'dispute_closed:' || p_dispute_id, '退款扣回 ' || p_dispute_id);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'first_close', v_first,
    -- Another dispute on the payment is still open and now decides (the Owner hears when it closes).
    'superseded', v_superseded,
    'kept', v_row.closed_status in ('won', 'warning_closed'),
    'closed_status', v_row.closed_status,
    'credits_restored', v_row.credits_restored,
    'user_id', v_row.user_id,
    'payment_id', v_row.payment_id,
    'product_id', v_payment.product_id,
    'amount', v_row.amount,
    'currency', v_row.currency
  );
end;
$$;

revoke execute on function public.close_payment_dispute(text, text) from public, anon, authenticated;
grant execute on function public.close_payment_dispute(text, text) to service_role;
