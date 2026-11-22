-- The enterprise promotion pool's internal functions (ARCHITECTURE §6.5 企业推广积分池). Same model as
-- the paid pool: the owner moves promotion credits into a member's own FREE pool, and
-- org_members.held_promo_credits remembers how much of it is still the org's. Generations are not
-- changed: reserve_credits still takes the paid pool first and the free pool only when the paid
-- one cannot cover the whole order, so a work made with org promotion credits is a free work
-- (watermark, public, no commercial use) and a refund goes back to the free pool it came from.
-- Inside the free pool the org's promotion share is spent first (it is what expires).
--
-- Lock order everywhere: org row (FOR NO KEY UPDATE) -> profile row -> member row, as 1627/1629.
-- None of these functions is granted to any role.

-- The UTC month `YYYY-MM` of a moment.
create function public._utc_period(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM');
$$;
revoke all on function public._utc_period(timestamptz) from public, anon, authenticated, service_role;

-- Month-end expiry of one org's promotion credits, if due: empties the promo pool (ledger
-- promo_expire) and takes back from every active member what the org still holds of it,
-- min(held_promo_credits, free balance), with the ledger key org_promo_expire:<month>:<org>:<member>.
-- The caller holds the org row. Every function that touches the promo pool calls it first, and
-- the daily expiry pass calls it for every org that is due, so a new month never starts on top of
-- last month's credits. Returns the credits taken (pool + members).
create function public._org_promo_expire_due(p_org uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  m record;
  v_period text;
  v_take integer;
  v_total bigint := 0;
begin
  select * into o from public.orgs where id = p_org;
  if o.promo_expires_at is null or o.promo_expires_at > now() then return 0; end if;
  v_period := public._utc_period(o.promo_expires_at - interval '1 second');
  if o.promo_pool_credits > 0 then
    update public.orgs set promo_pool_credits = 0, updated_at = now() where id = o.id;
    insert into public.org_credit_ledger(org_id, kind, delta, pool_after, request_id, note)
      values (o.id, 'promo_expire', -o.promo_pool_credits, 0, 'org_promo_expire:' || v_period || ':' || o.id::text,
        'promotion credits expired at month end');
    v_total := o.promo_pool_credits;
  end if;
  for m in select mm.user_id from public.org_members mm
            where mm.org_id = o.id and mm.status = 'active' and mm.held_promo_credits > 0 order by mm.user_id loop
    perform from public.profiles where id = m.user_id for update;
    select least(mm.held_promo_credits, p.free_credits) into v_take
      from public.org_members mm join public.profiles p on p.id = mm.user_id
     where mm.org_id = o.id and mm.user_id = m.user_id for update of mm;
    if v_take > 0 then
      perform public._apply_credit_change(m.user_id, 'free', 'org_promo_expire', -v_take,
        'org promotion credits expired ' || v_period, 'org_promo_expire:' || v_period || ':' || o.id::text || ':' || m.user_id::text);
      v_total := v_total + v_take;
    end if;
    update public.org_members set held_promo_credits = 0 where org_id = o.id and user_id = m.user_id;
  end loop;
  update public.orgs set promo_expires_at = null, updated_at = now() where id = o.id;
  return v_total;
end;
$$;
revoke all on function public._org_promo_expire_due(uuid) from public, anon, authenticated, service_role;

-- Moves p_amount from the promo pool into a member's free pool (credit ledger org_promo_allocate,
-- key org_promo:<request>) and adds it to the org's share. The caller holds the org row and has
-- run _org_promo_expire_due. Returns the member's new held_promo_credits.
create function public._org_allocate_promo(p_org uuid, p_member uuid, p_amount integer, p_request text, p_actor uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_pool bigint;
  m public.org_members;
  change public.credit_change;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_INPUT'; end if;
  select promo_pool_credits into v_pool from public.orgs where id = p_org;
  perform 1 from public.profiles where id = p_member for update;
  select * into m from public.org_members where org_id = p_org and user_id = p_member and status = 'active' for update;
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  if v_pool < p_amount then raise exception 'ORG_POOL_INSUFFICIENT'; end if;
  change := public._apply_credit_change(p_member, 'free', 'org_promo_allocate', p_amount, 'org:' || p_org::text,
    'org_promo:' || p_request);
  update public.org_members set held_promo_credits = least(held_promo_credits, change.free_credits - p_amount) + p_amount
   where org_id = p_org and user_id = p_member returning held_promo_credits into m.held_promo_credits;
  update public.orgs set promo_pool_credits = promo_pool_credits - p_amount, updated_at = now() where id = p_org
  returning promo_pool_credits into v_pool;
  insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, actor)
    values (p_org, 'promo_allocate', -p_amount, v_pool, p_member, p_request, p_actor);
  return m.held_promo_credits;
