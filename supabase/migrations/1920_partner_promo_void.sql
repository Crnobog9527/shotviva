-- Voiding a granted monthly promotion sheet (ARCHITECTURE §6.5 渠道商推广积分). When an admin has
-- already taken a grant's credits back by hand (an admin_adjust), the sheet still says granted and
-- the month-end expiry would take "what is left" of it a second time, out of the owner's other free
-- credits. A voided sheet keeps its status ('granted': it was granted and its lines still keep
-- those orders from being counted twice) but no longer belongs to its expiry bucket: the expiry
-- pass, its overdue alarm and the owner's month card skip it. Voiding moves no credits.
--
-- Expand only: three nullable columns (set together, only by admin_partner_promo_void), one audit action widened, one new admin function, and
-- create or replace of _partner_promo_bucket_left and _partner_promo_expire (1847),
-- org_promo_month (1849) and _partner_promo_owed (1910) with `and g.voided_at is null` added
-- wherever they pick granted sheets; nothing else in them changes. Code running before the deploy
-- never sets voided_at, so for it every answer stays the same. A voided sheet is no clawback
-- source either: its credits, bonus included, were already taken back, so a later refund of its
-- orders must not take its bonus a second time from the next month's grant.

alter table public.partner_promo_grants
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles(id),
  add column void_reason text check (length(void_reason) <= 500);

do $$
declare
  v_actions text[];
begin
  select array_agg(m[1] order by ord) into v_actions
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.admin_audit_log'::regclass and c.conname = 'admin_audit_log_action_check';
  if v_actions is null or cardinality(v_actions) < 10 or not 'partner_promo_confirm' = any(v_actions) then
    raise exception 'admin_audit_log_action_check not found or unreadable';
  end if;
  if not 'partner_promo_void' = any(v_actions) then v_actions := array_append(v_actions, 'partner_promo_void'); end if;
  execute 'alter table public.admin_audit_log drop constraint admin_audit_log_action_check';
  execute 'alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in ('
    || (select string_agg(quote_literal(a), ',' order by o) from unnest(v_actions) with ordinality u(a, o)) || '))';
end;
$$;

-- Voids a granted sheet: {grant_id, reason (required, ≤ 500)}. Moves no credits. Returns
-- {applied: true, grant_id}, or {applied: false, reason: 'already', grant_id} for a sheet already
-- voided (nothing changes, the first reason stays). Refused: PROMO_GRANT_NOT_FOUND,
-- PROMO_GRANT_NOT_GRANTED (pending, rejected or lapsed), PROMO_GRANT_EXPIRED (the expiry pass has
-- already taken it back), NOT_ADMIN, INVALID_INPUT. Allowed until the expiry pass handles the
-- sheet, so a pass that runs late still skips it. Locks the org, then the sheet, like the decide
-- and the expiry pass (which locks the sheet before measuring its bucket).
create function public.admin_partner_promo_void(p_actor uuid, p_input jsonb) returns jsonb
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
  update public.partner_promo_grants set voided_at = now(), voided_by = p_actor, void_reason = v_reason where id = g.id;
  perform public._org_audit(p_actor, 'partner_promo_void', g.id::text,
    jsonb_build_object('org_id', g.org_id, 'period', g.period, 'recipient', g.recipient_user_id, 'total', g.total,
      'reason', v_reason)::text);
  return jsonb_build_object('applied', true, 'grant_id', g.id);
end;
$$;
revoke all on function public.admin_partner_promo_void(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_void(uuid, jsonb) to service_role;

-- 1847's bucket without voided sheets (their credits were handled by hand).
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
     where g.recipient_user_id = p_user and g.expires_at = p_expires and g.status = 'granted' and g.voided_at is null
    union all
    select t.created_at from public.partner_promo_topups t where t.recipient_user_id = p_user and t.expires_at = p_expires
  ) x;
  if v_start is null then return; end if;
  for e in
    with adds as (
      select g.decided_at as at, 0 as ord, 'grant' as src, g.id, g.total as amount from public.partner_promo_grants g
       where g.recipient_user_id = p_user and g.expires_at = p_expires and g.status = 'granted' and g.voided_at is null
      union all
      select t.created_at, 0, 'topup', t.id, t.credits from public.partner_promo_topups t
       where t.recipient_user_id = p_user and t.expires_at = p_expires
    ),
    reserves as (
      select r.created_at as at, r.id, r.idempotency_key, -r.delta as spent from public.credit_ledger r
       where r.user_id = p_user and r.pool = 'free' and r.kind = 'reserve' and r.created_at >= v_start and r.created_at < p_expires
    ),
    refunds as (
      select regexp_replace(f.idempotency_key, ':[^:]+$', ':reserve') as reserve_key, sum(f.delta) as back
        from public.credit_ledger f
       where f.user_id = p_user and f.pool = 'free' and f.kind = 'refund' and f.created_at >= v_start
       group by 1
    )
    select a.at, a.ord, a.src, a.id, a.amount::bigint from adds a
    union all
    select r.at, 1, 'spend', r.id, greatest(0, r.spent - least(r.spent, coalesce(f.back, 0)))::bigint
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

