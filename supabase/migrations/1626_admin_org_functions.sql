-- Platform admin functions for enterprise orgs (ARCHITECTURE §6.5). All take p_actor (the
-- signed-in admin, from the server session) and check inside that it is an unbanned admin; all
-- write admin_audit_log. Only the service role may call them.

create or replace function public._org_require_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null or not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
end;
$$;
revoke all on function public._org_require_admin(uuid) from public, anon, authenticated, service_role;

create or replace function public._org_audit(p_actor uuid, p_action text, p_target text, p_reason text) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit_log(action, user_id, target_id, reason) values (p_action, p_actor, p_target, p_reason);
$$;
revoke all on function public._org_audit(uuid, text, text, text) from public, anon, authenticated, service_role;

-- Usage values in an admin form: whole numbers, at least 1 (multi_template_max at least 0), at
-- most the site-wide cap (system_settings.org_limit_caps); a null clears the lift. Only the keys
-- present are checked, so editing the name of an org saved under a higher, since-lowered cap
-- still works (effective_limits clamps the old value anyway).
create or replace function public._org_check_limits(p_input jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  caps jsonb := coalesce((select s.value from public.system_settings s where s.key = 'org_limit_caps'), '{}'::jsonb);
  k text;
  v numeric;
begin
  foreach k in array array['concurrency','per_window','batch_max','multi_template_max'] loop
    continue when not (p_input ? k) or jsonb_typeof(p_input->k) = 'null';
    if jsonb_typeof(p_input->k) <> 'number' then raise exception 'INVALID_INPUT' using detail = k; end if;
    v := (p_input->>k)::numeric;
    if v <> trunc(v) or v < (case when k = 'multi_template_max' then 0 else 1 end) then
      raise exception 'INVALID_INPUT' using detail = k;
    end if;
    if v > coalesce((caps->>k)::numeric, 0) then raise exception 'ORG_LIMIT_ABOVE_CAP' using detail = k; end if;
  end loop;
  foreach k in array array['batch_zip','early_features','affiliate_enabled'] loop
    if p_input ? k and jsonb_typeof(p_input->k) <> 'boolean' then raise exception 'INVALID_INPUT' using detail = k; end if;
  end loop;
end;
$$;
revoke all on function public._org_check_limits(jsonb) from public, anon, authenticated, service_role;

-- New org for an existing account, which becomes its owner and first member. The account must
-- not be banned and not an active member of any org.
create or replace function public.admin_org_create(p_actor uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (p_input->>'owner_user_id')::uuid;
  v_org public.orgs;
begin
  perform public._org_require_admin(p_actor);
  perform public._org_check_limits(p_input);
  if v_owner is null or nullif(trim(p_input->>'name'), '') is null
     or (p_input ? 'affiliate_levels' and coalesce(p_input->>'affiliate_levels', '') not in ('1','2')) then
    raise exception 'INVALID_INPUT';
  end if;
  perform 1 from public.profiles where id = v_owner and banned_at is null for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if exists(select from public.org_members where user_id = v_owner and status = 'active')
     or exists(select from public.orgs where owner_user_id = v_owner) then
    raise exception 'ORG_MEMBER_EXISTS';
  end if;
  insert into public.orgs(name, owner_user_id, concurrency, per_window, batch_max, multi_template_max,
      batch_zip, early_features, affiliate_enabled, affiliate_levels, admin_note, created_by)
    values (trim(p_input->>'name'), v_owner, (p_input->>'concurrency')::integer, (p_input->>'per_window')::integer,
      (p_input->>'batch_max')::integer, (p_input->>'multi_template_max')::integer,
      coalesce((p_input->>'batch_zip')::boolean, false), coalesce((p_input->>'early_features')::boolean, false),
      coalesce((p_input->>'affiliate_enabled')::boolean, false), coalesce((p_input->>'affiliate_levels')::smallint, 1),
      nullif(trim(p_input->>'admin_note'), ''), p_actor)
    returning * into v_org;
  insert into public.org_members(org_id, user_id, role) values (v_org.id, v_owner, 'owner');
  perform public._org_audit(p_actor, 'org_create', v_org.id::text, 'owner:' || v_owner::text);
  return v_org.id;
end;
$$;
revoke all on function public.admin_org_create(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_create(uuid, jsonb) to service_role;

-- Edit an org. Only the keys present change; a usage key set to null clears that lift.
-- rotate_invite=true issues a new invite token (old links stop working). expected_updated_at
-- rejects a stale form; the new updated_at is returned for the next save. Suspending keeps members and pool as they are but lifts nothing
-- (effective_limits) and blocks the owner's pool actions until it is active again.
create or replace function public.admin_org_update(p_actor uuid, p_org_id uuid, p_input jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
begin
  perform public._org_require_admin(p_actor);
  perform public._org_check_limits(p_input);
  select * into o from public.orgs where id = p_org_id for update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if p_input ? 'expected_updated_at' and (p_input->>'expected_updated_at')::timestamptz is distinct from o.updated_at then
    raise exception 'ORG_CHANGED';
  end if;
  if (p_input ? 'name' and nullif(trim(p_input->>'name'), '') is null)
     or (p_input ? 'status' and coalesce(p_input->>'status', '') not in ('active','suspended'))
     or (p_input ? 'affiliate_levels' and coalesce(p_input->>'affiliate_levels', '') not in ('1','2')) then
    raise exception 'INVALID_INPUT';
  end if;
  update public.orgs set
    name = case when p_input ? 'name' then trim(p_input->>'name') else name end,
    status = case when p_input ? 'status' then p_input->>'status' else status end,
    concurrency = case when p_input ? 'concurrency' then (p_input->>'concurrency')::integer else concurrency end,
    per_window = case when p_input ? 'per_window' then (p_input->>'per_window')::integer else per_window end,
    batch_max = case when p_input ? 'batch_max' then (p_input->>'batch_max')::integer else batch_max end,
    multi_template_max = case when p_input ? 'multi_template_max' then (p_input->>'multi_template_max')::integer else multi_template_max end,
    batch_zip = coalesce((p_input->>'batch_zip')::boolean, batch_zip),
    early_features = coalesce((p_input->>'early_features')::boolean, early_features),
    affiliate_enabled = coalesce((p_input->>'affiliate_enabled')::boolean, affiliate_enabled),
    affiliate_levels = coalesce((p_input->>'affiliate_levels')::smallint, affiliate_levels),
    admin_note = case when p_input ? 'admin_note' then nullif(trim(p_input->>'admin_note'), '') else admin_note end,
    invite_token = case when coalesce((p_input->>'rotate_invite')::boolean, false)
      then replace(gen_random_uuid()::text, '-', '') else invite_token end,
    updated_at = now()
  where id = p_org_id
  returning * into o;
  perform public._org_audit(p_actor, 'org_update', p_org_id::text, (p_input - 'expected_updated_at')::text);
  return o.updated_at;
end;
$$;
revoke all on function public.admin_org_update(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_update(uuid, uuid, jsonb) to service_role;

-- Credits into (or, for a correction, out of) an org pool. kind 'bank_grant' (default): an
-- offline payment received; credits default to the package's, amount_cny_fen is the CNY
-- actually received (reference only). kind 'admin_adjust': a correction of a mistaken entry,
-- positive or negative, note required; the pool never goes below 0. Pool credits are never
-- refunded (Owner 2026-11-21). request_id makes a repeat do nothing; a different request under
-- the same id is IDEMPOTENCY_CONFLICT.
create or replace function public.admin_org_grant(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := coalesce(p_input->>'kind', 'bank_grant');
  v_org uuid := (p_input->>'org_id')::uuid;
  v_request text := nullif(trim(p_input->>'request_id'), '');
  v_package public.org_packages;
  v_credits bigint := (p_input->>'credits')::bigint;
  v_cny bigint := (p_input->>'amount_cny_fen')::bigint;
  v_note text := nullif(trim(p_input->>'note'), '');
  o public.orgs;
  prior public.org_credit_ledger;
begin
  perform public._org_require_admin(p_actor);
  -- `org_topup:` ids belong to org_monthly_topup.
  if v_kind not in ('bank_grant','admin_adjust') or v_org is null or v_request is null or starts_with(v_request, 'org_topup:') then
    raise exception 'INVALID_INPUT';
  end if;
  if p_input ? 'package_id' and jsonb_typeof(p_input->'package_id') <> 'null' then
    select * into v_package from public.org_packages where id = (p_input->>'package_id')::uuid;
    if not found then raise exception 'ORG_PACKAGE_NOT_FOUND'; end if;
  end if;
  if v_kind = 'bank_grant' then
    v_credits := coalesce(v_credits, v_package.credits);
    if v_credits is null or v_credits <= 0 or v_cny < 0 then raise exception 'INVALID_INPUT'; end if;
  elsif v_credits is null or v_credits = 0 or v_note is null or v_cny is not null then
    raise exception 'INVALID_INPUT';
  end if;
  select * into o from public.orgs where id = v_org for update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  select * into prior from public.org_credit_ledger where request_id = v_request;
  if found then
    if prior.org_id <> v_org or prior.kind <> v_kind or prior.delta <> v_credits
       or prior.package_id is distinct from v_package.id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('applied', false, 'pool_credits', o.pool_credits);
  end if;
  if o.pool_credits + v_credits < 0 then raise exception 'ORG_POOL_INSUFFICIENT'; end if;
  update public.orgs set pool_credits = pool_credits + v_credits, updated_at = now() where id = v_org returning * into o;
  insert into public.org_credit_ledger(org_id, kind, delta, pool_after, package_id, request_id, amount_cny_fen, reference, note, actor)
    values (v_org, v_kind, v_credits, o.pool_credits, v_package.id, v_request, v_cny,
      nullif(trim(p_input->>'reference'), ''), v_note, p_actor);
  perform public._org_audit(p_actor, 'org_grant', v_org::text, v_kind || ':' || v_credits || ':' || v_request);
  return jsonb_build_object('applied', true, 'pool_credits', o.pool_credits);
end;
$$;
revoke all on function public.admin_org_grant(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_grant(uuid, jsonb) to service_role;

-- Add (no id) or edit a package. USD price and credits as entered; no FX maths. Packages are
-- never deleted (grants reference them); active=false hides one.
create or replace function public.admin_org_package_save(p_actor uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_input->>'id')::uuid;
  v_old public.org_packages;
  v_new public.org_packages;
begin
  perform public._org_require_admin(p_actor);
  if nullif(trim(p_input->>'name'), '') is null
     or jsonb_typeof(p_input->'price_usd_cents') is distinct from 'number' or jsonb_typeof(p_input->'credits') is distinct from 'number'
     or (p_input->>'price_usd_cents')::numeric <> trunc((p_input->>'price_usd_cents')::numeric)
     or (p_input->>'credits')::numeric <> trunc((p_input->>'credits')::numeric)
     or (p_input->>'price_usd_cents')::numeric < 1 or (p_input->>'credits')::numeric < 1 then
    raise exception 'INVALID_INPUT';
  end if;
  if v_id is null then
    insert into public.org_packages(name, price_usd_cents, credits, active, sort, created_by, updated_by)
      values (trim(p_input->>'name'), (p_input->>'price_usd_cents')::bigint, (p_input->>'credits')::integer,
        coalesce((p_input->>'active')::boolean, true), coalesce((p_input->>'sort')::integer, 0), p_actor, p_actor)
      returning * into v_new;
  else
    select * into v_old from public.org_packages where id = v_id for update;
    if not found then raise exception 'ORG_PACKAGE_NOT_FOUND'; end if;
    if p_input ? 'expected_updated_at' and (p_input->>'expected_updated_at')::timestamptz is distinct from v_old.updated_at then
      raise exception 'ORG_CHANGED';
    end if;
    update public.org_packages set name = trim(p_input->>'name'), price_usd_cents = (p_input->>'price_usd_cents')::bigint,
        credits = (p_input->>'credits')::integer, active = coalesce((p_input->>'active')::boolean, v_old.active),
        sort = coalesce((p_input->>'sort')::integer, v_old.sort), updated_at = now(), updated_by = p_actor
      where id = v_id returning * into v_new;
  end if;
  perform public._org_audit(p_actor, 'org_package_save', v_new.id::text,
    jsonb_build_object('before', case when v_old.id is not null then to_jsonb(v_old) - 'created_by' - 'updated_by' end,
      'after', to_jsonb(v_new) - 'created_by' - 'updated_by')::text);
  return v_new.id;
end;
$$;
revoke all on function public.admin_org_package_save(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_package_save(uuid, jsonb) to service_role;
