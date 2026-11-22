-- One-off move of this month's promotion credits from the org owner's own free pool into the org's
-- promo pool (ARCHITECTURE §6.5 企业推广积分池「迁移旧发放」, the Owner 2026-11-22). Grants confirmed
-- before 1894 went to the owner's account; an admin moves what is still unspent of the current
-- month's ones with an explicit click (never automatically, never by hand-written SQL).
--
-- What is moved is measured as the month-end expiry would measure it (1921 bucket: promotion
-- credits are spent first), only for this org's rows of the current UTC month still in an owner's
-- pool, and taken from the account each row was granted to (recipient_user_id, not today's owner:
-- the owner may have changed since), never more than that account's free balance outside what it
-- holds of the org's promotion share. Those rows are marked moved (moved_at, moved_credits); from
-- then on the bucket (1921) gives a moved row only what refunds landing after the move give back of
-- reserves made before it, so the month-end pass takes exactly that (basis 0), never the moved
-- credits a second time, and spending after the move cannot hide such a refund. Only the service
-- role may call these.

-- This org's moveable rows: {period, credits, recipients: [{user, credits}], rows: [{source, id, user, left}]}. Read only.
create function public._partner_promo_moveable(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orgs;
  v_period text := public._utc_period(now());
  v_rows jsonb;
  v_recipients jsonb;
  v_sum bigint;
begin
  select * into o from public.orgs where id = p_org;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  with mine as (
    select 'grant' as source, g.id, g.recipient_user_id as u, g.expires_at as e from public.partner_promo_grants g
     where g.org_id = p_org and g.period = v_period and g.status = 'granted' and g.voided_at is null and g.destination = 'owner'
       and g.moved_at is null and g.expired_at is null and g.expires_at > now()
    union all
    select 'topup', t.id, t.recipient_user_id, t.expires_at from public.partner_promo_topups t
     where t.org_id = p_org and t.period = v_period and t.destination = 'owner'
       and t.moved_at is null and t.expired_at is null and t.expires_at > now()
  ),
  buckets as (select distinct u, e from mine),
  lefts as (
    select l.source, l.source_id, l.credits_left, b.u from buckets b cross join lateral public._partner_promo_bucket_left(b.u, b.e) l
  )
  select coalesce(jsonb_agg(jsonb_build_object('source', m.source, 'id', m.id, 'user', m.u, 'left', coalesce(l.credits_left, 0)) order by m.source, m.id), '[]'::jsonb)
    into v_rows
    from mine m left join lefts l on l.source = m.source and l.source_id = m.id;
  -- Per recipient (the account each row was granted to, not today's owner: the owner may have
  -- changed since): what is left of their rows, never more than their free balance outside what
  -- they hold of this org's promotion share.
  select coalesce(jsonb_agg(jsonb_build_object('user', x.u, 'credits', x.credits) order by x.u), '[]'::jsonb), coalesce(sum(x.credits), 0)
    into v_recipients, v_sum
    from (
      select r.u, least(r.left_sum, greatest(0, p.free_credits - coalesce((select least(mm.held_promo_credits, p.free_credits)
                from public.org_members mm where mm.org_id = p_org and mm.user_id = p.id and mm.status = 'active'), 0)))::integer as credits
        from (select (e->>'user')::uuid as u, sum((e->>'left')::integer) as left_sum from jsonb_array_elements(v_rows) e group by 1) r
        join public.profiles p on p.id = r.u
    ) x;
  return jsonb_build_object('period', v_period, 'credits', v_sum, 'recipients', v_recipients, 'rows', v_rows);
end;
$$;
revoke all on function public._partner_promo_moveable(uuid) from public, anon, authenticated, service_role;

-- What a move would take now, for the admin's confirm dialog: {period, credits, recipients, moved}
-- (moved: this org's current-month rows already moved, credits they moved).
create function public.admin_partner_promo_move_preview(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_calc jsonb;
begin
  perform public._org_require_admin(p_actor);
  v_calc := public._partner_promo_moveable(p_org);
  return (v_calc - 'rows') || jsonb_build_object('moved',
    coalesce((select sum(g.moved_credits) from public.partner_promo_grants g where g.org_id = p_org and g.period = v_calc->>'period' and g.moved_at is not null), 0)
    + coalesce((select sum(t.moved_credits) from public.partner_promo_topups t where t.org_id = p_org and t.period = v_calc->>'period' and t.moved_at is not null), 0));
end;
$$;
revoke all on function public.admin_partner_promo_move_preview(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_move_preview(uuid, uuid) to service_role;

-- The move: {org_id, credits (what the confirm dialog showed)}. Returns {applied, reason?, credits}:
-- 'changed' when the amount is no longer what was shown (nothing moved; the page shows the new
-- amount), 'nothing' when there is nothing to move (also a second click: the rows are marked).
-- Otherwise debits each recipient's free pool (org_promo_move, key partner_promo_move:<org>:<month>:<user>),
-- credits the org promo pool (promo_grant, key partner_promo_move:<org>:<month>, expiring at the month's end, then
-- the members' allowances), marks the rows and audits partner_promo_move. Refused: NOT_ADMIN,
-- INVALID_INPUT, ORG_NOT_FOUND, PROMO_PARTNER_OFF (suspended org).
create function public.admin_partner_promo_move(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  v_calc jsonb;
  v_credits integer;
  v_key text;
  v_expires timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  r record;
begin
  perform public._org_require_admin(p_actor);
  if jsonb_typeof(p_input) is distinct from 'object'
     or coalesce(lower(p_input->>'org_id'), '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_input->>'credits', '') !~ '^[0-9]{1,9}$' then
    raise exception 'INVALID_INPUT';
  end if;
  select * into o from public.orgs where id = (p_input->>'org_id')::uuid for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if o.status <> 'active' then raise exception 'PROMO_PARTNER_OFF'; end if;
  perform from public.partner_promo_grants g where g.org_id = o.id and g.destination = 'owner' order by g.id for update;
  perform from public.partner_promo_topups t where t.org_id = o.id and t.destination = 'owner' order by t.id for update;
  perform from public.profiles p where p.id in (
    select g.recipient_user_id from public.partner_promo_grants g where g.org_id = o.id and g.destination = 'owner'
    union select t.recipient_user_id from public.partner_promo_topups t where t.org_id = o.id and t.destination = 'owner'
  ) order by p.id for update;
  v_calc := public._partner_promo_moveable(o.id);
  v_credits := (v_calc->>'credits')::integer;
  if v_credits = 0 and (p_input->>'credits')::integer = 0 or jsonb_array_length(v_calc->'rows') = 0 then
    return jsonb_build_object('applied', false, 'reason', 'nothing', 'credits', 0);
  end if;
  if v_credits <> (p_input->>'credits')::integer then
    return jsonb_build_object('applied', false, 'reason', 'changed', 'credits', v_credits);
  end if;
  v_key := 'partner_promo_move:' || o.id::text || ':' || (v_calc->>'period');
  for r in select * from jsonb_to_recordset(v_calc->'recipients') as x("user" uuid, credits integer) where x.credits > 0 loop
    perform public._apply_credit_change(r."user", 'free', 'org_promo_move', -r.credits,
      'Channel partner promotion credits moved to the org ' || (v_calc->>'period'), v_key || ':' || r."user"::text);
  end loop;
  for r in select * from jsonb_to_recordset(v_calc->'rows') as x(source text, id bigint, "left" integer) loop
    if r.source = 'grant' then
      update public.partner_promo_grants set moved_at = now(), moved_credits = r."left",
             expired_at = now(), expired_credits = 0, expired_basis = 0 where id = r.id;
    else
      update public.partner_promo_topups set moved_at = now(), moved_credits = r."left",
             expired_at = now(), expired_credits = 0, expired_basis = 0 where id = r.id;
    end if;
  end loop;
  if v_credits > 0 then
    perform public._org_promo_grant(o.id, v_credits, v_expires, v_key,
      'moved from the owner''s own pool ' || (v_calc->>'period'), p_actor);
  end if;
  perform public._org_audit(p_actor, 'partner_promo_move', o.id::text,
    jsonb_build_object('org_id', o.id, 'period', v_calc->>'period', 'recipients', v_calc->'recipients', 'credits', v_credits,
      'rows', v_calc->'rows')::text);
  return jsonb_build_object('applied', true, 'credits', v_credits);
end;
$$;
revoke all on function public.admin_partner_promo_move(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_partner_promo_move(uuid, jsonb) to service_role;
