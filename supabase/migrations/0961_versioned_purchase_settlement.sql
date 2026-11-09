-- Keep v1 signatures and execute grants. Private implementations select the version
-- explicitly, so a client cannot switch denominations through session configuration.

CREATE OR REPLACE FUNCTION admin.purchase_terms(p_v2 boolean, "p_user_id" "uuid", "p_product_id" "text", "p_event_id" "text") RETURNS "public"."credit_change"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if p_v2 then
    select credits into strict v_product.credits from admin.product_terms_v2 where product_id = p_product_id;
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

revoke all on function admin.purchase_terms(boolean, "uuid", "text", "text") from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_purchase("p_user_id" "uuid", "p_product_id" "text", "p_event_id" "text") RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.purchase_terms(false, p_user_id, p_product_id, p_event_id); $$;

CREATE OR REPLACE FUNCTION admin.renewal_terms(p_v2 boolean, "p_user_id" "uuid", "p_product_id" "text", "p_invoice_id" "text", "p_period_end" timestamp with time zone, "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_charge_id" "text" DEFAULT NULL::"text") RETURNS "public"."credit_change"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_product public.products;
  v_change public.credit_change;
  v_key text := 'renewal:' || p_invoice_id;
begin
  if p_invoice_id is null or p_invoice_id not like 'in\_%' then
    raise exception 'INVALID_INPUT' using detail = 'invoice id is required';
  end if;
  if p_period_end is null then
    raise exception 'INVALID_INPUT' using detail = 'period end is required';
  end if;
  if p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  -- Only memberships renew; packs are always one-time.
  select * into v_product from public.products
   where id = p_product_id and active and days is not null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if p_v2 then
    select credits into strict v_product.credits from admin.product_terms_v2 where product_id = p_product_id;
  end if;


  -- No days here: paid_until is set below from the period end, not by adding days.
  v_change := public._apply_credit_change(
    p_user_id, 'paid', 'purchase', v_product.credits, 'renewal ' || v_product.id,
    v_key, null, v_product.id, null
  );
  if not v_change.applied then
    return v_change;
  end if;

  update public.profiles
     set paid_until = greatest(paid_until, p_period_end)
   where id = p_user_id
  returning paid_until into v_change.paid_until;

  -- The row was inserted just above in this transaction; record where paid_until landed, as
  -- membership purchases do.
  update public.credit_ledger
     set paid_until_after = v_change.paid_until
   where idempotency_key = v_key;

  insert into public.payments
    (user_id, product_id, channel, stripe_invoice_id, stripe_charge_id,
     amount_total, amount_tax, currency, method)
  values
    (p_user_id, p_product_id, 'stripe', p_invoice_id, p_charge_id,
     p_amount_total, p_amount_tax, lower(p_currency), p_method);

  return v_change;
end;
$$;

revoke all on function admin.renewal_terms(boolean, "uuid", "text", "text", timestamp with time zone, integer, "text", integer, "text", "text") from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_subscription_renewal("p_user_id" "uuid", "p_product_id" "text", "p_invoice_id" "text", "p_period_end" timestamp with time zone, "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_charge_id" "text" DEFAULT NULL::"text") RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.renewal_terms(false, p_user_id, p_product_id, p_invoice_id, p_period_end, p_amount_total, p_currency, p_amount_tax, p_method, p_charge_id); $$;

CREATE OR REPLACE FUNCTION public.apply_subscription_renewal_v2("p_user_id" "uuid", "p_product_id" "text", "p_invoice_id" "text", "p_period_end" timestamp with time zone, "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_charge_id" "text" DEFAULT NULL::"text") RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.renewal_terms(true, p_user_id, p_product_id, p_invoice_id, p_period_end, p_amount_total, p_currency, p_amount_tax, p_method, p_charge_id); $$;

revoke all on function public.apply_subscription_renewal_v2("uuid", "text", "text", timestamp with time zone, integer, "text", integer, "text", "text") from public, anon, authenticated;
grant execute on function public.apply_subscription_renewal_v2("uuid", "text", "text", timestamp with time zone, integer, "text", integer, "text", "text") to service_role;

