-- T14: balance functions with two pools (ARCHITECTURE §6.1). Replaces 0023 / 0025.
-- Signatures change (a pool argument, a wider return type), so the old ones are dropped
-- rather than replaced; reserve_credits / refund_job are recreated in 0142.
--
-- is_paid() is dropped: paid_until no longer decides watermark, visibility or commercial
-- use (each work's credit_pool does), and nothing else read it.

drop function public.apply_purchase(uuid, text, text);
drop function public.grant_credits(uuid, integer, text, text);
drop function public.admin_adjust_credits(uuid, integer, text, text);
drop function public.is_paid(uuid);
drop function public._apply_credit_change(uuid, text, integer, text, text, uuid, text, integer);
drop type public.credit_change;

-- Both balances after a change, so callers never need a second read.
create type public.credit_change as (
  applied boolean,
  credits integer,
  free_credits integer,
  paid_until timestamptz
);

-- Single choke point for every ledger write: locks the profile row (so concurrent changes
-- for one user queue up), replays an existing idempotency key as a no-op, refuses to take
-- the chosen pool below zero, then updates that pool and records the ledger row in the same
-- transaction. p_paid_days null leaves paid_until untouched (never "+0 days").
create function public._apply_credit_change(
  p_user_id uuid,
  p_pool text,
  p_kind text,
  p_delta integer,
  p_reason text,
  p_idempotency_key text,
  p_job_id uuid default null,
  p_product_id text default null,
  p_paid_days integer default null
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_existing public.credit_ledger;
  v_result public.credit_change;
  v_paid boolean := p_pool = 'paid';
begin
  if p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'idempotency key is required';
  end if;
  if p_pool is null or p_pool not in ('free', 'paid') then
    raise exception 'INVALID_INPUT' using detail = 'pool must be free or paid';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select * into v_existing from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.kind <> p_kind
      or v_existing.pool <> p_pool
      or v_existing.product_id is distinct from p_product_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    v_result := row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until);
    return v_result;
  end if;

  if (case when v_paid then v_profile.credits else v_profile.free_credits end) + p_delta < 0 then
    raise exception 'CREDITS_INSUFFICIENT';
  end if;

  update public.profiles
     set credits = credits + case when v_paid then p_delta else 0 end,
         free_credits = free_credits + case when v_paid then 0 else p_delta end,
         -- greatest() skips nulls: an expired or empty window restarts from now.
         paid_until = case
           when p_paid_days is null then paid_until
           else greatest(paid_until, now()) + make_interval(days => p_paid_days)
         end
   where id = p_user_id
  returning credits, free_credits, paid_until
       into v_result.credits, v_result.free_credits, v_result.paid_until;

  insert into public.credit_ledger
    (user_id, pool, kind, delta, balance_after, paid_until_after, reason, idempotency_key, job_id, product_id)
  values
    (p_user_id, p_pool, p_kind, p_delta,
     case when v_paid then v_result.credits else v_result.free_credits end,
     case when p_paid_days is null then null else v_result.paid_until end,
     p_reason, p_idempotency_key, p_job_id, p_product_id);

  v_result.applied := true;
  return v_result;
end;
$$;

revoke execute on function public._apply_credit_change(uuid, text, text, integer, text, text, uuid, text, integer)
  from public, anon, authenticated, service_role;

-- One-off grants. The signup bonus (T1, key 'signup:{user_id}') and promos use 'free';
-- the pool is required so a grant can never land in the wrong pool by default.
create function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_pool text
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be positive';
  end if;
  return public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;

-- Manual adjustments from the SQL editor (ARCHITECTURE §10), e.g. compensation ('paid') or
-- clawing back an abused gift ('free'). The key is optional so an operator can run it by
-- hand; pass one when a script might retry.
create function public.admin_adjust_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_pool text,
  p_idempotency_key text default null
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be non-zero';
  end if;
  return public._apply_credit_change(
    p_user_id, p_pool, 'admin_adjust', p_amount, p_reason,
    coalesce(p_idempotency_key, 'admin:' || gen_random_uuid()::text)
  );
end;
$$;

-- Settles one paid purchase into the paid pool. A product with days also extends
-- paid_until = max(paid_until, now()) + days; a pack (days null) leaves it untouched.
-- Idempotent by the payment channel's event id, so a redelivered webhook is a no-op.
create function public.apply_purchase(p_user_id uuid, p_product_id text, p_event_id text)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'event_id is required';
  end if;

  select * into v_product from public.products where id = p_product_id and active;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  return public._apply_credit_change(
    p_user_id, 'paid', 'purchase', v_product.credits, 'purchase ' || v_product.id,
    'purchase:' || p_event_id, null, v_product.id, v_product.days
  );
end;
$$;

revoke execute on function public.grant_credits(uuid, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_credits(uuid, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.apply_purchase(uuid, text, text) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.admin_adjust_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.apply_purchase(uuid, text, text) to service_role;
