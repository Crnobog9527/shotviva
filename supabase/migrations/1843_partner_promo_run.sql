-- The monthly run of channel partner promotion grants (ARCHITECTURE §6.5 渠道商推广积分): month-end
-- expiry of last month's credits, then one pending sheet per partner for the new month. Called by
-- the cron route on the 1st (UTC) and by an admin's "generate now"; safe to repeat.

-- Takes back what is left of every granted sheet whose month is over. Promotion credits are taken
-- to be spent before the owner's other free credits (they are the ones that expire): what is left
-- is the grant minus the free-pool spending (reserve, less refund) booked between the grant and the
-- end of its month, never more than the free balance now. One ledger row per sheet
-- (partner_promo_expire:<sheet>), so a repeat takes nothing twice. Each sheet in its own
-- subtransaction; the ones that failed are returned and retried by the next run.
create function public._partner_promo_expire() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.partner_promo_grants;
  v_spent bigint;
  v_free integer;
  v_take integer;
  v_expired integer := 0;
  v_taken bigint := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  for g in select * from public.partner_promo_grants
            where status = 'granted' and expired_at is null and expires_at <= now() order by id loop
  begin
    select * into g from public.partner_promo_grants where id = g.id and expired_at is null for update;
    continue when not found;
    v_take := 0;
    if g.total > 0 then
      select free_credits into v_free from public.profiles where id = g.recipient_user_id for update;
      select coalesce(-sum(l.delta), 0) into v_spent from public.credit_ledger l
       where l.user_id = g.recipient_user_id and l.pool = 'free' and l.kind in ('reserve', 'refund')
         and l.created_at >= g.decided_at and l.created_at < g.expires_at;
      v_take := least(coalesce(v_free, 0), greatest(0, g.total - greatest(v_spent, 0)))::integer;
      if v_take > 0 then
        perform public._apply_credit_change(g.recipient_user_id, 'free', 'partner_promo_expire', -v_take,
          'Channel partner promotion credits expired ' || g.period, 'partner_promo_expire:' || g.id);
      end if;
    end if;
    update public.partner_promo_grants set expired_at = now(), expired_credits = v_take where id = g.id;
    v_expired := v_expired + 1;
    v_taken := v_taken + v_take;
  exception when others then
    v_failed := v_failed || jsonb_build_array(jsonb_build_object('grant_id', g.id, 'error', sqlerrm));
  end;
  end loop;
  return jsonb_build_object('expired', v_expired, 'taken', v_taken, 'failed', v_failed);
end;
$$;
revoke all on function public._partner_promo_expire() from public, anon, authenticated, service_role;

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
