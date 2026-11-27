-- The runs of channel partner promotion grants (ARCHITECTURE §6.5 渠道商推广积分): the daily expiry
-- pass (month-end expiry of granted credits) and the monthly run (one pending sheet per partner for
-- the new month, called on the 1st (UTC) and by an admin's "generate now"). Both safe to repeat.

-- What is left of a granted sheet's credits at the end of its month. Promotion credits are taken
-- to be spent before the owner's other free credits (they are the ones that expire): what is left
-- is the grant minus the free-pool reserves made between the grant and the expiry, each less the
-- refunds of that same job. A refund is paired with its reserve through the idempotency key
-- (`<job>:<anything>` belongs to `<job>:reserve`, as _org_held_follows_ledger pairs them) and counts
-- at the reserve's time, whenever it lands: a refund after the grant for a job reserved before it
-- frees nothing of the grant, and a job reserved before the expiry and refunded after it gives its
-- credits back to the grant (so they expire too).
create function public._partner_promo_left(g public.partner_promo_grants) returns integer
language sql stable security definer set search_path = '' as $$
  with reserves as (
    select r.idempotency_key, -r.delta as spent from public.credit_ledger r
     where r.user_id = g.recipient_user_id and r.pool = 'free' and r.kind = 'reserve'
       and r.created_at >= g.decided_at and r.created_at < g.expires_at
  ),
  refunds as (
    select regexp_replace(f.idempotency_key, ':[^:]+$', ':reserve') as reserve_key, sum(f.delta) as back
      from public.credit_ledger f
     where f.user_id = g.recipient_user_id and f.pool = 'free' and f.kind = 'refund' and f.created_at >= g.decided_at
     group by 1
  )
  select greatest(0, g.total - coalesce(sum(greatest(0, r.spent - least(r.spent, coalesce(f.back, 0)))), 0))::integer
    from reserves r left join refunds f on f.reserve_key = r.idempotency_key;
$$;
revoke all on function public._partner_promo_left(public.partner_promo_grants) from public, anon, authenticated, service_role;

-- Takes back what is left of every granted sheet whose month is over, never more than the free
-- balance now. The first pass books partner_promo_expire:<sheet>; for a week after the expiry each
-- later pass measures again and takes back only what refunds landed since (a job still running at
-- midnight), keyed partner_promo_expire:<sheet>:<basis>, so a repeat takes nothing twice. A
-- shortfall (credits spent after the expiry, before the pass) is not chased from later free credits.
-- Each sheet in its own subtransaction; the failed ones are returned and retried by the next pass.
-- `overdue`: sheets more than an hour past their expiry still not taken back after this pass.
create function public._partner_promo_expire() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.partner_promo_grants;
  v_left integer;
  v_free integer;
  v_take integer;
  v_key text;
  v_expired integer := 0;
  v_taken bigint := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  for g in select * from public.partner_promo_grants
            where status = 'granted' and expires_at <= now() and (expired_at is null or expires_at > now() - interval '7 days')
            order by id loop
  begin
    select * into g from public.partner_promo_grants where id = g.id for update;
    select free_credits into v_free from public.profiles where id = g.recipient_user_id for update;
    v_left := case when g.total > 0 then public._partner_promo_left(g) else 0 end;
    v_take := least(coalesce(v_free, 0), greatest(0, v_left - coalesce(g.expired_basis, 0)))::integer;
    v_key := 'partner_promo_expire:' || g.id || case when g.expired_at is null then '' else ':' || g.expired_basis end;
    if v_take > 0 then
      perform public._apply_credit_change(g.recipient_user_id, 'free', 'partner_promo_expire', -v_take,
        'Channel partner promotion credits expired ' || g.period, v_key);
    end if;
    if g.expired_at is null or v_left > g.expired_basis then
      update public.partner_promo_grants
         set expired_at = coalesce(expired_at, now()), expired_credits = coalesce(expired_credits, 0) + v_take,
             expired_basis = greatest(coalesce(expired_basis, 0), v_left)
       where id = g.id;
    end if;
    if g.expired_at is null then v_expired := v_expired + 1; end if;
    v_taken := v_taken + v_take;
  exception when others then
    v_failed := v_failed || jsonb_build_array(jsonb_build_object('grant_id', g.id, 'error', sqlerrm));
  end;
  end loop;
  return jsonb_build_object('expired', v_expired, 'taken', v_taken, 'failed', v_failed,
    'overdue', (select count(*) from public.partner_promo_grants
                 where status = 'granted' and expired_at is null and expires_at <= now() - interval '1 hour')::integer);
end;
$$;
revoke all on function public._partner_promo_expire() from public, anon, authenticated, service_role;

-- The daily expiry pass (cron at 00:00 UTC, so a month's credits stop being usable right at its end
-- rather than after the monthly run; daily also retries a failed pass and settles late refunds).
-- Returns {expired, taken, failed, overdue}; the route alerts on failed or overdue.
create function public.partner_promo_expire_run() returns jsonb
language sql security definer set search_path = '' as $$
  select public._partner_promo_expire();
$$;
revoke all on function public.partner_promo_expire_run() from public, anon, authenticated, service_role;
grant execute on function public.partner_promo_expire_run() to service_role;

-- The run for grant month p_period (`YYYY-MM`, the current UTC month): expires what is due, closes
-- sheets of earlier months nobody decided (status lapsed: their month is over, nothing can be
-- granted for it any more), then computes or refreshes the sheet of every active partner. Each
-- org in its own subtransaction; failures are returned (the route logs them and answers 500, and
-- a re-run fills in whoever was missed). Returns {period, expired, taken, lapsed, sheets, pending,
-- failed_orgs, failed_expiries}.
create function public.partner_promo_run(p_period text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_expiry jsonb;
  v_lapsed integer;
  v_sheets integer := 0;
  v_failed jsonb := '[]'::jsonb;
  o record;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  v_expiry := public._partner_promo_expire();
  with closed as (
    update public.partner_promo_grants set status = 'lapsed', decided_at = now(), decision_note = 'not decided before the month ended'
     where status = 'pending' and expires_at <= now() returning 1
  ) select count(*) into v_lapsed from closed;
  for o in select id from public.orgs where promo_partner and status = 'active' order by created_at, id loop
  begin
    if public._partner_promo_refresh(o.id, p_period) is not null then v_sheets := v_sheets + 1; end if;
  exception when others then
    v_failed := v_failed || jsonb_build_array(jsonb_build_object('org_id', o.id, 'error', sqlerrm));
  end;
  end loop;
  return jsonb_build_object('period', p_period, 'expired', v_expiry->'expired', 'taken', v_expiry->'taken',
    'lapsed', v_lapsed, 'sheets', v_sheets,
    'pending', (select count(*) from public.partner_promo_grants where status = 'pending')::integer,
    'failed_orgs', v_failed, 'failed_expiries', v_expiry->'failed');
end;
$$;
revoke all on function public.partner_promo_run(text) from public, anon, authenticated, service_role;
grant execute on function public.partner_promo_run(text) to service_role;

-- An admin's "generate now" (a missed cron, a partner marked mid-month, the test site): the same
-- run for the current UTC month, audited.
create function public.admin_partner_promo_run(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public._org_require_admin(p_actor);
  v_result := public.partner_promo_run(to_char(now() at time zone 'UTC', 'YYYY-MM'));
  perform public._org_audit(p_actor, 'partner_promo_run', v_result->>'period',
    (v_result - 'failed_orgs' - 'failed_expiries')::text);
  return v_result;
end;
$$;
revoke all on function public.admin_partner_promo_run(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_run(uuid) to service_role;
