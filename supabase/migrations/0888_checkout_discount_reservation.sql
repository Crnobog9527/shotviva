-- Reserve briefly before building Stripe's request. No network request may be sent until
-- prepare_checkout_discount durably fixes the absolute expires_at and Stripe idempotency key.
create function public.reserve_checkout_discount(p_user uuid, p_product_id text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_discount jsonb;
  v_token uuid;
  v_deadline timestamptz;
  v_now timestamptz;
  v_prepared boolean;
begin
  if p_token is null then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.profiles where id = p_user and banned_at is null for no key update;
  if not found then raise exception 'CODE_CHECKOUT_FORBIDDEN'; end if;
  v_discount := public.checkout_discount(p_user, p_product_id);
  if v_discount is null then return null; end if;

  select checkout_token, checkout_expires_at, checkout_prepared into v_token, v_deadline, v_prepared
    from public.code_redemptions where id = (v_discount->>'redemption_id')::uuid;
  v_now := clock_timestamp();
  if v_deadline > v_now and v_token <> p_token then
    return jsonb_build_object('status', 'in_use', 'expires_at', extract(epoch from v_deadline)::bigint);
  end if;
  if v_token = p_token and v_deadline <= v_now then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_token is distinct from p_token then
    -- A crash before preparing a request cannot strand the discount for 30 minutes.
    v_deadline := to_timestamp(ceil(extract(epoch from v_now))) + interval '60 seconds';
    v_prepared := false;
    update public.code_redemptions set checkout_token = p_token, checkout_expires_at = v_deadline, checkout_prepared = false
      where id = (v_discount->>'redemption_id')::uuid;
  end if;
  return v_discount || jsonb_build_object('status', 'reserved', 'prepared', v_prepared, 'expires_at', extract(epoch from v_deadline)::bigint);
end;
$$;

-- The server chooses a whole-second deadline close to 30 minutes, allowing a small
-- transport margin for Stripe's 30-minute minimum. Read the returned value on every retry:
-- once fixed it is immutable, even if create timed out and its outcome is unknown.
create function public.prepare_checkout_discount(p_user uuid, p_token uuid, p_expires_at bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim record;
  v_now timestamptz;
  v_min bigint;
begin
  perform 1 from public.profiles where id = p_user and banned_at is null for no key update;
  if not found then raise exception 'CODE_CHECKOUT_FORBIDDEN'; end if;
  select id, checkout_expires_at, checkout_prepared into v_claim
    from public.code_redemptions where user_id = p_user and checkout_token = p_token
      and discount_used_payment_id is null and discount_void_at is null;
  v_now := clock_timestamp();
  if not found or v_claim.checkout_expires_at <= v_now then return jsonb_build_object('status', 'expired'); end if;
  if not v_claim.checkout_prepared then
    -- Never let a caller turn this into a multi-hour coupon hold.
    v_min := ceil(extract(epoch from v_now))::bigint + 1800;
    if p_expires_at is null or p_expires_at not between v_min and v_min + 10 then
      raise exception 'INVALID_CHECKOUT_DEADLINE';
    end if;
    v_claim.checkout_expires_at := to_timestamp(p_expires_at);
    update public.code_redemptions set checkout_prepared = true, checkout_expires_at = v_claim.checkout_expires_at
      where id = v_claim.id;
  end if;
  return jsonb_build_object('status', 'prepared', 'expires_at', extract(epoch from v_claim.checkout_expires_at)::bigint);
end;
$$;

-- Only call after Stripe confirms the session is closed, or definitively rejected create.
create function public.release_checkout_discount(p_user uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = p_user for no key update;
  update public.code_redemptions set checkout_token = null, checkout_expires_at = null, checkout_prepared = false
   where user_id = p_user and discount_used_payment_id is null and discount_void_at is null
     and checkout_token = p_token;
  return found;
end;
$$;

revoke all on function public.reserve_checkout_discount(uuid, text, uuid),
                       public.prepare_checkout_discount(uuid, uuid, bigint), public.release_checkout_discount(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_checkout_discount(uuid, text, uuid),
                          public.prepare_checkout_discount(uuid, uuid, bigint), public.release_checkout_discount(uuid, uuid) to service_role;
