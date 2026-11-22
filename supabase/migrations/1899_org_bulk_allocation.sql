-- Org default allowances, "use default", and bulk set / bulk give (ARCHITECTURE §6.5 企业推广积分池
-- 「默认额度与批量」, the Owner 2026-11-22). Owner functions take p_owner from the server session,
-- are service_role only, and refuse anyone but the org's owner (NOT_ORG_OWNER) or a suspended org
-- (ORG_SUSPENDED). A bulk action is one transaction under one request id: a repeat does nothing
-- ({applied: false}); every action writes an org_bulk_actions row (who, what, members, total).

-- The allowance in force for a member: their own (personal setting) or the org default. NULL
-- custom: an allowance above 0 is personal, 0 means the default (see 1898).
create function public._org_allowance(p_custom boolean, p_own integer, p_default integer) returns integer
language sql immutable set search_path = '' as $$
  select case when coalesce(p_custom, p_own > 0) then p_own else p_default end;
$$;
revoke all on function public._org_allowance(boolean, integer, integer) from public, anon, authenticated, service_role;

-- A member who leaves and rejoins starts over (1892): also no personal allowance of either kind,
-- so the org defaults apply.
create or replace function public._org_member_rejoin_reset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'removed' and new.status = 'active' then
    new.promo_allowance := 0;
    new.held_promo_credits := 0;
    new.paid_allowance_custom := null;
    new.promo_allowance_custom := null;
  end if;
  return new;
end;
$$;

-- The monthly paid top-up (1628) with the allowance in force (own or default).
create or replace function public.org_monthly_topup(p_period text) returns jsonb
language plpgsql security definer set search_path = '' as $_$
declare
  o public.orgs;
  m record;
  have integer;
  need integer;
  give integer;
  members integer := 0;
  granted bigint := 0;
  short_orgs integer := 0;
  org_short boolean;
  n_members integer;
  org_granted bigint;
  failed jsonb := '[]'::jsonb;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  for o in select * from public.orgs where status = 'active' order by created_at, id loop
  begin
    select * into o from public.orgs where id = o.id and status = 'active' for no key update;
    continue when not found;
    if public._org_settle_returns(o.id) > 0 then select * into o from public.orgs where id = o.id; end if;
    org_short := false;
    n_members := 0;
    org_granted := 0;
    for m in
      select mm.user_id, public._org_allowance(mm.paid_allowance_custom, mm.monthly_allowance, o.default_paid_allowance) as monthly_allowance,
             mm.held_credits, p.credits
        from public.org_members mm join public.profiles p on p.id = mm.user_id
       where mm.org_id = o.id and mm.status = 'active'
         and public._org_allowance(mm.paid_allowance_custom, mm.monthly_allowance, o.default_paid_allowance) > 0
         and not exists(select from public.org_member_topups t where t.org_id = o.id and t.user_id = mm.user_id and t.period = p_period)
       order by mm.joined_at, mm.user_id
    loop
      have := least(m.held_credits, m.credits);
      need := greatest(m.monthly_allowance - have, 0);
      give := least(need, o.pool_credits)::integer;
      if give > 0 then
        perform public._org_allocate(o, m.user_id, give, 'org_topup:' || p_period || ':' || o.id::text || ':' || m.user_id::text, null);
        o.pool_credits := o.pool_credits - give;
        org_granted := org_granted + give;
      end if;
      insert into public.org_member_topups(org_id, user_id, period, granted, short)
        values (o.id, m.user_id, p_period, give, need - give);
      n_members := n_members + 1;
      org_short := org_short or need > give;
    end loop;
    members := members + n_members;
    granted := granted + org_granted;
    if org_short then short_orgs := short_orgs + 1; end if;
  exception when others then
    failed := failed || jsonb_build_array(jsonb_build_object('org_id', o.id, 'error', sqlerrm));
  end;
  end loop;
  return jsonb_build_object('period', p_period, 'members', members, 'granted', granted, 'short_orgs', short_orgs,
    'failed_orgs', failed);
end;
$_$;