-- 1847's expiry pass, skipping voided sheets (also in its lock, failure list and overdue count).
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
begin
  for b in
    select g.recipient_user_id as u, g.expires_at as e from public.partner_promo_grants g
     where g.status = 'granted' and g.voided_at is null and g.expires_at <= now() and (g.expired_at is null or g.expires_at > now() - interval '7 days')
    union
    select t.recipient_user_id, t.expires_at from public.partner_promo_topups t
     where t.expires_at <= now() and (t.expired_at is null or t.expires_at > now() - interval '7 days')
    order by 2, 1
  loop
  begin
    perform from public.partner_promo_grants g
     where g.recipient_user_id = b.u and g.expires_at = b.e and g.status = 'granted' and g.voided_at is null order by g.id for update;
    perform from public.partner_promo_topups t where t.recipient_user_id = b.u and t.expires_at = b.e order by t.id for update;
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
                    where g.recipient_user_id = b.u and g.expires_at = b.e and g.status = 'granted' and g.voided_at is null), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('grant_id', 0, 'topup_id', t.id, 'error', sqlerrm) order by t.id)
                    from public.partner_promo_topups t
                    where t.recipient_user_id = b.u and t.expires_at = b.e), '[]'::jsonb);
  end;
  end loop;
  return jsonb_build_object('expired', v_expired, 'taken', v_taken, 'failed', v_failed,
    'overdue', (select count(*) from public.partner_promo_grants
                 where status = 'granted' and voided_at is null and expired_at is null and expires_at <= now() - interval '1 hour')::integer
             + (select count(*) from public.partner_promo_topups
                 where expired_at is null and expires_at <= now() - interval '1 hour')::integer);
end;
$$;

-- 1849's month card for the owner, without voided sheets.
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
  b record;
begin
  select o.promo_partner into v_partner from public.orgs o where o.id = p_org;
  if v_partner is null then return; end if;
  select coalesce(sum(g.total), 0)::integer, min(g.expires_at) into v_monthly, v_expires
    from public.partner_promo_grants g
   where g.org_id = p_org and g.period = v_period and g.status = 'granted' and g.voided_at is null;
  select coalesce(sum(t.credits), 0)::integer, least(v_expires, min(t.expires_at)) into v_topups, v_expires
    from public.partner_promo_topups t
   where t.org_id = p_org and t.period = v_period;
  -- Each (recipient, expiry) bucket the org's rows sit in; normally one.
  for b in
    select x.u, x.e, sum(x.k)::bigint as own from (
      select g.recipient_user_id as u, g.expires_at as e, 1 as k from public.partner_promo_grants g
       where g.org_id = p_org and g.period = v_period and g.status = 'granted' and g.voided_at is null
      union all
      select t.recipient_user_id, t.expires_at, 1 from public.partner_promo_topups t
       where t.org_id = p_org and t.period = v_period
    ) x group by x.u, x.e
  loop
    v_left := v_left + least(
      coalesce((select p.free_credits from public.profiles p where p.id = b.u), 0),
      coalesce((select sum(l.credits_left) from public._partner_promo_bucket_left(b.u, b.e) l
                 where (l.source = 'grant' and exists (select 1 from public.partner_promo_grants g
                                                       where g.id = l.source_id and g.org_id = p_org and g.period = v_period))
                    or (l.source = 'topup' and exists (select 1 from public.partner_promo_topups t
                                                       where t.id = l.source_id and t.org_id = p_org and t.period = v_period))), 0));
  end loop;
  return query select v_partner, v_period, v_monthly, v_topups, v_expires,
    case when v_expires is not null and v_expires <= p_now then 0 else v_left::integer end;
end;
$$;

-- 1910's clawback debts without voided sheets (their bonus was already taken back by hand).
create or replace function public._partner_promo_owed(p_org uuid, p_period text)
returns table(grant_id bigint, period text, owed integer)
language sql stable security definer set search_path = '' as $$
  select g.id, g.period,
         greatest(0, g.bonus
           - (public._partner_promo_bonus(coalesce((
               select jsonb_agg(jsonb_build_object('customer', l.customer_user_id,
                                                   'credits', public._partner_promo_payment_credits(p)))
                 from public.partner_promo_grant_lines l join public.payments p on p.id = l.payment_id
                where l.grant_id = g.id), '[]'::jsonb),
               coalesce((g.detail->>'customer_cap_bp')::integer, 2000),
               coalesce((g.detail->>'min_customers')::integer, 3))->>'bonus')::integer
           - coalesce((select sum(c.credits) from public.partner_promo_clawbacks c where c.source_grant_id = g.id), 0)::integer)
    from public.partner_promo_grants g
   where g.org_id = p_org and g.status = 'granted' and g.voided_at is null and g.period < p_period and g.bonus > 0
   order by g.period, g.id;
$$;
