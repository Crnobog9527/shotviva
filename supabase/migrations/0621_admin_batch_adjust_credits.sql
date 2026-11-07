-- T77: adjust the credits of up to 50 selected users at once (ARCHITECTURE §10.a 「批量操作」).
-- One call, one transaction: the same pool, amount and reason for everyone, one 「后台调整」
-- ledger row per user, exactly like admin_adjust_credits does for one.
--
-- All or nothing: before anything is written, every user is locked (in id order, so two batches
-- over the same users queue instead of deadlocking) and checked. A missing account raises
-- PROFILE_NOT_FOUND and a pool that would go below zero raises CREDITS_INSUFFICIENT, each with the
-- offending user ids, comma-separated, in the error detail so the page can name them.
--
-- Idempotent per batch: the dialog sends one key per opening; each user's ledger row is keyed
-- admin_batch:<key>:<user id> (credit_ledger.idempotency_key is unique), so submitting the same
-- batch again writes nothing. The same key with a different pool or amount is a conflict.
--
-- Who did it: p_actor is the signed-in admin. It is checked here as well (NOT_ADMIN unless that
-- profile's role is admin), and every ledger row's reason ends with 「· 操作人 <actor id>」.

create function public.admin_batch_adjust_credits(
  p_actor uuid,
  p_user_ids uuid[],
  p_pool text,
  p_amount integer,
  p_reason text,
  p_batch_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ids uuid[];
  v_bad uuid[];
  v_id uuid;
  v_applied integer := 0;
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_pool is null or p_pool not in ('free', 'paid') then
    raise exception 'INVALID_INPUT' using detail = 'pool must be free or paid';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be a non-zero integer up to 100000';
  end if;
  if length(v_reason) = 0 or length(v_reason) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'reason is required, at most 500 characters';
  end if;
  if p_batch_key is null or length(p_batch_key) = 0 or length(p_batch_key) > 64 then
    raise exception 'INVALID_INPUT' using detail = 'batch key is required';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 or cardinality(p_user_ids) > 50
     or array_position(p_user_ids, null) is not null then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 50 users';
  end if;

  select array_agg(distinct i order by i) into v_ids from unnest(p_user_ids) as i;
  if cardinality(v_ids) <> cardinality(p_user_ids) then
    raise exception 'INVALID_INPUT' using detail = 'a user is listed twice';
  end if;

  perform 1 from public.profiles where id = any(v_ids) order by id for update;

  select array_agg(i order by i) into v_bad
    from unnest(v_ids) as i
   where not exists (select 1 from public.profiles p where p.id = i);
  if v_bad is not null then
    raise exception 'PROFILE_NOT_FOUND' using detail = array_to_string(v_bad, ',');
  end if;

  if exists (
    select 1
      from unnest(v_ids) as i
      join public.credit_ledger l on l.idempotency_key = 'admin_batch:' || p_batch_key || ':' || i::text
     where l.user_id <> i or l.kind <> 'admin_adjust' or l.pool <> p_pool or l.delta <> p_amount
  ) then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  -- Users this batch already adjusted are skipped, so a resubmit never trips over the balance
  -- its own first run produced.
  select array_agg(p.id order by p.id) into v_bad
    from public.profiles p
   where p.id = any(v_ids)
     and not exists (
       select 1 from public.credit_ledger l
        where l.idempotency_key = 'admin_batch:' || p_batch_key || ':' || p.id::text
     )
     and (case when p_pool = 'paid' then p.credits else p.free_credits end) + p_amount < 0;
  if v_bad is not null then
    raise exception 'CREDITS_INSUFFICIENT' using detail = array_to_string(v_bad, ',');
  end if;

  foreach v_id in array v_ids loop
    if (public._apply_credit_change(
          v_id, p_pool, 'admin_adjust', p_amount, v_reason || ' · 操作人 ' || p_actor::text,
          'admin_batch:' || p_batch_key || ':' || v_id::text
        )).applied then
      v_applied := v_applied + 1;
    end if;
  end loop;

  return jsonb_build_object('applied', v_applied, 'repeated', cardinality(v_ids) - v_applied);
end;
$$;

revoke execute on function public.admin_batch_adjust_credits(uuid, uuid[], text, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_batch_adjust_credits(uuid, uuid[], text, integer, text, text) to service_role;
