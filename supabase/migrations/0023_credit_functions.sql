-- Balance-changing functions (ARCHITECTURE §6.1, AGENTS §5). Only service_role may call
-- the public ones; the browser and the anon/authenticated roles never touch balances.

create type public.credit_change as (
  applied boolean,
  balance integer,
  paid_until timestamptz
);

-- Single choke point for every ledger write: locks the profile row (so concurrent changes
-- for one user queue up), replays an existing idempotency key as a no-op, refuses to go
-- below zero, then updates the balance and records the ledger row in the same transaction.
create function public._apply_credit_change(
  p_user_id uuid,
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
begin
  if p_idempotency_key is null or length(p_idempotency_key) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'idempotency key is required';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select * into v_existing from public.credit_ledger where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.kind <> p_kind
      or v_existing.product_id is distinct from p_product_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    v_result := row(false, v_profile.credits, v_profile.paid_until);
    return v_result;
  end if;

  if v_profile.credits + p_delta < 0 then
    raise exception 'CREDITS_INSUFFICIENT';
  end if;

  update public.profiles
     set credits = credits + p_delta,
         -- greatest() skips nulls: an expired or empty window restarts from now.
         paid_until = case
           when p_paid_days is null then paid_until
           else greatest(paid_until, now()) + make_interval(days => p_paid_days)
         end
   where id = p_user_id
  returning credits, paid_until into v_result.balance, v_result.paid_until;

  insert into public.credit_ledger
    (user_id, kind, delta, balance_after, paid_until_after, reason, idempotency_key, job_id, product_id)
  values
    (p_user_id, p_kind, p_delta, v_result.balance,
     case when p_paid_days is null then null else v_result.paid_until end,
     p_reason, p_idempotency_key, p_job_id, p_product_id);

  v_result.applied := true;
  return v_result;
end;
$$;

revoke execute on function public._apply_credit_change(uuid, text, integer, text, text, uuid, text, integer)
  from public, anon, authenticated, service_role;

-- Signup bonus (T1 calls it with key 'signup:{user_id}') and any other one-off grant.
create function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text
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
  return public._apply_credit_change(p_user_id, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;

-- Manual adjustments from the SQL editor (ARCHITECTURE §10). The key is optional so an
-- operator can run it by hand; pass one when a script might retry.
create function public.admin_adjust_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
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
    p_user_id, 'admin_adjust', p_amount, p_reason,
    coalesce(p_idempotency_key, 'admin:' || gen_random_uuid()::text)
  );
end;
$$;

-- Paid status = paid_until > now() (ARCHITECTURE §6.1). Unknown users are not paid.
create function public.is_paid(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select paid_until > now() from public.profiles where id = p_user_id), false);
$$;

revoke execute on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.is_paid(uuid) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, integer, text, text) to service_role;
grant execute on function public.admin_adjust_credits(uuid, integer, text, text) to service_role;
grant execute on function public.is_paid(uuid) to service_role;