-- The promotion allowance hand-out (1892) with the allowance in force (own or default).
create or replace function public._org_promo_topup(p_org uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  m record;
  v_period text := public._utc_period(now());
  v_give integer;
  v_total bigint := 0;
begin
  select * into o from public.orgs where id = p_org;
  if o.status <> 'active' or o.promo_expires_at is null or o.promo_expires_at <= now() then return 0; end if;
  for m in
    select x.user_id, x.allowance, x.granted from (
      select mm.user_id, mm.joined_at, coalesce(t.granted, 0) as granted,
             public._org_allowance(mm.promo_allowance_custom, mm.promo_allowance, o.default_promo_allowance) as allowance
        from public.org_members mm
        left join public.org_member_promo_topups t on t.org_id = mm.org_id and t.user_id = mm.user_id and t.period = v_period
       where mm.org_id = o.id and mm.status = 'active'
    ) x
     where x.allowance > x.granted
     order by x.joined_at, x.user_id
  loop
    select promo_pool_credits into o.promo_pool_credits from public.orgs where id = o.id;
    v_give := least(m.allowance - m.granted, o.promo_pool_credits)::integer;
    if v_give > 0 then
      perform public._org_allocate_promo(o.id, m.user_id, v_give,
        'org_promo_topup:' || v_period || ':' || o.id::text || ':' || m.user_id::text || ':' || m.granted, null);
      v_total := v_total + v_give;
    end if;
    insert into public.org_member_promo_topups as t(org_id, user_id, period, granted, short)
      values (o.id, m.user_id, v_period, m.granted + v_give, m.allowance - m.granted - v_give)
    on conflict (org_id, user_id, period) do update
      set granted = t.granted + v_give, short = greatest(0, m.allowance - t.granted - v_give), updated_at = now();
  end loop;
  return v_total;
end;
$$;

-- Setting one member's allowance makes it personal (it no longer follows the default).
create or replace function public.org_set_allowance(p_owner uuid, p_member uuid, p_allowance integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  if p_allowance is null or p_allowance not between 0 and 1000000000 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  update public.org_members set monthly_allowance = p_allowance, paid_allowance_custom = true
    where org_id = o.id and user_id = p_member and status = 'active';
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  return p_allowance;
end;
$$;

create or replace function public.org_set_promo_allowance(p_owner uuid, p_member uuid, p_allowance integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  if p_allowance is null or p_allowance not between 0 and 1000000000 then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  -- Lock order org -> profile -> member: the hand-out below locks this profile (Codex #836).
  perform 1 from public.profiles where id = p_member for update;
  update public.org_members set promo_allowance = p_allowance, promo_allowance_custom = true
   where org_id = o.id and user_id = p_member and status = 'active';
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  perform public._org_promo_topup(o.id);
  return p_allowance;
end;
$$;

-- The member report (1893) shows the promotion allowance in force.
create or replace function public.org_member_promo_stats(p_caller uuid, p_org_id uuid, p_period text)
returns table(member_user_id uuid, promo_allowance integer, held_promo integer, promo_allocated bigint, promo_used bigint)
language plpgsql stable security definer set search_path = '' set "TimeZone" = 'UTC' as $$
#variable_conflict use_column
declare
  v_owner boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_live boolean;
  v_default integer;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  select o.owner_user_id = p_caller, coalesce(o.promo_expires_at > now(), false), o.default_promo_allowance
    into v_owner, v_live, v_default from public.orgs o where o.id = p_org_id;
  if v_owner is distinct from true and not exists(
    select from public.org_members m where m.org_id = p_org_id and m.user_id = p_caller and m.status = 'active'
  ) then raise exception 'NOT_ORG_MEMBER'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';
  return query
  select m.user_id, public._org_allowance(m.promo_allowance_custom, m.promo_allowance, v_default),
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

-- A bulk request: a repeat of the same request id answers true (nothing to do); the same id for
-- another org or action is IDEMPOTENCY_CONFLICT; system key prefixes are refused like everywhere.
create function public._org_bulk_replayed(p_request text, p_org uuid, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare prior public.org_bulk_actions;
begin
  perform public._org_replayed(p_request, p_org, 'bulk', null, null);
  select * into prior from public.org_bulk_actions where request_id = p_request;
  if not found then return false; end if;
  if prior.org_id <> p_org or prior.action <> p_action then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return true;
end;
$$;
revoke all on function public._org_bulk_replayed(text, uuid, text) from public, anon, authenticated, service_role;

-- The members of a bulk action: 1–200 distinct ids, every one an active member of the org, locked
-- in id order (profile, then member row) so two bulk actions never wait on each other in a cycle.
create function public._org_bulk_members(p_org uuid, p_members jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_found integer;
begin
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) not between 1 and 200 then
    raise exception 'INVALID_INPUT';
  end if;
  select array_agg(distinct x::uuid order by x::uuid) into v_ids from jsonb_array_elements_text(p_members) x;
  if cardinality(v_ids) <> jsonb_array_length(p_members) then raise exception 'INVALID_INPUT'; end if;
  perform from public.profiles where id = any(v_ids) order by id for update;
  select count(*) into v_found from (
    select from public.org_members where org_id = p_org and user_id = any(v_ids) and status = 'active' order by user_id for update
  ) x;
  if v_found <> cardinality(v_ids) then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  return v_ids;
end;
$$;
revoke all on function public._org_bulk_members(uuid, jsonb) from public, anon, authenticated, service_role;

-- One kind's new allowance from a bulk or defaults input: null (key absent) leaves it, 'default'
-- follows the org default, a number 0–1,000,000,000 is personal.
create function public._org_allowance_input(p_value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or p_value = 'null'::jsonb then return null; end if;
  if p_value = '"default"'::jsonb then return p_value; end if;
  if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]{1,10}$' or (p_value #>> '{}')::bigint > 1000000000 then
    raise exception 'INVALID_INPUT';
  end if;
  return p_value;
end;
$$;
revoke all on function public._org_allowance_input(jsonb) from public, anon, authenticated, service_role;

-- The org's default monthly allowances: {paid?, promo?} (each 0–1,000,000,000; absent = unchanged).
-- They apply at once to every member without a personal setting; a new promotion default gives
-- what this month still lacks from the promo pool, as a personal one does. Returns {applied,
-- default_paid_allowance, default_promo_allowance}.
create function public.org_set_default_allowances(p_owner uuid, p_input jsonb, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_paid jsonb;
  v_promo jsonb;
begin
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  v_paid := public._org_allowance_input(p_input->'paid');
  v_promo := public._org_allowance_input(p_input->'promo');
  if (v_paid is null and v_promo is null) or v_paid = '"default"'::jsonb or v_promo = '"default"'::jsonb then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  if public._org_bulk_replayed(p_request_id, o.id, 'set_defaults') then
    return jsonb_build_object('applied', false, 'default_paid_allowance', o.default_paid_allowance, 'default_promo_allowance', o.default_promo_allowance);
  end if;
  update public.orgs set default_paid_allowance = coalesce((v_paid #>> '{}')::integer, default_paid_allowance),
         default_promo_allowance = coalesce((v_promo #>> '{}')::integer, default_promo_allowance), updated_at = now()
   where id = o.id returning * into o;
  insert into public.org_bulk_actions(request_id, org_id, actor, action, members, payload)
    values (p_request_id, o.id, p_owner, 'set_defaults', 0, jsonb_build_object('paid', v_paid, 'promo', v_promo));
  if v_promo is not null then perform public._org_promo_topup(o.id); end if;
  return jsonb_build_object('applied', true, 'default_paid_allowance', o.default_paid_allowance, 'default_promo_allowance', o.default_promo_allowance);
end;
$$;
revoke all on function public.org_set_default_allowances(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.org_set_default_allowances(uuid, jsonb, text) to service_role;

-- Sets the allowance of either or both kinds for the selected members: {members: [ids], paid?,
-- promo?}, each a number (personal) or 'default' (follow the org default). Returns {applied,
-- members}. A changed promotion allowance gives what this month still lacks at once.
create function public.org_bulk_set_allowance(p_owner uuid, p_input jsonb, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_paid jsonb;
  v_promo jsonb;
  v_ids uuid[];
begin
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  v_paid := public._org_allowance_input(p_input->'paid');
  v_promo := public._org_allowance_input(p_input->'promo');
  if v_paid is null and v_promo is null then raise exception 'INVALID_INPUT'; end if;
  o := public._org_lock_owned(p_owner, false);
  if public._org_bulk_replayed(p_request_id, o.id, 'set_allowance') then
    return jsonb_build_object('applied', false, 'members', 0);
  end if;
  v_ids := public._org_bulk_members(o.id, p_input->'members');
  update public.org_members m set
      monthly_allowance = case when v_paid is null or v_paid = '"default"'::jsonb then m.monthly_allowance else (v_paid #>> '{}')::integer end,
      paid_allowance_custom = case when v_paid is null then m.paid_allowance_custom else v_paid <> '"default"'::jsonb end,
      promo_allowance = case when v_promo is null or v_promo = '"default"'::jsonb then m.promo_allowance else (v_promo #>> '{}')::integer end,
      promo_allowance_custom = case when v_promo is null then m.promo_allowance_custom else v_promo <> '"default"'::jsonb end
   where m.org_id = o.id and m.user_id = any(v_ids);
  insert into public.org_bulk_actions(request_id, org_id, actor, action, members, payload)
    values (p_request_id, o.id, p_owner, 'set_allowance', cardinality(v_ids),
      jsonb_build_object('members', to_jsonb(v_ids), 'paid', v_paid, 'promo', v_promo));
  if v_promo is not null then perform public._org_promo_topup(o.id); end if;
  return jsonb_build_object('applied', true, 'members', cardinality(v_ids));
end;
$$;
revoke all on function public.org_bulk_set_allowance(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.org_bulk_set_allowance(uuid, jsonb, text) to service_role;

-- Gives every selected member the same one-off amount of one kind: {members: [ids], kind: 'paid' |
-- 'promo', each: 1–1,000,000,000}. All or nothing: the total (each × members) must fit the pool
-- (ORG_POOL_INSUFFICIENT, nothing given), and each member's move is keyed <request>:<member>.
-- Returns {applied, members, total, pool_credits} (pool_credits: that kind's pool after).
create function public.org_bulk_grant(p_owner uuid, p_input jsonb, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_kind text := p_input->>'kind';
  v_each integer;
  v_ids uuid[];
  v_total bigint;
  v_member uuid;
  v_pool bigint;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or v_kind is null or v_kind not in ('paid', 'promo')
     or coalesce(p_input->>'each', '') !~ '^[1-9][0-9]{0,9}$' or (p_input->>'each')::bigint > 1000000000 then
    raise exception 'INVALID_INPUT';
  end if;
  v_each := (p_input->>'each')::integer;
  o := public._org_lock_owned(p_owner, false);
  if public._org_bulk_replayed(p_request_id, o.id, 'grant') then
    return jsonb_build_object('applied', false, 'members', 0, 'total', 0,
      'pool_credits', case when v_kind = 'paid' then o.pool_credits else o.promo_pool_credits end);
  end if;
  v_ids := public._org_bulk_members(o.id, p_input->'members');
  v_total := v_each::bigint * cardinality(v_ids);
  if (case when v_kind = 'paid' then o.pool_credits else o.promo_pool_credits end) < v_total then
    raise exception 'ORG_POOL_INSUFFICIENT';
  end if;
  foreach v_member in array v_ids loop
    if v_kind = 'paid' then
      select * into o from public.orgs where id = o.id;
      perform public._org_allocate(o, v_member, v_each, p_request_id || ':' || v_member::text, p_owner);
    else
      perform public._org_allocate_promo(o.id, v_member, v_each, p_request_id || ':' || v_member::text, p_owner);
    end if;
  end loop;
  insert into public.org_bulk_actions(request_id, org_id, actor, action, members, total, payload)
    values (p_request_id, o.id, p_owner, 'grant', cardinality(v_ids), v_total,
      jsonb_build_object('members', to_jsonb(v_ids), 'kind', v_kind, 'each', v_each));
  select case when v_kind = 'paid' then pool_credits else promo_pool_credits end into v_pool from public.orgs where id = o.id;
  return jsonb_build_object('applied', true, 'members', cardinality(v_ids), 'total', v_total, 'pool_credits', v_pool);
end;
$$;
revoke all on function public.org_bulk_grant(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.org_bulk_grant(uuid, jsonb, text) to service_role;
