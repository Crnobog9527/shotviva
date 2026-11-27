-- Channel partner promotion grants, admin side (ARCHITECTURE §6.5 渠道商推广积分). Every function
-- takes p_actor (the signed-in admin, from the server session) and checks it; every decision is
-- audited. Only the service role may call them.

-- Writes the computed sheet (1841 _partner_promo_calc) for its org and month: inserts it, or
-- refreshes it while still pending. A decided sheet is never touched (returns null). Its lines are
-- rewritten with it.
create function public._partner_promo_store(p_calc jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.partner_promo_grants as g (org_id, period, recipient_user_id, base, bonus, raw_credits, counted_credits,
      customer_cap, customers, capped_customers, clawback_owed, clawback_applied, total, detail, fingerprint, expires_at)
    values ((p_calc->>'org_id')::uuid, p_calc->>'period', (p_calc->>'recipient')::uuid, (p_calc->>'base')::integer,
      (p_calc->>'bonus')::integer, (p_calc->>'raw')::bigint, (p_calc->>'counted')::bigint, (p_calc->>'cap')::bigint,
      (p_calc->>'customers')::integer, (p_calc->>'capped_customers')::integer, (p_calc->>'clawback_owed')::integer,
      (p_calc->>'clawback_applied')::integer, (p_calc->>'total')::integer,
      jsonb_build_object('per', p_calc->'per', 'sources', p_calc->'sources', 'bonus_bp', p_calc->'bonus_bp',
        'customer_cap_bp', p_calc->'customer_cap_bp', 'min_customers', p_calc->'min_customers',
        'window_start', p_calc->'window_start', 'window_end', p_calc->'window_end'),
      p_calc->>'fingerprint', (p_calc->>'expires_at')::timestamptz)
  on conflict (org_id, period) do update set recipient_user_id = excluded.recipient_user_id, base = excluded.base,
      bonus = excluded.bonus, raw_credits = excluded.raw_credits, counted_credits = excluded.counted_credits,
      customer_cap = excluded.customer_cap, customers = excluded.customers, capped_customers = excluded.capped_customers,
      clawback_owed = excluded.clawback_owed, clawback_applied = excluded.clawback_applied, total = excluded.total,
      detail = excluded.detail, fingerprint = excluded.fingerprint, expires_at = excluded.expires_at, computed_at = now()
    where g.status = 'pending'
  returning id into v_id;
  if v_id is null then return null; end if;
  delete from public.partner_promo_grant_lines where grant_id = v_id;
  insert into public.partner_promo_grant_lines(grant_id, payment_id, customer_user_id, credits, confirmed_at)
    select v_id, x.payment_id, x.customer, x.credits, x.confirmed_at
      from jsonb_to_recordset(p_calc->'lines') as x(payment_id bigint, customer uuid, credits integer, confirmed_at timestamptz);
  return v_id;
end;
$$;
revoke all on function public._partner_promo_store(jsonb) from public, anon, authenticated, service_role;

-- Recomputes one partner's sheet for a month, holding the org row so a confirm of the same org
-- (which holds it too) never interleaves with it. Returns the sheet id, or null if it is decided.
create function public._partner_promo_refresh(p_org uuid, p_period text) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  perform from public.orgs where id = p_org for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  return public._partner_promo_store(public._partner_promo_calc(p_org, p_period));
end;
$$;
revoke all on function public._partner_promo_refresh(uuid, text) from public, anon, authenticated, service_role;

-- Marks or unmarks an org as a channel partner: {org_id, on}. Only an org whose affiliate switch
-- is on (it has the org account the commissions are counted from) can be marked. Unmarking stops
-- new monthly sheets; a sheet already pending can still be rejected but no longer confirmed.
-- Returns the new value.
create function public.admin_partner_promo_set(p_actor uuid, p_input jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := (p_input->>'org_id')::uuid;
  v_on boolean := (p_input->>'on')::boolean;
  o public.orgs;
begin
  perform public._org_require_admin(p_actor);
  if v_org is null or v_on is null then raise exception 'INVALID_INPUT'; end if;
  select * into o from public.orgs where id = v_org for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if v_on and not (o.affiliate_enabled and exists(select from public.affiliates a where a.org_id = o.id)) then
    raise exception 'PROMO_PARTNER_NEEDS_AFFILIATE';
  end if;
  if o.promo_partner is distinct from v_on then
    update public.orgs set promo_partner = v_on, updated_at = now() where id = o.id;
    perform public._org_audit(p_actor, 'partner_promo_set', o.id::text,
      jsonb_build_object('promo_partner', jsonb_build_object('before', o.promo_partner, 'after', v_on))::text);
  end if;
  return v_on;
end;
$$;
revoke all on function public.admin_partner_promo_set(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_set(uuid, jsonb) to service_role;

-- Confirms a pending sheet: recomputes it first and, if anything changed since it was shown (its
-- stored fingerprint, or the fingerprint the page sent), stores the new numbers and returns
-- {applied: false, reason: 'changed'} without granting, so the admin reviews the new sheet.
-- Otherwise grants `total` free credits to the org owner's own account (never the org pool) with
-- the idempotency key partner_promo:<sheet>, books the clawback it applied against its sources,
-- freezes the sheet and audits it. A second confirm returns {applied: false, reason: 'already'}.
create function public._partner_promo_confirm(p_actor uuid, g public.partner_promo_grants, p_fingerprint text)
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
    perform public._apply_credit_change(g.recipient_user_id, 'free', 'partner_promo', g.total,
      'Channel partner promotion credits ' || g.period, 'partner_promo:' || g.id);
  end if;
  insert into public.partner_promo_clawbacks(source_grant_id, applied_grant_id, credits)
    select x.grant_id, g.id, x.applied from jsonb_to_recordset(v_calc->'sources') as x(grant_id bigint, applied integer)
     where x.applied > 0;
  update public.partner_promo_grants set status = 'granted', decided_at = now(), decided_by = p_actor where id = g.id;
  perform public._org_audit(p_actor, 'partner_promo_confirm', g.id::text,
    jsonb_build_object('org_id', g.org_id, 'period', g.period, 'recipient', g.recipient_user_id, 'base', g.base,
      'bonus', g.bonus, 'clawback_applied', g.clawback_applied, 'total', g.total, 'fingerprint', g.fingerprint)::text);
  return jsonb_build_object('applied', true, 'grant_id', g.id, 'total', g.total);
end;
$$;
revoke all on function public._partner_promo_confirm(uuid, public.partner_promo_grants, text) from public, anon, authenticated, service_role;

-- One admin decision on a sheet: {grant_id, decision: confirm | reject | recompute, fingerprint
-- (confirm: what the page showed), note (reject, required)}. Returns {applied, reason?, grant_id,
-- total?}. reject: nothing is granted this month (what earlier months owe stays owed). recompute:
-- refreshes a pending sheet (reason 'decided' once it is decided). Refused: PROMO_GRANT_NOT_FOUND,
-- PROMO_GRANT_DECIDED (confirm/reject of a sheet decided the other way, or lapsed),
-- PROMO_GRANT_EXPIRED (its month is over), PROMO_PARTNER_OFF, INVALID_INPUT.
create function public.admin_partner_promo_decide(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_decision text := p_input->>'decision';
  v_note text := nullif(trim(p_input->>'note'), '');
  g public.partner_promo_grants;
begin
  perform public._org_require_admin(p_actor);
  if jsonb_typeof(p_input) is distinct from 'object' or coalesce(p_input->>'grant_id', '') !~ '^[1-9][0-9]{0,17}$'
     or v_decision is null or v_decision not in ('confirm', 'reject', 'recompute')
     or (v_decision = 'reject' and (v_note is null or length(v_note) > 500)) then
    raise exception 'INVALID_INPUT';
  end if;
  v_id := (p_input->>'grant_id')::bigint;
  select * into g from public.partner_promo_grants where id = v_id;
  if not found then raise exception 'PROMO_GRANT_NOT_FOUND'; end if;
  -- Same lock order as the monthly run: the org first, then its sheet.
  perform from public.orgs where id = g.org_id for no key update;
  select * into g from public.partner_promo_grants where id = v_id for update;

  if v_decision = 'recompute' then
    if g.status <> 'pending' then return jsonb_build_object('applied', false, 'reason', 'decided', 'grant_id', g.id); end if;
    perform public._partner_promo_store(public._partner_promo_calc(g.org_id, g.period));
    return jsonb_build_object('applied', true, 'grant_id', g.id);
  end if;
  if (v_decision = 'confirm' and g.status = 'granted') or (v_decision = 'reject' and g.status = 'rejected') then
    return jsonb_build_object('applied', false, 'reason', 'already', 'grant_id', g.id);
  end if;
  if g.status <> 'pending' then raise exception 'PROMO_GRANT_DECIDED'; end if;
  if v_decision = 'confirm' then return public._partner_promo_confirm(p_actor, g, p_input->>'fingerprint'); end if;

  update public.partner_promo_grants set status = 'rejected', decided_at = now(), decided_by = p_actor, decision_note = v_note
   where id = g.id;
  perform public._org_audit(p_actor, 'partner_promo_reject', g.id::text,
    jsonb_build_object('org_id', g.org_id, 'period', g.period, 'total', g.total, 'note', v_note)::text);
  return jsonb_build_object('applied', true, 'grant_id', g.id);
end;
$$;
revoke all on function public.admin_partner_promo_decide(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_decide(uuid, jsonb) to service_role;
