-- Baseline (T15): credits, ledger and products (ARCHITECTURE §6.1, §6.2, AGENTS §5).
-- Balances change only through the functions below; only service_role may call the public
-- ones, the browser and the anon/authenticated roles never touch balances.

-- Every change to profiles.credits / free_credits / paid_until is recorded here. The unique
-- idempotency key is what makes grants, reserves, refunds and purchases settle at most once.
-- pool is which pool the row moved; balance_after is that pool's balance after the change.
-- Private: no client role can read or write it.
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('grant', 'reserve', 'refund', 'purchase', 'admin_adjust')),
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  paid_until_after timestamptz,
  reason text not null check (length(reason) > 0),
  idempotency_key text not null unique,
  job_id uuid,
  product_id text,
  created_at timestamptz not null default now(),
  -- No default: every writer must say which pool it moved.
  pool text not null check (pool in ('free', 'paid'))
);

create index credit_ledger_user_id_created_at_idx on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

revoke all on public.credit_ledger from anon, authenticated;
-- Server-side reads only (support, debugging); writes go through SQL functions.
grant select on public.credit_ledger to service_role;

-- One-time SKUs. Only what apply_purchase needs to settle a purchase lives here; public
-- prices are read from site.config.ts. A product with days extends paid_until; a pack
-- (days null) only adds paid credits. price_usd stays 0 until pricing is final.
create table public.products (
  id text primary key check (id in ('pass', 'pack')),
  credits integer not null check (credits > 0),
  days integer check (days > 0),
  price_usd numeric(10, 2) not null default 0 check (price_usd >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

revoke all on public.products from anon, authenticated;
-- Server-side reads only (support, debugging); writes go through SQL functions.
grant select on public.products to service_role;

insert into public.products (id, credits, days, price_usd) values
  ('pass', 30, 30, 0),
  ('pack', 120, null, 0);

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

-- One-off grants. The signup bonus (key 'signup:{user_id}') and promos use 'free'; the pool
-- is required so a grant can never land in the wrong pool by default.
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