end;
$$;
revoke all on function public._org_allocate_promo(uuid, uuid, integer, text, uuid) from public, anon, authenticated, service_role;

-- Gives every active member with a promotion allowance the rest of this month's allowance from the
-- promo pool, in join order, while the pool lasts (what it could not cover is recorded as short and
-- given by a later run). Called after every grant into the pool and when an allowance changes. The
-- caller holds the org row and has run _org_promo_expire_due. Returns the credits given.
create function public._org_promo_topup(p_org uuid) returns bigint
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
    select mm.user_id, mm.promo_allowance, coalesce(t.granted, 0) as granted
      from public.org_members mm
      left join public.org_member_promo_topups t on t.org_id = mm.org_id and t.user_id = mm.user_id and t.period = v_period
     where mm.org_id = o.id and mm.status = 'active' and mm.promo_allowance > coalesce(t.granted, 0)
     order by mm.joined_at, mm.user_id
  loop
    select promo_pool_credits into o.promo_pool_credits from public.orgs where id = o.id;
    v_give := least(m.promo_allowance - m.granted, o.promo_pool_credits)::integer;
    if v_give > 0 then
      perform public._org_allocate_promo(o.id, m.user_id, v_give,
        'org_promo_topup:' || v_period || ':' || o.id::text || ':' || m.user_id::text || ':' || m.granted, null);
      v_total := v_total + v_give;
    end if;
    insert into public.org_member_promo_topups as t(org_id, user_id, period, granted, short)
      values (o.id, m.user_id, v_period, m.granted + v_give, m.promo_allowance - m.granted - v_give)
    on conflict (org_id, user_id, period) do update
      set granted = t.granted + v_give, short = greatest(0, m.promo_allowance - t.granted - v_give), updated_at = now();
  end loop;
  return v_total;
end;
$$;
revoke all on function public._org_promo_topup(uuid) from public, anon, authenticated, service_role;

-- Puts promotion credits into the org's promo pool (ledger promo_grant under p_request) expiring at
-- p_expires, then hands out the members' allowances. The caller holds the org row. Returns the
-- pool after the grant (before the allowances).
create function public._org_promo_grant(p_org uuid, p_credits integer, p_expires timestamptz, p_request text,
  p_note text, p_actor uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_pool bigint;
begin
  if p_credits is null or p_credits <= 0 or p_expires is null or p_expires <= now() then raise exception 'INVALID_INPUT'; end if;
  perform public._org_promo_expire_due(p_org);
  update public.orgs set promo_pool_credits = promo_pool_credits + p_credits,
         promo_expires_at = coalesce(promo_expires_at, p_expires), updated_at = now()
   where id = p_org returning promo_pool_credits into v_pool;
  insert into public.org_credit_ledger(org_id, kind, delta, pool_after, request_id, note, actor)
    values (p_org, 'promo_grant', p_credits, v_pool, p_request, p_note, p_actor);
  perform public._org_promo_topup(p_org);
  return v_pool;
end;
$$;
revoke all on function public._org_promo_grant(uuid, integer, timestamptz, text, text, uuid) from public, anon, authenticated, service_role;

-- Queued refunds of members who had left (1629) go back into the pool of their kind. A promotion
-- return only while its month is still the org's live promotion month; otherwise it has expired
-- with that month and is only marked settled. The caller holds the org row.
create or replace function public._org_settle_returns(p_org uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_after bigint;
  total bigint := 0;
  v_live text;
begin
  select case when promo_expires_at > now() then public._utc_period(now()) end into v_live from public.orgs where id = p_org;
  for r in update public.org_pool_returns set settled_at = now() where org_id = p_org and settled_at is null
      returning org_pool_returns.refund_key, org_pool_returns.user_id, org_pool_returns.credits, org_pool_returns.pool as kind, org_pool_returns.period loop
    if r.kind = 'promo' then
      continue when r.period is distinct from v_live;
      update public.orgs set promo_pool_credits = promo_pool_credits + r.credits, updated_at = now() where id = p_org
      returning promo_pool_credits into v_after;
      insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, note)
        values (p_org, 'promo_reclaim', r.credits, v_after, r.user_id, 'org_return:' || r.refund_key, 'refunded after the member left');
    else
      update public.orgs set pool_credits = pool_credits + r.credits, updated_at = now() where id = p_org returning pool_credits into v_after;
      insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, note)
        values (p_org, 'reclaim', r.credits, v_after, r.user_id, 'org_return:' || r.refund_key, 'refunded after the member left');
    end if;
    total := total + r.credits;
  end loop;
  return total;
