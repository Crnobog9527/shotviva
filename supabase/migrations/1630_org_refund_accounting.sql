-- Refunds and enterprise transfers (ARCHITECTURE §6.5, §6.3「退款自动扣回积分」). Same bodies as
-- 0222 (refund_eligibility) and 0765 (clawback_payment_credits) except:
--  - putting credits into an org pool (org_deposit) counts as using them, so the refund screen no
--    longer reports "no credits used" for a pack that was deposited;
--  - a clawback takes only the member's own paid credits, never the org-held share, which stays
--    the org's (and goes back to its pool when the member leaves). What cannot be taken is the
--    payment's shortfall, as before.
CREATE OR REPLACE FUNCTION "public"."refund_eligibility"("p_payment_id" bigint, "p_asked_at" timestamp with time zone) RETURNS TABLE("first_purchase" boolean, "within_7_days" boolean, "no_credits_used" boolean, "suggested_cents" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  first_purchase := not exists (
    select 1 from public.payments q
     where q.user_id = v_payment.user_id
       and q.id < v_payment.id
       and (q.product_id like 'pack\_%') = (v_payment.product_id like 'pack\_%')
  );
  within_7_days := coalesce(p_asked_at, now()) - v_payment.created_at <= interval '7 days';
  no_credits_used := not exists (
    select 1 from public.credit_ledger l
     where l.user_id = v_payment.user_id and l.kind in ('reserve','org_deposit') and l.created_at > v_payment.created_at
  );
  suggested_cents := greatest(0, least(
    round((v_payment.amount_total - v_payment.amount_tax) * 0.94)::integer + v_payment.amount_tax,
    v_payment.amount_total - v_payment.amount_refunded
  ));
  return next;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."clawback_payment_credits"("p_payment_id" bigint, "p_ref" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    -- Only the member's own credits: the org-held share (1629 keeps it at most credits) is the org's.
    v_balance := coalesce(v_balance, 0) - coalesce((select m.held_credits from public.org_members m
      where m.user_id = v_payment.user_id and m.status = 'active'), 0);
    v_take := least(v_owed, greatest(v_balance, 0));
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
