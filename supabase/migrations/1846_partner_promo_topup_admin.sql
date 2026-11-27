-- An admin's ad-hoc top-up of a channel partner's promotion credits (ARCHITECTURE §6.5 渠道商推广积分
-- 「临时追加」, table of 1845). Only the service role may call it; p_actor is the signed-in admin from
-- the server session and is checked here.
--
-- Input {org_id, credits (1–100,000), reason (required, ≤ 500), request_key (uuid made by the form),
-- recipient and period (the owner and the UTC month the form showed)}. Returns {applied, reason?,
-- topup_id?, credits?, expires_at?}:
-- * a request_key already used returns {applied: false, reason: 'already'} and grants nothing
--   (a double submit); the same key for another org is IDEMPOTENCY_CONFLICT;
-- * a form whose owner or month is no longer current returns {applied: false, reason: 'changed'}
--   (stale form: the confirm dialog named someone else, or the month it would expire in is over);
-- * otherwise grants `credits` free credits to the owner's own account with the ledger key
--   partner_promo_topup:<id>, expiring at the end of the current UTC month, and audits it.
-- Refused: NOT_ADMIN, INVALID_INPUT, ORG_NOT_FOUND, PROMO_PARTNER_OFF (not a partner or suspended).
create function public.admin_partner_promo_topup(p_actor uuid, p_input jsonb) returns jsonb
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

  -- The org row serialises top-ups (and the monthly run and confirms) of one partner, so a second
  -- submit with the same key waits here and then finds the first one's row.
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

  insert into public.partner_promo_topups(org_id, period, recipient_user_id, credits, reason, request_key, created_by, expires_at)
    values (o.id, v_period, o.owner_user_id, v_credits, v_reason, v_key, p_actor,
      (v_month + interval '1 month')::timestamp at time zone 'UTC')
  returning * into t;
  perform public._apply_credit_change(t.recipient_user_id, 'free', 'partner_promo_topup', t.credits,
    'Channel partner promotion top-up ' || t.period, 'partner_promo_topup:' || t.id);
  perform public._org_audit(p_actor, 'partner_promo_topup', t.id::text,
    jsonb_build_object('org_id', t.org_id, 'period', t.period, 'recipient', t.recipient_user_id,
      'credits', t.credits, 'reason', t.reason, 'request_key', t.request_key)::text);
  return jsonb_build_object('applied', true, 'topup_id', t.id, 'credits', t.credits, 'expires_at', t.expires_at);
end;
$$;
revoke all on function public.admin_partner_promo_topup(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_topup(uuid, jsonb) to service_role;
