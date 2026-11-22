-- Owner and member functions of the enterprise promotion pool (ARCHITECTURE §6.5 企业推广积分池). As
-- the paid-pool functions (1627): p_owner / p_caller always come from the server session, only the
-- service role may call them, a non-owner gets NOT_ORG_OWNER, a suspended org ORG_SUSPENDED.

-- One-off grant of promotion credits to a member: {applied, promo_pool_credits, held_promo_credits?}.
-- request_id as for org_allocate (a repeat with the same id does nothing; another request under
-- that id is IDEMPOTENCY_CONFLICT). ORG_POOL_INSUFFICIENT when the promo pool is short.
create function public.org_allocate_promo(p_owner uuid, p_member uuid, p_amount integer, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  held integer;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  if public._org_replayed(p_request_id, o.id, 'promo_allocate', -p_amount, p_member) then
    return jsonb_build_object('applied', false, 'promo_pool_credits', o.promo_pool_credits);
  end if;
  held := public._org_allocate_promo(o.id, p_member, p_amount, p_request_id, p_owner);
  return jsonb_build_object('applied', true, 'promo_pool_credits', o.promo_pool_credits - p_amount, 'held_promo_credits', held);
end;
$$;
revoke all on function public.org_allocate_promo(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.org_allocate_promo(uuid, uuid, integer, text) to service_role;

-- Sets a member's monthly promotion allowance and at once gives what this month's allowance still
-- lacks from the promo pool (promotion credits expire with the month, so waiting for the 1st would
-- lose them). Returns the allowance.
create function public.org_set_promo_allowance(p_owner uuid, p_member uuid, p_allowance integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  if p_allowance is null or p_allowance not between 0 and 1000000000 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  -- Lock order org -> profile -> member (as reserve_credits and the share trigger take profile ->
  -- member): the hand-out below locks this profile, so take it before the member row.
  perform 1 from public.profiles where id = p_member for update;
  update public.org_members set promo_allowance = p_allowance
   where org_id = o.id and user_id = p_member and status = 'active';
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  perform public._org_promo_topup(o.id);
  return p_allowance;
end;
$$;
revoke all on function public.org_set_promo_allowance(uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.org_set_promo_allowance(uuid, uuid, integer) to service_role;

-- The owner's monthly view of both pools for a UTC month: what came in, went out to members, came
-- back and (promo) expired. The promotion month's expiry is booked just after it ends, so it is
-- found by its key (org_promo_expire:<month>:...) rather than its date. Read only; also returns the
-- live balances: {paid: {balance, in, allocated, reclaimed, adjusted}, promo: {balance, expires_at,
-- granted, allocated, reclaimed, expired, held}}.
create function public.org_pool_month(p_owner uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' set "TimeZone" = 'UTC' as $$
declare
  o public.orgs;
  v_start timestamptz;
  v_end timestamptz;
  v_paid jsonb;
  v_promo jsonb;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  select * into o from public.orgs where owner_user_id = p_owner;
  if not found then raise exception 'NOT_ORG_OWNER'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';
  select jsonb_build_object(
      'balance', o.pool_credits,
      'in', coalesce(sum(l.delta) filter (where l.kind in ('bank_grant', 'owner_deposit')), 0),
      'allocated', coalesce(-sum(l.delta) filter (where l.kind = 'allocate'), 0),
      'reclaimed', coalesce(sum(l.delta) filter (where l.kind = 'reclaim'), 0),
      'adjusted', coalesce(sum(l.delta) filter (where l.kind = 'admin_adjust'), 0))
    into v_paid
    from public.org_credit_ledger l where l.org_id = o.id and l.created_at >= v_start and l.created_at < v_end;
  select jsonb_build_object(
      'balance', case when o.promo_expires_at > now() then o.promo_pool_credits else 0 end,
      'expires_at', case when o.promo_expires_at > now() then o.promo_expires_at end,
      'granted', coalesce(sum(l.delta) filter (where l.kind = 'promo_grant' and l.created_at >= v_start and l.created_at < v_end), 0),
      'allocated', coalesce(-sum(l.delta) filter (where l.kind = 'promo_allocate' and l.created_at >= v_start and l.created_at < v_end), 0),
      'reclaimed', coalesce(sum(l.delta) filter (where l.kind = 'promo_reclaim' and l.created_at >= v_start and l.created_at < v_end), 0),
      'expired', coalesce(-sum(l.delta) filter (where l.kind = 'promo_expire' and l.request_id like 'org_promo_expire:' || p_period || ':%'), 0)
        + coalesce((select -sum(c.delta) from public.credit_ledger c
                     where c.kind = 'org_promo_expire' and c.idempotency_key like 'org_promo_expire:' || p_period || ':' || o.id::text || ':%'), 0),
      'held', case when o.promo_expires_at > now() then
        coalesce((select sum(least(m.held_promo_credits, p.free_credits)) from public.org_members m join public.profiles p on p.id = m.user_id
                   where m.org_id = o.id and m.status = 'active'), 0) else 0 end)
    into v_promo
    from public.org_credit_ledger l
   where l.org_id = o.id and l.kind like 'promo_%' and l.created_at >= v_start and l.created_at < v_end + interval '8 days';
  return jsonb_build_object('period', p_period, 'paid', v_paid, 'promo', v_promo);
end;
$$;
revoke all on function public.org_pool_month(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_pool_month(uuid, text) to service_role;

-- Promotion credits per member for a UTC month: allocated (promo_allocate rows, allowance and
-- one-off) and used (net of refunds: org_promo_draws of that month, drawn - restored), plus the
-- member's allowance and what the org holds now. Who may read: the org's owner (every member) or an
-- active member (only their own row); anyone else NOT_ORG_MEMBER, as org_member_stats.
create function public.org_member_promo_stats(p_caller uuid, p_org_id uuid, p_period text)
returns table(member_user_id uuid, promo_allowance integer, held_promo integer, promo_allocated bigint, promo_used bigint)
language plpgsql stable security definer set search_path = '' set "TimeZone" = 'UTC' as $$
#variable_conflict use_column
declare
  v_owner boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_live boolean;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  select o.owner_user_id = p_caller, coalesce(o.promo_expires_at > now(), false) into v_owner, v_live
    from public.orgs o where o.id = p_org_id;
  if v_owner is distinct from true and not exists(
    select from public.org_members m where m.org_id = p_org_id and m.user_id = p_caller and m.status = 'active'
  ) then raise exception 'NOT_ORG_MEMBER'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';
  return query
  select m.user_id, m.promo_allowance,
         case when v_live then least(m.held_promo_credits, p.free_credits) else 0 end,
         coalesce((select -sum(l.delta) from public.org_credit_ledger l
                    where l.org_id = p_org_id and l.member_user_id = m.user_id and l.kind = 'promo_allocate'
                      and l.created_at >= v_start and l.created_at < v_end), 0)::bigint,
         coalesce((select sum(d.drawn - d.restored) from public.org_promo_draws d
                    where d.org_id = p_org_id and d.user_id = m.user_id and d.period = p_period), 0)::bigint
    from public.org_members m join public.profiles p on p.id = m.user_id
   where m.org_id = p_org_id and m.status = 'active' and (coalesce(v_owner, false) or m.user_id = p_caller)
   order by m.joined_at, m.user_id;
end;
$$;
revoke all on function public.org_member_promo_stats(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_member_promo_stats(uuid, uuid, text) to service_role;
