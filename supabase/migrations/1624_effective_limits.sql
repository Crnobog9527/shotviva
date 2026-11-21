-- The limits that apply to an account (ARCHITECTURE §6.5): every item is the larger of the
-- account's own tier value (effective_tier(): an unbanned admin counts as Max) and its org's
-- value, the org value first clamped to system_settings.org_limit_caps. Only an active member of
-- an active org gets the org values; a suspended org, a removed member or a missing caps row lift
-- nothing. The tier values repeat TIER_LIMITS in src/core/billing/tier-limits.ts (a DB test pins
-- them together). batch_max is also kept under 200, the request schema's ceiling
-- (BATCH_SIZE_CEILING). current_tier(), effective_tier() and every price are untouched: this only
-- decides usage limits. tier is effective_tier() itself (null: no tier, limits as Starter).
create function public.effective_limits(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with base as (
    select t.raw, t.tier,
      case t.tier when 'max' then 6 when 'pro' then 3 else 1 end as concurrency,
      case t.tier when 'max' then 80 when 'pro' then 40 else 20 end as per_window,
      case t.tier when 'max' then 30 when 'pro' then 10 else 1 end as batch_max,
      case t.tier when 'max' then 5 else 1 end as multi_template_max,
      t.tier in ('pro','max') as batch_zip
    from (select r.raw, coalesce(r.raw, 'starter') as tier from (select public.effective_tier(p_user_id) as raw) r) t
  ), caps as (
    select coalesce((v->>'concurrency')::integer, 0) as concurrency,
      coalesce((v->>'per_window')::integer, 0) as per_window,
      least(coalesce((v->>'batch_max')::integer, 0), 200) as batch_max,
      coalesce((v->>'multi_template_max')::integer, 0) as multi_template_max
    from (select coalesce((select s.value from public.system_settings s where s.key = 'org_limit_caps'), '{}'::jsonb) as v) c
  ), org as (
    select o.id, o.concurrency, o.per_window, o.batch_max, o.multi_template_max, o.batch_zip, o.early_features
      from public.org_members m join public.orgs o on o.id = m.org_id
     where m.user_id = p_user_id and m.status = 'active' and o.status = 'active'
  )
  select jsonb_build_object(
    'tier', b.raw,
    'concurrency', greatest(b.concurrency, least(coalesce(o.concurrency, 0), c.concurrency)),
    'per_window', greatest(b.per_window, least(coalesce(o.per_window, 0), c.per_window)),
    'batch_max', greatest(b.batch_max, least(coalesce(o.batch_max, 0), c.batch_max)),
    'multi_template_max', greatest(b.multi_template_max, least(coalesce(o.multi_template_max, 0), c.multi_template_max)),
    'batch_zip', b.batch_zip or coalesce(o.batch_zip, false),
    'early_features', coalesce(o.early_features, false),
    'org_id', o.id)
  from base b cross join caps c left join org o on true;
$$;
revoke all on function public.effective_limits(uuid) from public, anon, authenticated;
grant execute on function public.effective_limits(uuid) to service_role;
