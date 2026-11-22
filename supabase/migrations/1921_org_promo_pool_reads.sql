-- The enterprise promotion pool's reads of channel partner grants (ARCHITECTURE §6.5 企业推广积分池),
-- re-created after 1920 so they keep both its voided-sheet filters and the org pool (1890–1894):
--  * _partner_promo_bucket_left: only rows still in an owner's own pool (destination 'owner'), not
--    voided, and only the spending not already drawn from an org promotion share;
--  * _partner_promo_expire: orgs first (org pool + member-held promotion credits), then the owner
--    buckets; voided sheets skipped;
--  * org_promo_month: remaining = legacy rows still in an owner's pool + the org pool + what members hold.
--  * admin_partner_promo_void: refuses a sheet granted into the org promo pool.
-- create or replace with the same signatures and answers.

-- The bucket of 1847, limited to the rows that went to an owner's own pool and not voided (1920),
-- and counting only the spending not paid from an org promotion share.
create or replace function public._partner_promo_bucket_left(p_user uuid, p_expires timestamptz)
returns table(source text, source_id bigint, credits_left integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  e record;
  v_src text[] := '{}';
  v_id bigint[] := '{}';
  v_left integer[] := '{}';
  v_head integer := 1;
  v_need bigint;
  v_use integer;
  v_start timestamptz;
begin
  select min(x.at) into v_start from (
    select g.decided_at as at from public.partner_promo_grants g
     where g.recipient_user_id = p_user and g.expires_at = p_expires and g.status = 'granted' and g.voided_at is null and g.destination = 'owner'
    union all
    select t.created_at from public.partner_promo_topups t
     where t.recipient_user_id = p_user and t.expires_at = p_expires and t.destination = 'owner'
  ) x;
  if v_start is null then return; end if;
  for e in
    with adds as (
      select g.decided_at as at, 0 as ord, 'grant' as src, g.id, g.total as amount from public.partner_promo_grants g
       where g.recipient_user_id = p_user and g.expires_at = p_expires and g.status = 'granted' and g.voided_at is null and g.destination = 'owner'
      union all
      select t.created_at, 0, 'topup', t.id, t.credits from public.partner_promo_topups t
       where t.recipient_user_id = p_user and t.expires_at = p_expires and t.destination = 'owner'
    ),
    -- A reserve's part drawn from an org promotion share (1892 org_promo_draws, net of what its
    -- refunds gave back to that share) was paid by the org's credits, not by this bucket.
    reserves as (
      select r.created_at as at, r.id, r.idempotency_key, -r.delta as spent, coalesce(d.drawn - d.restored, 0) as org_part
        from public.credit_ledger r
        left join public.org_promo_draws d on d.debit_key = r.idempotency_key and d.user_id = r.user_id
       where r.user_id = p_user and r.pool = 'free' and r.kind = 'reserve' and r.created_at >= v_start
         and r.created_at < p_expires
    ),
    refunds as (
      select regexp_replace(f.idempotency_key, ':[^:]+$', ':reserve') as reserve_key, sum(f.delta) as back
        from public.credit_ledger f
       where f.user_id = p_user and f.pool = 'free' and f.kind = 'refund' and f.created_at >= v_start
       group by 1
    )
    select a.at, a.ord, a.src, a.id, a.amount::bigint from adds a
    union all
    select r.at, 1, 'spend', r.id, greatest(0, r.spent - least(r.spent, coalesce(f.back, 0)) - r.org_part)::bigint
      from reserves r left join refunds f on f.reserve_key = r.idempotency_key
    order by 1, 2, 4
  loop
    if e.src <> 'spend' then
      v_src := v_src || e.src;
      v_id := v_id || e.id;
      v_left := v_left || e.amount::integer;
    else
      v_need := e.amount;
      while v_need > 0 and v_head <= cardinality(v_left) loop
        v_use := least(v_left[v_head], v_need)::integer;
        v_left[v_head] := v_left[v_head] - v_use;
        v_need := v_need - v_use;
        if v_left[v_head] = 0 then v_head := v_head + 1; end if;
      end loop;
    end if;
  end loop;
  return query select u.s, u.i, u.l from unnest(v_src, v_id, v_left) as u(s, i, l);
end;
$$;

-- The daily expiry pass: every org whose promotion month is over, then (1847) the rows still in
-- owners' own pools (pool and member-held credits, 1892). Each bucket and each org in its own
-- subtransaction; a failed org is reported as {grant_id: 0, org_id, error} and retried next pass.
-- `taken` and `expired` count both; `overdue` also counts orgs more than an hour past due.
create or replace function public._partner_promo_expire() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b record;
  r record;
  v_at timestamptz;
  v_basis integer;
  v_period text;
  v_free integer;
  v_take integer;
  v_key text;
  v_expired integer := 0;
  v_taken bigint := 0;
  v_failed jsonb := '[]'::jsonb;
  v_org uuid;