end;
$$;

-- Request ids the owner, members and admins may not use: the system's own keys (monthly top-ups,
-- late returns, promotion top-ups, expiries and grants).
create or replace function public._org_replayed(p_request text, p_org uuid, p_kind text, p_delta bigint, p_member uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare prior public.org_credit_ledger;
begin
  if p_request is null or length(p_request) not between 1 and 200 or starts_with(p_request, 'org_topup:')
     or starts_with(p_request, 'org_return:') or starts_with(p_request, 'org_promo_') or starts_with(p_request, 'partner_promo') then
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

-- The owner's org, locked; late returns settled and a due promotion expiry run first.
create or replace function public._org_lock_owned(p_owner uuid, p_allow_suspended boolean) returns public.orgs
language plpgsql security definer set search_path = '' as $$
declare o public.orgs;
begin
  select * into o from public.orgs where owner_user_id = p_owner for no key update;
  if not found then raise exception 'NOT_ORG_OWNER'; end if;
  perform public._org_promo_expire_due(o.id);
  perform public._org_settle_returns(o.id);
  select * into o from public.orgs where id = o.id;
  if o.status <> 'active' and not p_allow_suspended then raise exception 'ORG_SUSPENDED'; end if;
  return o;
end;
$$;

-- A member leaving or removed: the org's paid share goes back to the paid pool (as before) and its
-- promotion share, min(held_promo_credits, free balance), back to the promo pool (ledger
-- promo_reclaim under <request>:promo), where it expires with the month like the rest. The
-- member's own credits are never touched. Returns the paid credits returned (as before).
create or replace function public._org_release(p_org public.orgs, p_member uuid, p_request text, p_actor uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  m public.org_members;
  v_credits integer;
  v_free integer;
  back integer;
  back_promo integer;
  pool bigint;
begin
  perform public._org_promo_expire_due(p_org.id);
  select p.credits, p.free_credits into v_credits, v_free from public.profiles p where p.id = p_member for update;
  select * into m from public.org_members where org_id = p_org.id and user_id = p_member and status = 'active' for update;
  if not found then raise exception 'ORG_MEMBER_NOT_FOUND'; end if;
  if m.role = 'owner' then raise exception 'ORG_OWNER_CANNOT_LEAVE'; end if;
  back := least(m.held_credits, coalesce(v_credits, 0));
  if back > 0 then
    perform public._apply_credit_change(p_member, 'paid', 'org_reclaim', -back, 'org:' || p_org.id::text, 'org:' || p_request);
    update public.orgs set pool_credits = pool_credits + back, updated_at = now() where id = p_org.id returning pool_credits into pool;
    insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, actor)
      values (p_org.id, 'reclaim', back, pool, p_member, p_request, p_actor);
  end if;
  back_promo := least(m.held_promo_credits, coalesce(v_free, 0));
  if back_promo > 0 then
    perform public._apply_credit_change(p_member, 'free', 'org_promo_reclaim', -back_promo, 'org:' || p_org.id::text,
      'org_promo:' || p_request);
    update public.orgs set promo_pool_credits = promo_pool_credits + back_promo, updated_at = now() where id = p_org.id
    returning promo_pool_credits into pool;
    insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, actor)
      values (p_org.id, 'promo_reclaim', back_promo, pool, p_member, left(p_request, 194) || ':promo', p_actor);
  end if;
  update public.org_members set status = 'removed', removed_at = now(), held_credits = 0, held_promo_credits = 0
    where org_id = p_org.id and user_id = p_member;
  return back;
