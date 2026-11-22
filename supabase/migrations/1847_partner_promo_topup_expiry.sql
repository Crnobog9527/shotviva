-- Month-end expiry of ad-hoc top-ups together with the monthly grant (ARCHITECTURE §6.5 渠道商推广积分
-- 「临时追加」). The monthly grant and the top-ups an account got for the same month all land in its
-- one free pool and expire at the same moment, so what is left of them has to be measured together:
-- measured one by one, each would count the same spending against itself and too little would be
-- taken back. They form one bucket per (recipient, expires_at).
--
-- What is left is measured as 1843 did for a single grant, now over the whole bucket in time
-- order: each grant or top-up adds its credits when it is made; each free-pool reserve made before
-- the expiry spends, net of the refunds paired with it (counted at the reserve's time, whenever
-- they land), from the bucket first (promotion credits are the ones that expire), oldest grant
-- first, and never below zero (a spend larger than the bucket came from the owner's other free
-- credits). For a bucket of one monthly grant this is exactly 1843's grant − spent. The bucket's
-- remainder is the sum of its rows' remainders, so taking back each row's remainder (less what
-- was already taken back for it, expired_basis) never takes anything twice or more than is left.
--
-- Changes only these function bodies (create or replace, same signatures and answers); the daily
-- expiry pass and the monthly run call _partner_promo_expire() as before.

-- Every grant and top-up of the bucket with what is left of it: source 'grant' (a granted monthly
-- sheet) or 'topup'. Reads the credit ledger through credit_ledger_user_id_created_at_idx.
create function public._partner_promo_bucket_left(p_user uuid, p_expires timestamptz)
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
     where g.recipient_user_id = p_user and g.expires_at = p_expires and g.status = 'granted'
    union all
    select t.created_at from public.partner_promo_topups t where t.recipient_user_id = p_user and t.expires_at = p_expires
  ) x;
  if v_start is null then return; end if;
  for e in
    with adds as (
      select g.decided_at as at, 0 as ord, 'grant' as src, g.id, g.total as amount from public.partner_promo_grants g
       where g.recipient_user_id = p_user and g.expires_at = p_expires and g.status = 'granted'
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
revoke all on function public._partner_promo_bucket_left(uuid, timestamptz) from public, anon, authenticated, service_role;

-- What is left of one granted sheet: its share of its bucket (the same number 1843 returned when
-- the sheet is alone in it).
create or replace function public._partner_promo_left(g public.partner_promo_grants) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select b.credits_left from public._partner_promo_bucket_left(g.recipient_user_id, g.expires_at) b
                    where b.source = 'grant' and b.source_id = g.id), 0);
$$;

-- Takes back what is left of every granted sheet and top-up whose month is over, bucket by bucket,
-- never more than the free balance now. Each row books its own key as 1843 did:
-- partner_promo_expire:<sheet> or partner_promo_topup_expire:<top-up>, then `:<basis>` for what a
-- later pass (within a week of the expiry) takes back of refunds that landed since. A shortfall
-- is not chased from later free credits. Each bucket in its own subtransaction; a failed one is
-- returned row by row ({grant_id, error} for a sheet; {grant_id: 0, topup_id, error} for a
-- top-up) and retried by the next pass. `overdue`: rows more than an hour past their expiry still
-- not taken back after this pass.
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
     where g.status = 'granted' and g.expires_at <= now() and (g.expired_at is null or g.expires_at > now() - interval '7 days')
    union
    select t.recipient_user_id, t.expires_at from public.partner_promo_topups t
     where t.expires_at <= now() and (t.expired_at is null or t.expires_at > now() - interval '7 days')
    order by 2, 1
  loop
  begin
    perform from public.partner_promo_grants g
     where g.recipient_user_id = b.u and g.expires_at = b.e and g.status = 'granted' order by g.id for update;
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
                    where g.recipient_user_id = b.u and g.expires_at = b.e and g.status = 'granted'), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('grant_id', 0, 'topup_id', t.id, 'error', sqlerrm) order by t.id)
                    from public.partner_promo_topups t
                    where t.recipient_user_id = b.u and t.expires_at = b.e), '[]'::jsonb);
  end;
  end loop;
  return jsonb_build_object('expired', v_expired, 'taken', v_taken, 'failed', v_failed,
    'overdue', (select count(*) from public.partner_promo_grants
                 where status = 'granted' and expired_at is null and expires_at <= now() - interval '1 hour')::integer
             + (select count(*) from public.partner_promo_topups
                 where expired_at is null and expires_at <= now() - interval '1 hour')::integer);
end;
$$;
