-- The provider reference chooses the entitlement. Seed contracts keep their original wallet
-- conversion; phase-two identities can settle only through their exact authenticated receipt.
create function admin.catalog_settlement_product(p_v2 boolean,p_user uuid,p_product text,p_event text)
returns public.products language plpgsql set search_path='' as $$
declare
  identity public.products;
  locked admin.catalog_checkout_attempts;
  active_v2 boolean := exists(select from public.system_settings where key='pricing_catalog_version' and value='"v2"');
begin
  if p_v2 and not active_v2 and not exists(select from public.credit_ledger
      where idempotency_key=p_event and user_id=p_user and product_id=p_product) then
    raise exception 'PRICING_VERSION_RECONCILIATION_REQUIRED';
  end if;
  select * into identity from public.products where id=p_product;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  select a.* into locked from admin.catalog_receipts r join admin.catalog_checkout_attempts a on a.token=r.token
    where r.event_key=p_event;
  if found then
    if not p_v2 or (locked.product_id,locked.user_id) is distinct from (p_product,p_user) then
      raise exception 'CATALOG_RECEIPT_MISMATCH'; end if;
    identity.credits := locked.credits;
    identity.days := locked.paid_days;
    update admin.catalog_checkout_attempts set settled_at=now() where token=locked.token and settled_at is null;
  elsif not identity.active then
    raise exception 'PRODUCT_NOT_FOUND';
  elsif p_v2 or active_v2 then
    select t.credits into strict identity.credits from admin.product_terms_v2 t where t.product_id=p_product;
  end if;
  return identity;
end $$;
revoke all on function admin.catalog_settlement_product(boolean,uuid,text,text) from public,anon,authenticated,service_role;

-- New signed purchases/renewals grant frozen entitlements. Legacy contracts keep the original wallet conversion.
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
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'event_id is required';
  end if;

  v_product := admin.catalog_settlement_product(p_v2,p_user_id,p_product_id,v_key);

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
         and admin.catalog_membership_rank(product_id)>0
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
     or admin.catalog_membership_rank(v_product.id) <= admin.catalog_membership_rank(v_held) then
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

CREATE OR REPLACE FUNCTION admin.renewal_terms(p_v2 boolean, "p_user_id" "uuid", "p_product_id" "text", "p_invoice_id" "text", "p_period_end" timestamp with time zone, "p_amount_total" integer, "p_currency" "text", "p_amount_tax" integer, "p_method" "text", "p_charge_id" "text" DEFAULT NULL::"text") RETURNS "public"."credit_change"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_product public.products;
  v_change public.credit_change;
  v_key text := 'renewal:' || p_invoice_id;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
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
  v_product := admin.catalog_settlement_product(p_v2,p_user_id,p_product_id,v_key);
  if v_product.days is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

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