begin
  -- Orgs first: their lock order is org -> profile, and locks taken in a subtransaction stay held
  -- until the pass commits, so the owner buckets (profile locks only) come after.
  for v_org in select o.id from public.orgs o where o.promo_expires_at <= now() order by o.promo_expires_at, o.id loop
  begin
    perform from public.orgs where id = v_org for no key update;
    v_taken := v_taken + public._org_promo_expire_due(v_org);
    v_expired := v_expired + 1;
  exception when others then
    v_failed := v_failed || jsonb_build_array(jsonb_build_object('grant_id', 0, 'org_id', v_org, 'error', sqlerrm));
  end;
  end loop;

  for b in
    select g.recipient_user_id as u, g.expires_at as e from public.partner_promo_grants g
     where g.status = 'granted' and g.voided_at is null and g.destination = 'owner' and g.expires_at <= now()
       and (g.expired_at is null or g.expires_at > now() - interval '7 days')
    union
    select t.recipient_user_id, t.expires_at from public.partner_promo_topups t
     where t.destination = 'owner' and t.expires_at <= now() and (t.expired_at is null or t.expires_at > now() - interval '7 days')
    order by 2, 1
  loop
  begin
    perform from public.partner_promo_grants g
     where g.recipient_user_id = b.u and g.expires_at = b.e and g.status = 'granted' and g.voided_at is null and g.destination = 'owner' order by g.id for update;
    perform from public.partner_promo_topups t
     where t.recipient_user_id = b.u and t.expires_at = b.e and t.destination = 'owner' order by t.id for update;
    perform from public.profiles where id = b.u for update;
    for r in select * from public._partner_promo_bucket_left(b.u, b.e) order by source, source_id loop
      if r.source = 'grant' then
        select g.expired_at, g.expired_basis, g.period into v_at, v_basis, v_period from public.partner_promo_grants g where g.id = r.source_id;
      else
        select t.expired_at, t.expired_basis, t.period into v_at, v_basis, v_period from public.partner_promo_topups t where t.id = r.source_id;
      end if;
      continue when v_at is not null and b.e <= now() - interval '7 days';
      select free_credits into v_free from public.profiles where id = b.u;
      v_take := least(coalesce(v_free, 0), greatest(0, r.credits_left - coalesce(v_basis, 0)))::integer;
      v_key := case when r.source = 'grant' then 'partner_promo_expire:' else 'partner_promo_topup_expire:' end
        || r.source_id || case when v_at is null then '' else ':' || v_basis end;
      if v_take > 0 then
        perform public._apply_credit_change(b.u, 'free', 'partner_promo_expire', -v_take,
          case when r.source = 'grant' then 'Channel partner promotion credits expired ' else 'Channel partner promotion top-up expired ' end
            || v_period, v_key);
      end if;
      if v_at is null or r.credits_left > v_basis then
        if r.source = 'grant' then
          update public.partner_promo_grants
             set expired_at = coalesce(expired_at, now()), expired_credits = coalesce(expired_credits, 0) + v_take,
                 expired_basis = greatest(coalesce(expired_basis, 0), r.credits_left)
           where id = r.source_id;
        else
          update public.partner_promo_topups
             set expired_at = coalesce(expired_at, now()), expired_credits = coalesce(expired_credits, 0) + v_take,
                 expired_basis = greatest(coalesce(expired_basis, 0), r.credits_left)
           where id = r.source_id;
        end if;
      end if;
      if v_at is null then v_expired := v_expired + 1; end if;
      v_taken := v_taken + v_take;
    end loop;
  exception when others then
    v_failed := v_failed
      || coalesce((select jsonb_agg(jsonb_build_object('grant_id', g.id, 'error', sqlerrm) order by g.id) from public.partner_promo_grants g
                    where g.recipient_user_id = b.u and g.expires_at = b.e and g.status = 'granted' and g.voided_at is null and g.destination = 'owner'), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('grant_id', 0, 'topup_id', t.id, 'error', sqlerrm) order by t.id)
                    from public.partner_promo_topups t
                    where t.recipient_user_id = b.u and t.expires_at = b.e and t.destination = 'owner'), '[]'::jsonb);
  end;
  end loop;


  return jsonb_build_object('expired', v_expired, 'taken', v_taken, 'failed', v_failed,
    'overdue', (select count(*) from public.partner_promo_grants
                 where status = 'granted' and voided_at is null and destination = 'owner' and expired_at is null and expires_at <= now() - interval '1 hour')::integer
             + (select count(*) from public.partner_promo_topups
                 where destination = 'owner' and expired_at is null and expires_at <= now() - interval '1 hour')::integer
             + (select count(*) from public.orgs where promo_expires_at <= now() - interval '1 hour')::integer);
end;
$$;

