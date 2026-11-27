-- Org owner and member functions (ARCHITECTURE §6.5). p_owner / p_user is always the signed-in
-- account from the server session, never an id from the request body. Only the service role may
-- call them. Lock order everywhere: the org row, then the profile row, then the member row. A
-- debit of the paid pool (reserve_credits, a clawback, an admin adjustment) locks the profile and
-- then, through the 1629 trigger, the member row: the same order, so the two never wait on each
-- other in a cycle. The org row is always locked FOR NO KEY UPDATE (no org function changes
-- orgs.id): the trigger's inserts into org_held_draws / org_pool_returns take FOR KEY SHARE on
-- the org row through their foreign key while holding the profile, and KEY SHARE does not wait
-- on NO KEY UPDATE, so that is not a profile → org wait. Every pool movement carries a request_id: a repeat does nothing, a different
-- request under the same id is IDEMPOTENCY_CONFLICT. Ids starting with `org_topup:` (the monthly
-- top-up) or `org_return:` (refunds after leaving, 1629) are reserved and refused here. Every
-- function that locks the org row first settles its queued returns (_org_settle_returns, 1629).

-- The org p_owner owns, locked. Anyone else (a member, a stranger) is NOT_ORG_OWNER. A
-- suspended org refuses pool actions; removing a member still works (it only gives credits back).
create or replace function public._org_lock_owned(p_owner uuid, p_allow_suspended boolean) returns public.orgs
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  select * into o from public.orgs where owner_user_id = p_owner for no key update;
  if not found then raise exception 'NOT_ORG_OWNER'; end if;
  if public._org_settle_returns(o.id) > 0 then select * into o from public.orgs where id = o.id; end if;
  if o.status <> 'active' and not p_allow_suspended then raise exception 'ORG_SUSPENDED'; end if;
  return o;
end;
$$;
revoke all on function public._org_lock_owned(uuid, boolean) from public, anon, authenticated, service_role;

