-- T66 (ARCHITECTURE §6.2 「升级」, Owner 2026-11-07): a higher membership bought while one runs
-- is an upgrade. Its credits are granted in full at once as before; paid_until then runs from
-- the payment, `greatest(paid_until, now() + the new plan's days)`, instead of stacking the new
-- period on top of the old one (the old plan's subscription is cancelled at once, so its unused
-- days must not be added again). Everything else is unchanged: a first purchase, a renewal of
-- the same plan (Waffo card renewals, an Alipay "Renew"), a lower or same-ranked plan and packs
-- still go through _apply_credit_change exactly as in 0002.
--
-- "Runs" and "the plan held" read the same rows as current_tier(): paid_until > now() and the
-- latest paid-pool membership grant (credit_ledger_user_id_created_at_idx). Rank: starter <
-- pro < max, monthly < yearly on one tier. A replay of the upgrade finds its own grant as the
-- latest, ranks equal, and takes the unchanged path, where the idempotency key stops it.
-- Same signature, so create or replace (AGENTS §5); grants are kept.
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