end;
$$;

-- Keeps held_promo_credits right as the member's free pool moves (the promotion twin of 1629):
--  - a free-pool debit draws from the org's promotion share first (it expires) and records how much
--    under the debit's key and month; a month-end expiry of the owner's own old promotion grants
--    (partner_promo_expire) does not draw, it only keeps the share within the balance;
--  - a refund paired with such a debit (`job:<id>:refund` etc. for `job:<id>:reserve`) gives the
--    drawn part back to the share while the member is still in the org and the month the share was
--    funded for (recorded with the draw) is still the org's live promotion month;
--    in a later month that part has expired and is taken straight back (org_promo_expire); after
--    the member left it is taken back and queued for the promo pool (org_pool_returns, pool promo).
create function public._org_promo_follows_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.org_members;
  d public.org_promo_draws;
  v_draw integer;
  back integer;
begin
  if new.delta < 0 then
    select * into m from public.org_members where user_id = new.user_id and status = 'active' for update;
    if not found or m.held_promo_credits = 0 then return new; end if;
    v_draw := case when new.kind = 'partner_promo_expire' then 0 else least(m.held_promo_credits, -new.delta) end;
    update public.org_members set held_promo_credits = least(held_promo_credits - v_draw, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
    if v_draw > 0 then
      insert into public.org_promo_draws(debit_key, org_id, user_id, period, drawn)
        values (new.idempotency_key, m.org_id, m.user_id,
          -- The month the share was funded for (the org's promotion month), not the debit's: a job
          -- reserved after month end but before the expiry pass still spends last month's credits.
          coalesce((select public._utc_period(o.promo_expires_at - interval '1 second') from public.orgs o where o.id = m.org_id),
                   public._utc_period(new.created_at)), v_draw);
    end if;
  elsif new.kind = 'refund' then
    select * into d from public.org_promo_draws
     where debit_key = regexp_replace(new.idempotency_key, ':[^:]+$', ':reserve') and user_id = new.user_id for update;
    if not found or d.restored >= d.drawn then return new; end if;
    back := least(new.delta, d.drawn - d.restored);
    update public.org_promo_draws set restored = restored + back where debit_key = d.debit_key;
    -- Only while that month is still the org's live promotion month; otherwise it has expired.
    if d.period is distinct from (select case when o.promo_expires_at > now() then public._utc_period(o.promo_expires_at - interval '1 second') end
                                    from public.orgs o where o.id = d.org_id) then
      perform public._apply_credit_change(new.user_id, 'free', 'org_promo_expire', -back,
        'org promotion credits expired ' || d.period, 'org_promo_return:' || new.idempotency_key);
      return new;
    end if;
    select * into m from public.org_members where org_id = d.org_id and user_id = d.user_id and status = 'active' for update;
    if not found then
      perform public._apply_credit_change(new.user_id, 'free', 'org_promo_reclaim', -back, 'org:' || d.org_id::text,
        'org_promo_return:' || new.idempotency_key);
      insert into public.org_pool_returns(refund_key, org_id, user_id, credits, pool, period)
        values (new.idempotency_key, d.org_id, d.user_id, back, 'promo', d.period);
      return new;
    end if;
    update public.org_members set held_promo_credits = least(held_promo_credits + back, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public._org_promo_follows_ledger() from public, anon, authenticated, service_role;

create trigger credit_ledger_org_promo_held
  after insert on public.credit_ledger
  for each row when (new.pool = 'free' and new.kind not in ('org_promo_allocate', 'org_promo_reclaim', 'org_promo_expire', 'org_promo_move'))
  execute function public._org_promo_follows_ledger();