-- A replay of p_request: the same movement returns true, anything else under that id raises.
-- p_delta null accepts any amount (a reclaim takes back whatever was there at the time).
create or replace function public._org_replayed(p_request text, p_org uuid, p_kind text, p_delta bigint, p_member uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare prior public.org_credit_ledger;
begin
  if p_request is null or length(p_request) not between 1 and 200 or starts_with(p_request, 'org_topup:') or starts_with(p_request, 'org_return:') then
    raise exception 'INVALID_INPUT';
  end if;
  select * into prior from public.org_credit_ledger where request_id = p_request;
  if not found then return false; end if;
  if prior.org_id <> p_org or prior.kind <> p_kind or prior.delta <> coalesce(p_delta, prior.delta) or prior.member_user_id is distinct from p_member then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;
  return true;
end;
$$;
revoke all on function public._org_replayed(text, uuid, text, bigint, uuid) from public, anon, authenticated, service_role;

-- Move p_amount from the (locked) org's pool into an active member's paid pool. held_credits is
-- kept at most credits by the 1629 trigger (the org's credits are spent first); least() here is
-- only a guard. Then it is raised by the amount. Shared by org_allocate and org_monthly_topup.
create or replace function public._org_allocate(p_org public.orgs, p_member uuid, p_amount integer, p_request text, p_actor uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  m public.org_members;
  change public.credit_change;
  pool bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.profiles where id = p_member for update;
  select * into m from public.org_members where org_id = p_org.id and user_id = p_member and status = 'active' for update;
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  if p_org.pool_credits < p_amount then raise exception 'ORG_POOL_INSUFFICIENT'; end if;
  change := public._apply_credit_change(p_member, 'paid', 'org_allocate', p_amount, 'org:' || p_org.id::text, 'org:' || p_request);
  update public.org_members set held_credits = least(held_credits, change.credits - p_amount) + p_amount
    where org_id = p_org.id and user_id = p_member returning held_credits into m.held_credits;
  update public.orgs set pool_credits = pool_credits - p_amount, updated_at = now() where id = p_org.id returning pool_credits into pool;
  insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, actor)
    values (p_org.id, 'allocate', -p_amount, pool, p_member, p_request, p_actor);
  return m.held_credits;
end;
$$;
revoke all on function public._org_allocate(public.orgs, uuid, integer, text, uuid) from public, anon, authenticated, service_role;

-- Take an active member out of the (locked) org: the org's share of their credits,
-- held_credits (never above credits, see 1629), goes back to the pool and the row is marked removed. The member's
-- own purchases stay with them. Returns what was taken back.
create or replace function public._org_release(p_org public.orgs, p_member uuid, p_request text, p_actor uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  m public.org_members;
  credits integer;
  back integer;
  pool bigint;
begin
  select p.credits into credits from public.profiles p where p.id = p_member for update;
  select * into m from public.org_members where org_id = p_org.id and user_id = p_member and status = 'active' for update;
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  if m.role = 'owner' then raise exception 'ORG_OWNER_CANNOT_LEAVE'; end if;
  back := least(m.held_credits, coalesce(credits, 0));
  if back > 0 then
    perform public._apply_credit_change(p_member, 'paid', 'org_reclaim', -back, 'org:' || p_org.id::text, 'org:' || p_request);
    update public.orgs set pool_credits = pool_credits + back, updated_at = now() where id = p_org.id returning pool_credits into pool;
    insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, actor)
      values (p_org.id, 'reclaim', back, pool, p_member, p_request, p_actor);
  end if;
  update public.org_members set status = 'removed', removed_at = now(), held_credits = 0
    where org_id = p_org.id and user_id = p_member;
  return back;
end;
$$;
revoke all on function public._org_release(public.orgs, uuid, text, uuid) from public, anon, authenticated, service_role;

-- Join the org behind an invite link. Joining the org one is already in returns it again; being
-- in another org is ORG_MEMBER_EXISTS. A suspended org takes no one.
create or replace function public.org_join(p_user uuid, p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  current_org uuid;
begin
  if p_user is null or p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'ORG_INVITE_INVALID'; end if;
  select * into o from public.orgs where invite_token = p_token for no key update;
  if not found then raise exception 'ORG_INVITE_INVALID'; end if;
  if o.status <> 'active' then raise exception 'ORG_SUSPENDED'; end if;
  perform 1 from public.profiles where id = p_user and banned_at is null;
  if not found then raise exception 'USER_BANNED'; end if;
  select org_id into current_org from public.org_members where user_id = p_user and status = 'active';
  if current_org = o.id then return o.id; end if;
  if current_org is not null then raise exception 'ORG_MEMBER_EXISTS'; end if;
  insert into public.org_members(org_id, user_id, role) values (o.id, p_user, 'member')
    on conflict (org_id, user_id) do update set status = 'active', removed_at = null, joined_at = now(),
      monthly_allowance = 0, held_credits = 0;
  return o.id;
end;
$$;
revoke all on function public.org_join(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_join(uuid, text) to service_role;

-- A member leaves; the org's share of their credits goes back to the pool. The owner cannot
-- leave their own org. Leaving when not in an org (or a repeat) is a no-op returning 0.
create or replace function public.org_leave(p_user uuid, p_request_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_org uuid;
begin
  select m.org_id into v_org from public.org_members m where m.user_id = p_user and m.status = 'active';
  if v_org is null then return 0; end if;
  select * into o from public.orgs where id = v_org for no key update;
  perform public._org_settle_returns(o.id);
  if not exists(select from public.org_members m where m.org_id = o.id and m.user_id = p_user and m.status = 'active') then
    return 0;
  end if;
  if public._org_replayed(p_request_id, o.id, 'reclaim', null, p_user) then return 0; end if;
  return public._org_release(o, p_user, p_request_id, p_user);
end;
$$;
revoke all on function public.org_leave(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_leave(uuid, text) to service_role;

-- The owner removes a member (never themselves). A repeat after the member is gone is a no-op.
create or replace function public.org_remove_member(p_owner uuid, p_member uuid, p_request_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  o := public._org_lock_owned(p_owner, true);
  if public._org_replayed(p_request_id, o.id, 'reclaim', null, p_member) then return 0; end if;
  if p_member = p_owner then raise exception 'ORG_OWNER_CANNOT_LEAVE'; end if;
  if not exists(select from public.org_members where org_id = o.id and user_id = p_member and status = 'active') then
    if exists(select from public.org_members where org_id = o.id and user_id = p_member) then return 0; end if;
    raise exception 'ORG_MEMBER_NOT_FOUND';
  end if;
  return public._org_release(o, p_member, p_request_id, p_owner);
end;
$$;
revoke all on function public.org_remove_member(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.org_remove_member(uuid, uuid, text) to service_role;

-- The owner moves pool credits to a member (themselves included) right now. Returns the pool
-- left and the member's org-held credits.
create or replace function public.org_allocate(p_owner uuid, p_member uuid, p_amount integer, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  held integer;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  if public._org_replayed(p_request_id, o.id, 'allocate', -p_amount, p_member) then
    return jsonb_build_object('applied', false, 'pool_credits', o.pool_credits);
  end if;
  held := public._org_allocate(o, p_member, p_amount, p_request_id, p_owner);
  return jsonb_build_object('applied', true, 'pool_credits', o.pool_credits - p_amount, 'held_credits', held);
end;
$$;
revoke all on function public.org_allocate(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.org_allocate(uuid, uuid, integer, text) to service_role;

-- The owner sets a member's monthly allowance (the level org_monthly_topup tops them up to);
-- returns it.
create or replace function public.org_set_allowance(p_owner uuid, p_member uuid, p_allowance integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  if p_allowance is null or p_allowance not between 0 and 1000000000 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  update public.org_members set monthly_allowance = p_allowance
    where org_id = o.id and user_id = p_member and status = 'active';
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  return p_allowance;
end;
$$;
revoke all on function public.org_set_allowance(uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.org_set_allowance(uuid, uuid, integer) to service_role;

-- The owner puts their own paid credits into the pool. Only credits that are theirs count:
-- credits minus the org-held share (min(held, credits)). Pool credits are never refunded.
create or replace function public.org_deposit(p_owner uuid, p_amount integer, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  m public.org_members;
  credits integer;
  pool bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  if public._org_replayed(p_request_id, o.id, 'owner_deposit', p_amount, p_owner) then
    return jsonb_build_object('applied', false, 'pool_credits', o.pool_credits);
  end if;
  select p.credits into credits from public.profiles p where p.id = p_owner for update;
  select * into m from public.org_members where org_id = o.id and user_id = p_owner and status = 'active' for update;
  if coalesce(credits, 0) - least(coalesce(m.held_credits, 0), coalesce(credits, 0)) < p_amount then
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  perform public._apply_credit_change(p_owner, 'paid', 'org_deposit', -p_amount, 'org:' || o.id::text, 'org:' || p_request_id);
  update public.orgs set pool_credits = pool_credits + p_amount, updated_at = now() where id = o.id returning pool_credits into pool;
  insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, actor)
    values (o.id, 'owner_deposit', p_amount, pool, p_owner, p_request_id, p_owner);
  return jsonb_build_object('applied', true, 'pool_credits', pool);
end;
$$;
revoke all on function public.org_deposit(uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.org_deposit(uuid, integer, text) to service_role;
