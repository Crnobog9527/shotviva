-- Channel partner promotion credits go into the enterprise's promo pool (ARCHITECTURE §6.5 渠道商推广
-- 积分 / 企业推广积分池, the Owner 2026-11-22), no longer into the owner's own free pool.
--
-- * A confirmed monthly sheet and an ad-hoc top-up put their credits into orgs.promo_pool_credits
--   (org ledger promo_grant, keys partner_promo:<sheet> / partner_promo_topup:<id>), expiring at the
--   end of the UTC month, and hand out the members' promotion allowances. Their rows say
--   destination = 'org'. The sheet itself (base, bonus, clawback deducted from the next sheet) is
--   computed exactly as before.
-- * The month-end expiry of those credits, the legacy owner-pool bucket and the 企业联盟 card are
--   re-created in 1921, after 1920 (voided sheets) re-created them from their 1847/1849 bodies.
--
-- create or replace with the same signatures and answers; the routes and pages call them as before.

-- Confirm (1842) now grants into the org's promo pool. Everything before the grant is unchanged.
create or replace function public._partner_promo_confirm(p_actor uuid, g public.partner_promo_grants, p_fingerprint text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_calc jsonb;
begin
  if now() >= g.expires_at then raise exception 'PROMO_GRANT_EXPIRED'; end if;
  select * into o from public.orgs where id = g.org_id;
  if not o.promo_partner or o.status <> 'active' then raise exception 'PROMO_PARTNER_OFF'; end if;
  v_calc := public._partner_promo_calc(g.org_id, g.period);
  if v_calc->>'fingerprint' <> g.fingerprint then
    perform public._partner_promo_store(v_calc);
    return jsonb_build_object('applied', false, 'reason', 'changed', 'grant_id', g.id, 'total', (v_calc->>'total')::integer);
  end if;
  if p_fingerprint is distinct from g.fingerprint then
    return jsonb_build_object('applied', false, 'reason', 'changed', 'grant_id', g.id, 'total', g.total);
  end if;
  if g.total > 0 then
    perform public._org_promo_grant(g.org_id, g.total, g.expires_at, 'partner_promo:' || g.id,
      'Channel partner promotion credits ' || g.period, p_actor);
  end if;
  insert into public.partner_promo_clawbacks(source_grant_id, applied_grant_id, credits)
    select x.grant_id, g.id, x.applied from jsonb_to_recordset(v_calc->'sources') as x(grant_id bigint, applied integer)
     where x.applied > 0;
  update public.partner_promo_grants set status = 'granted', decided_at = now(), decided_by = p_actor, destination = 'org'
   where id = g.id;
  perform public._org_audit(p_actor, 'partner_promo_confirm', g.id::text,
    jsonb_build_object('org_id', g.org_id, 'period', g.period, 'destination', 'org', 'base', g.base,
      'bonus', g.bonus, 'clawback_applied', g.clawback_applied, 'total', g.total, 'fingerprint', g.fingerprint)::text);
  return jsonb_build_object('applied', true, 'grant_id', g.id, 'total', g.total);
end;
$$;

-- Ad-hoc top-up (1846) now grants into the org's promo pool. Input, checks and answers unchanged.
create or replace function public.admin_partner_promo_topup(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_reason text := btrim(p_input->>'reason');
  v_credits integer;
  v_key uuid;
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_period text;
  o public.orgs;
  t public.partner_promo_topups;
begin
  perform public._org_require_admin(p_actor);
  if jsonb_typeof(p_input) is distinct from 'object'
     or coalesce(lower(p_input->>'org_id'), '') !~ v_uuid or coalesce(lower(p_input->>'request_key'), '') !~ v_uuid
     or coalesce(lower(p_input->>'recipient'), '') !~ v_uuid
     or coalesce(p_input->>'period', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     or coalesce(p_input->>'credits', '') !~ '^[1-9][0-9]{0,5}$'
     or v_reason is null or v_reason = '' or length(v_reason) > 500 then
    raise exception 'INVALID_INPUT';
  end if;
  v_credits := (p_input->>'credits')::integer;
  if v_credits > 100000 then raise exception 'INVALID_INPUT'; end if;
  v_key := (p_input->>'request_key')::uuid;
  v_period := to_char(v_month, 'YYYY-MM');

  select * into o from public.orgs where id = (p_input->>'org_id')::uuid for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  select * into t from public.partner_promo_topups where request_key = v_key;
  if found then
    if t.org_id <> o.id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('applied', false, 'reason', 'already', 'topup_id', t.id, 'credits', t.credits);
  end if;
  if not o.promo_partner or o.status <> 'active' then raise exception 'PROMO_PARTNER_OFF'; end if;
  if (p_input->>'recipient')::uuid <> o.owner_user_id or p_input->>'period' <> v_period then
    return jsonb_build_object('applied', false, 'reason', 'changed');
  end if;

  insert into public.partner_promo_topups(org_id, period, recipient_user_id, credits, reason, request_key, created_by, expires_at, destination)
    values (o.id, v_period, o.owner_user_id, v_credits, v_reason, v_key, p_actor,
      (v_month + interval '1 month')::timestamp at time zone 'UTC', 'org')
  returning * into t;
  perform public._org_promo_grant(o.id, t.credits, t.expires_at, 'partner_promo_topup:' || t.id,
    'Channel partner promotion top-up ' || t.period, p_actor);
  perform public._org_audit(p_actor, 'partner_promo_topup', t.id::text,
    jsonb_build_object('org_id', t.org_id, 'period', t.period, 'destination', 'org',
      'credits', t.credits, 'reason', t.reason, 'request_key', t.request_key)::text);
  return jsonb_build_object('applied', true, 'topup_id', t.id, 'credits', t.credits, 'expires_at', t.expires_at);
end;
$$;