CREATE OR REPLACE FUNCTION admin.checkout_terms(p_v2 boolean, "p_user_id" "uuid", "p_product_id" "text", "p_session_id" "text", "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_invoice_id" "text" DEFAULT NULL::"text", "p_charge_id" "text" DEFAULT NULL::"text", "p_subscription_id" "text" DEFAULT NULL::"text", "p_subscription_status" "text" DEFAULT NULL::"text", "p_current_period_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cancel_at_period_end" boolean DEFAULT NULL::boolean) RETURNS "public"."credit_change"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_change public.credit_change;
begin
  if p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  if p_subscription_id is not null then
    if p_subscription_status is null or p_current_period_end is null or p_cancel_at_period_end is null then
      raise exception 'INVALID_INPUT' using detail = 'subscription fields are all required';
    end if;
    insert into public.subscriptions
      (stripe_subscription_id, user_id, product_id, status, current_period_end, cancel_at_period_end)
    values
      (p_subscription_id, p_user_id, p_product_id, p_subscription_status, p_current_period_end, p_cancel_at_period_end)
    on conflict (stripe_subscription_id) do update
       set status = excluded.status,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = now()
     where public.subscriptions.user_id = excluded.user_id
       and public.subscriptions.product_id = excluded.product_id;
    if not found then
      raise exception 'IDEMPOTENCY_CONFLICT' using detail = 'subscription belongs to another user or product';
    end if;
  end if;

  v_change := admin.purchase_terms(p_v2, p_user_id, p_product_id, p_session_id);

  if v_change.applied then
    insert into public.payments
      (user_id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id,
       amount_total, amount_tax, currency, method)
    values
      (p_user_id, p_product_id, 'stripe', p_session_id, p_invoice_id, p_charge_id,
       p_amount_total, p_amount_tax, lower(p_currency), p_method);
  end if;

  return v_change;
end;
$$;

revoke all on function admin.checkout_terms(boolean, "uuid", "text", "text", integer, "text", integer, "text", "text", "text", "text", "text", timestamp with time zone, boolean) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_checkout("p_user_id" "uuid", "p_product_id" "text", "p_session_id" "text", "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_invoice_id" "text" DEFAULT NULL::"text", "p_charge_id" "text" DEFAULT NULL::"text", "p_subscription_id" "text" DEFAULT NULL::"text", "p_subscription_status" "text" DEFAULT NULL::"text", "p_current_period_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cancel_at_period_end" boolean DEFAULT NULL::boolean) RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.checkout_terms(false, p_user_id, p_product_id, p_session_id, p_amount_total, p_currency, p_amount_tax, p_method, p_invoice_id, p_charge_id, p_subscription_id, p_subscription_status, p_current_period_end, p_cancel_at_period_end); $$;

CREATE OR REPLACE FUNCTION public.settle_checkout_v2("p_user_id" "uuid", "p_product_id" "text", "p_session_id" "text", "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_invoice_id" "text" DEFAULT NULL::"text", "p_charge_id" "text" DEFAULT NULL::"text", "p_subscription_id" "text" DEFAULT NULL::"text", "p_subscription_status" "text" DEFAULT NULL::"text", "p_current_period_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_cancel_at_period_end" boolean DEFAULT NULL::boolean) RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.checkout_terms(true, p_user_id, p_product_id, p_session_id, p_amount_total, p_currency, p_amount_tax, p_method, p_invoice_id, p_charge_id, p_subscription_id, p_subscription_status, p_current_period_end, p_cancel_at_period_end); $$;

revoke all on function public.settle_checkout_v2("uuid", "text", "text", integer, "text", integer, "text", "text", "text", "text", "text", timestamp with time zone, boolean) from public, anon, authenticated;
grant execute on function public.settle_checkout_v2("uuid", "text", "text", integer, "text", integer, "text", "text", "text", "text", "text", timestamp with time zone, boolean) to service_role;

CREATE OR REPLACE FUNCTION admin.waffo_terms(p_v2 boolean, "p_user_id" "uuid", "p_product_id" "text", "p_payment_id" "text", "p_order_id" "text", "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text") RETURNS "public"."credit_change"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_change public.credit_change;
begin
  if p_order_id is null or p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  v_change := admin.purchase_terms(p_v2, p_user_id, p_product_id, p_payment_id);

  if v_change.applied then
    insert into public.payments
      (user_id, product_id, channel, waffo_order_id, waffo_payment_id, amount_total, amount_tax, currency, method)
    values
      (p_user_id, p_product_id, 'waffo', p_order_id, p_payment_id, p_amount_total, p_amount_tax, lower(p_currency), p_method);
  end if;

  return v_change;
end;
$$;

revoke all on function admin.waffo_terms(boolean, "uuid", "text", "text", "text", integer, "text", integer, "text") from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_waffo_order("p_user_id" "uuid", "p_product_id" "text", "p_payment_id" "text", "p_order_id" "text", "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text") RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.waffo_terms(false, p_user_id, p_product_id, p_payment_id, p_order_id, p_amount_total, p_currency, p_amount_tax, p_method); $$;

CREATE OR REPLACE FUNCTION public.settle_waffo_order_v2("p_user_id" "uuid", "p_product_id" "text", "p_payment_id" "text", "p_order_id" "text", "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text") RETURNS "public"."credit_change"
    LANGUAGE sql SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select * from admin.waffo_terms(true, p_user_id, p_product_id, p_payment_id, p_order_id, p_amount_total, p_currency, p_amount_tax, p_method); $$;

revoke all on function public.settle_waffo_order_v2("uuid", "text", "text", "text", integer, "text", integer, "text") from public, anon, authenticated;
grant execute on function public.settle_waffo_order_v2("uuid", "text", "text", "text", integer, "text", integer, "text") to service_role;