-- The 企业联盟 card (1849): granted this month as before; remaining = what is still unspent of it:
-- rows still in the owner's own pool (measured as 1849 did) plus the org's live promo
-- pool plus what active members still hold of it.
create or replace function public.org_promo_month(p_org uuid, p_now timestamptz default now())
returns table(
  promo_partner boolean,
  period text,
  monthly integer,
  topups integer,
  expires_at timestamptz,
  remaining integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_period text := to_char(p_now at time zone 'UTC', 'YYYY-MM');
  v_partner boolean;
  v_monthly integer;
  v_topups integer;
  v_expires timestamptz;
  v_left bigint := 0;
  o public.orgs;
  b record;
begin
  select * into o from public.orgs where id = p_org;
  if not found then return; end if;
  v_partner := o.promo_partner;
  select coalesce(sum(g.total), 0)::integer, min(g.expires_at) into v_monthly, v_expires
    from public.partner_promo_grants g
   where g.org_id = p_org and g.period = v_period and g.status = 'granted' and g.voided_at is null;
  select coalesce(sum(t.credits), 0)::integer, least(v_expires, min(t.expires_at)) into v_topups, v_expires
    from public.partner_promo_topups t
   where t.org_id = p_org and t.period = v_period;
  for b in
    select x.u, x.e from (
      select g.recipient_user_id as u, g.expires_at as e from public.partner_promo_grants g
       where g.org_id = p_org and g.period = v_period and g.status = 'granted' and g.voided_at is null and g.destination = 'owner'
      union
      select t.recipient_user_id, t.expires_at from public.partner_promo_topups t
       where t.org_id = p_org and t.period = v_period and t.destination = 'owner'
    ) x
  loop
    v_left := v_left + least(
      coalesce((select p.free_credits from public.profiles p where p.id = b.u), 0),
      coalesce((select sum(l.credits_left) from public._partner_promo_bucket_left(b.u, b.e) l
                 where (l.source = 'grant' and exists (select 1 from public.partner_promo_grants g
                          where g.id = l.source_id and g.org_id = p_org and g.period = v_period and g.voided_at is null))
                    or (l.source = 'topup' and exists (select 1 from public.partner_promo_topups t
                          where t.id = l.source_id and t.org_id = p_org and t.period = v_period))), 0));
  end loop;
  if o.promo_expires_at > p_now then
    v_left := v_left + o.promo_pool_credits
      + coalesce((select sum(least(m.held_promo_credits, p.free_credits)) from public.org_members m
                   join public.profiles p on p.id = m.user_id where m.org_id = p_org and m.status = 'active'), 0);
  end if;
  return query select v_partner, v_period, v_monthly, v_topups, v_expires,
    case when v_expires is not null and v_expires <= p_now then 0 else v_left::integer end;
end;
$$;

-- The void (1920) is for a sheet whose credits sat in the owner's own pool and were taken back by
-- hand. A sheet granted into the org promo pool (destination 'org') is refused
-- (PROMO_GRANT_IN_ORG_POOL); otherwise unchanged.
create or replace function public.admin_partner_promo_void(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_reason text := nullif(trim(p_input->>'reason'), '');
  g public.partner_promo_grants;
begin
  perform public._org_require_admin(p_actor);
  if jsonb_typeof(p_input) is distinct from 'object' or coalesce(p_input->>'grant_id', '') !~ '^[1-9][0-9]{0,17}$'
     or v_reason is null or length(v_reason) > 500 then
    raise exception 'INVALID_INPUT';
  end if;
  v_id := (p_input->>'grant_id')::bigint;
  select * into g from public.partner_promo_grants where id = v_id;
  if not found then raise exception 'PROMO_GRANT_NOT_FOUND'; end if;
  perform from public.orgs where id = g.org_id for no key update;
  select * into g from public.partner_promo_grants where id = v_id for update;
  if g.voided_at is not null then return jsonb_build_object('applied', false, 'reason', 'already', 'grant_id', g.id); end if;
  if g.status <> 'granted' then raise exception 'PROMO_GRANT_NOT_GRANTED'; end if;
  if g.expired_at is not null then raise exception 'PROMO_GRANT_EXPIRED'; end if;
  -- A sheet granted into the org promo pool (1894) was never in the owner's own pool, so "its
  -- credits were taken back by hand" cannot hold; the pool expires as a whole at month end.
  if g.destination = 'org' then raise exception 'PROMO_GRANT_IN_ORG_POOL'; end if;
  -- A later sheet already clawed back from this one: voiding would hide that repayment.
  if exists (select from public.partner_promo_clawbacks c join public.partner_promo_grants a on a.id = c.applied_grant_id
              where c.source_grant_id = g.id and a.voided_at is null) then
    raise exception 'PROMO_GRANT_CLAWED';
  end if;
  update public.partner_promo_grants set voided_at = now(), voided_by = p_actor, void_reason = v_reason where id = g.id;
  perform public._org_audit(p_actor, 'partner_promo_void', g.id::text,
    jsonb_build_object('org_id', g.org_id, 'period', g.period, 'recipient', g.recipient_user_id, 'total', g.total,
      'reason', v_reason)::text);
  return jsonb_build_object('applied', true, 'grant_id', g.id);
end;
$$;
