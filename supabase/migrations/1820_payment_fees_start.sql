-- Go-live of commissions net of fees (ARCHITECTURE §6.2 订单手续费 · 上线; the Owner, plan §5.1):
-- one admin action sets payment_fee_settings.record_from to now and the affiliate terms to the
-- version that describes the new formula, in one transaction, so the two never disagree.
-- One-way: once record_from is set it is never cleared or moved by this function (an earlier
-- start would put fees on payments made under the old terms). Audited.

-- The audit log gains the action, keeping every action already allowed (read from the constraint
-- as it is, so an action another migration added is never dropped).
do $$
declare
  v_actions text[];
begin
  select array_agg(m[1] order by ord) into v_actions
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.admin_audit_log'::regclass and c.conname = 'admin_audit_log_action_check';
  if v_actions is null or cardinality(v_actions) < 10 then
    raise exception 'admin_audit_log_action_check not found or unreadable';
  end if;
  if not 'payment_fees_start' = any(v_actions) then
    v_actions := array_append(v_actions, 'payment_fees_start');
  end if;
  execute 'alter table public.admin_audit_log drop constraint admin_audit_log_action_check';
  -- Same shape as every earlier version (action in ('…', …)), so the next migration reads it alike.
  execute 'alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in ('
    || (select string_agg(quote_literal(a), ',' order by o) from unnest(v_actions) with ordinality u(a, o)) || '))';
end;
$$;

-- p_input: terms_version (the published version to switch to; the server passes the latest),
-- expected_record_from (what the form showed: null while not started) and expected_terms_version.
-- Returns {applied, reason?, record_from, terms_version}. Not applied: 'already' (started before
-- with these same terms: a second click or a replay). Refused: PAYMENT_FEES_ALREADY_STARTED
-- (started, other terms asked for), PAYMENT_FEES_START_CHANGED (the page was out of date).
create function public.admin_payment_fees_start(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_terms text := trim(p_input->>'terms_version');
  v_expected_terms text := p_input->>'expected_terms_version';
  v_expected_from timestamptz := nullif(p_input->>'expected_record_from', '')::timestamptz;
  v_from timestamptz;
  v_old_terms text;
  v_now timestamptz := now();
begin
  perform public._affiliate_require_admin(p_actor);
  if jsonb_typeof(p_input) is distinct from 'object' or v_terms is null or v_terms !~ '^\d{4}-\d{2}-\d{2}$'
     or v_expected_terms is null then
    raise exception 'INVALID_INPUT' using detail = 'admin_payment_fees_start: terms_version and expected values';
  end if;
  select record_from into v_from from public.payment_fee_settings where singleton for update;
  select terms_version into v_old_terms from public.affiliate_settings where singleton for update;
  if v_from is not null then
    if v_old_terms = v_terms then
      return jsonb_build_object('applied', false, 'reason', 'already', 'record_from', v_from, 'terms_version', v_old_terms);
    end if;
    raise exception 'PAYMENT_FEES_ALREADY_STARTED';
  end if;
  if v_expected_from is not null or v_expected_terms is distinct from v_old_terms then
    raise exception 'PAYMENT_FEES_START_CHANGED';
  end if;
  update public.payment_fee_settings set record_from = v_now, updated_at = v_now where singleton;
  update public.affiliate_settings set terms_version = v_terms where singleton;
  insert into public.admin_audit_log (action, user_id, target_id, reason)
    values ('payment_fees_start', p_actor, 'payment_fee_settings',
      jsonb_build_object('record_from', jsonb_build_object('before', null, 'after', v_now),
                         'terms_version', jsonb_build_object('before', v_old_terms, 'after', v_terms))::text);
  return jsonb_build_object('applied', true, 'record_from', v_now, 'terms_version', v_terms);
end;
$$;
revoke all on function public.admin_payment_fees_start(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_payment_fees_start(uuid,jsonb) to service_role;

-- The affiliate settings form no longer moves the terms: it used to write terms_version back on
-- every save, so a settings page opened before the go-live and saved after it put the old terms
-- back (and took any string). Terms now move only through admin_payment_fees_start (or a future
-- path of their own). Same signature as 1045; a terms_version still sent by a form rendered before
-- this deploy is ignored rather than refused, so that code keeps working. Otherwise as 1045.
create or replace function public.admin_affiliate_settings(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  update public.affiliate_settings set enabled=coalesce((p_input->>'enabled')::boolean,enabled),
    commission_months=case when p_input ? 'commission_months' then (p_input->>'commission_months')::integer else commission_months end,
    hold_days=coalesce((p_input->>'hold_days')::integer,hold_days),
    payout_min_usd=coalesce((p_input->>'payout_min_usd')::bigint,payout_min_usd),
    settlement_day=coalesce((p_input->>'settlement_day')::integer,settlement_day),
    apply_min_level=coalesce(p_input->>'apply_min_level',apply_min_level) where singleton;
  insert into public.affiliate_rates(product_kind,l1_bp,l2_bp)
    select r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_input->'rates') r(product_kind text,l1_bp integer,l2_bp integer)
    on conflict(product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
  perform public._affiliate_audit(p_actor,'settings','settings',(p_input - 'terms_version')::text);
end;
$$;
