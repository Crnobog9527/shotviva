-- T71 (ARCHITECTURE §6.2 「会员退款」, 「升级」): "the plan held" skips refunded memberships, the same
-- way current_tier does since 0772. Refunding a Pro upgrade leaves the user on the Starter it
-- replaced, so buying Pro again is an upgrade from Starter (paid_until from the payment), not a
-- same-rank purchase stacked on the refunded one. A replay of a refunded upgrade now finds the
-- lower plan as held and takes the upgrade path, where the idempotency key still stops it before
-- paid_until is touched. Otherwise 0480 unchanged; same signature, so create or replace (AGENTS §5).
create or replace function public.apply_purchase(p_user_id uuid, p_product_id text, p_event_id text)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_change public.credit_change;
  v_paid_until timestamptz;
  v_held text;
  v_key text := 'purchase:' || p_event_id;
  v_ranks constant text[] := array['starter_monthly', 'starter_yearly', 'pro_monthly', 'pro_yearly', 'max_monthly', 'max_yearly'];
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'event_id is required';
  end if;

  select * into v_product from public.products where id = p_product_id and active;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if v_product.days is not null then
    -- Locked now so the read and the write below see the same paid_until.
    select paid_until into v_paid_until from public.profiles where id = p_user_id for update;
    if v_paid_until > now() then
      select product_id into v_held
        from public.credit_ledger
       where user_id = p_user_id
         and pool = 'paid'
         and delta > 0
         and product_id is not null
         and product_id not like 'pack_%'
         and not exists (
           select 1 from public.payments p
            where p.user_id = p_user_id
              and p.status in ('refunded', 'partially_refunded')
              and idempotency_key in ('purchase:' || p.stripe_session_id, 'renewal:' || p.stripe_invoice_id, 'purchase:' || p.waffo_payment_id)
         )
       order by created_at desc, id desc
       limit 1;
    end if;
  end if;

  if v_held is null
     or coalesce(array_position(v_ranks, v_product.id), 0) <= coalesce(array_position(v_ranks, v_held), 0) then
    return public._apply_credit_change(
      p_user_id, 'paid', 'purchase', v_product.credits, 'purchase ' || v_product.id,
      v_key, null, v_product.id, v_product.days
    );
  end if;

  -- The upgrade: grant without days, then set paid_until from the payment.
  v_change := public._apply_credit_change(
    p_user_id, 'paid', 'purchase', v_product.credits, 'purchase ' || v_product.id,
    v_key, null, v_product.id, null
  );
  if not v_change.applied then
    return v_change;
  end if;

  update public.profiles
     set paid_until = greatest(paid_until, now() + make_interval(days => v_product.days))
   where id = p_user_id
  returning paid_until into v_change.paid_until;

  -- The row was inserted just above in this transaction; record where paid_until landed, as
  -- every membership grant does (apply_subscription_renewal does the same).
  update public.credit_ledger
     set paid_until_after = v_change.paid_until
   where idempotency_key = v_key;

  return v_change;
end;
$$;
