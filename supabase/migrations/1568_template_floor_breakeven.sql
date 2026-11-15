-- 1568: the template sale floor becomes worst-case break-even (Owner, 2026-11-15).
--
-- Until now every floor divided the cost by a credit budget that kept the 60% margin target:
-- lowest_credit_price() x 0.761 x 0.4. The floor now only stops a price that can lose money:
--   floor = ceil(cost x 1.10 / break-even budget)
--   break-even budget = the lowest realised dollars per credit after the worst fee, over the
--     listed catalogue products: price per credit (packs M/L at their member price, as
--     validate_catalog_terms) x (1 - catalog_fee_bp(kind)).
-- catalog_fee_bp is the card fee + refund reserve from catalog_economics_policy and the highest
-- effective affiliate rate for that kind of product (affiliate_rates, overrides, team level),
-- never a number in code. The margin target (policy margin_bp) is advice only: the admin shows
-- the worst margin and flags a price under the target, without refusing it.
-- Without a valid policy (or before the v2 catalogue) the old budget stays: the floor never
-- loosens on missing data. The catalogue product check (catalog_cost_ok / C_max) is unchanged.
--
-- The same four functions as before carry the budget, so every check that calls them moves
-- together: save and open sale (assert_template_sale_floor), bulk edit, the reservation re-check
-- (reservation_route_allowed via fallback/alternate_route_floor and slot_floor_credits) and the
-- editor's read (admin_image_pricing_catalog). Bodies are the latest ones (1552, 1553) with only
-- the budget swapped, so 4k stays 4k (ARCHITECTURE: rewrites start from 1451's or later).
-- Also: route_slot_costs and slot_route_floor take full-slot jobs up to 8 slots, not 2-4, so a
-- template with 5-8 slots can reach its measured p95.
-- Expand-only: unchanged signatures; admin_image_pricing_catalog gains three keys and
-- admin_set_system_setting accepts one more key (catalog_economics_policy, unbanned admins only).

-- Whether the policy row is valid, decided without casting anything first: admin.catalog_policy()
-- (1127) can raise on a malformed row, because SQL does not promise to evaluate its checks in order.
-- The floors must never error on a bad row; they fall back to the old budget instead.
create function admin.template_policy_valid() returns boolean
  language sql stable security definer set search_path to '' as $$
  select coalesce((select case
      when jsonb_typeof(s.value) is distinct from 'object' then false
      when exists (select from unnest(array['payment_bp','refund_bp','yearly_commission_bp','other_commission_bp','margin_bp']) k
             where jsonb_typeof(s.value->k) is distinct from 'number' or (s.value->>k) !~ '^[0-9]{1,4}$') then false
      else (s.value->>'payment_bp')::int + (s.value->>'refund_bp')::int
        + greatest((s.value->>'yearly_commission_bp')::int, (s.value->>'other_commission_bp')::int) < 10000 end
    from public.system_settings s where s.key='catalog_economics_policy'), false)
$$;

create function admin.template_breakeven_budget() returns numeric
  language sql stable security definer set search_path to '' as $$
  select case when admin.is_template_catalog_v2() and admin.template_policy_valid() then (
    select min(i.cents/(100*i.credits::numeric) * (10000-admin.catalog_fee_bp(i.kind))/10000)
      from (select c.kind, c.credits,
              case when c.id in ('pack_m','pack_l') then round(c.cents*0.85) else c.cents end as cents
            from admin.catalog_candidate(null,null,null,false) c) i
     where i.cents>0 and i.credits>0) end
$$;

create function admin.template_floor_budget() returns numeric
  language sql stable security definer set search_path to '' as $$
  select coalesce(admin.template_breakeven_budget(), admin.lowest_credit_price()*0.761*0.4)
$$;

-- The advisory target, only with the policy that also gives the break-even budget.
create function admin.template_margin_target_bp() returns integer
  language sql stable security definer set search_path to '' as $$
  select case when admin.template_breakeven_budget() is not null then
    (select (s.value->>'margin_bp')::int from public.system_settings s where s.key='catalog_economics_policy') end
$$;

revoke all on function admin.template_policy_valid(), admin.template_breakeven_budget(), admin.template_floor_budget(), admin.template_margin_target_bp()
  from public, anon, authenticated;
grant execute on function admin.template_policy_valid(), admin.template_breakeven_budget(), admin.template_floor_budget(), admin.template_margin_target_bp()
  to service_role;

create or replace function admin.alternate_route_floor(p_tag text, p_resolution text, p_quality text) returns jsonb
  language sql stable set search_path to '' as $$
  with route as (
    select p.adapter, p.capabilities, p.estimated_image_costs, admin.provider_list_priced(p) as listed
    from public.ai_providers p
    where p.module='image' and p.id::text||'/'||p.model=p_tag
      and p.resolutions @> array[public.canonical_resolution(p_resolution)] and p.capabilities<>'{}'::jsonb
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k')
  ), measured as (
    select count(*) as n, percentile_cont(0.95) within group (order by g.cost_usd) as p95
    from public.generation_jobs g
    where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'resolution' = any(public.resolution_aliases(p_resolution))
      and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
      and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
      and not (g.inputs ? 'input_slots')
  ), sources as (
    select r.listed, m.n,
      -- Through jsonb as admin_image_provider_pricing returns it, so the rounding is unchanged.
      case when m.n>=10 then (to_jsonb(m.p95) #>> '{}')::numeric end as p95,
      (r.estimated_image_costs->>public.canonical_resolution(p_resolution))::numeric as estimate,
      case when r.adapter='openrouter_images' and not r.listed
        and jsonb_typeof(r.capabilities->'catalogImageCosts'->public.canonical_resolution(p_resolution))='number'
        and (r.capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric > 0
        then (r.capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric end as catalog,
      case when r.listed then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"4k":0.135}'
                    else '{"1k":0.081,"2k":0.135,"4k":0.206}' end)::jsonb->>public.canonical_resolution(p_resolution))::numeric end as list
    from route r cross join measured m
  ), priced as (
    select listed, n, coalesce(p95,estimate,catalog,list) as usd,
      case when p95 is not null then 'p95' when estimate is not null then 'estimate'
           when catalog is not null then 'catalog' when list is not null then 'list' end as basis
    from sources
  ), budget as (
    select admin.template_floor_budget() as usd
  )
  select jsonb_build_object('usd',priced.usd,'basis',priced.basis,'samples',priced.n,
    'credits',case when priced.usd is not null and budget.usd>0 then greatest(
      ceil(priced.usd*1.10/budget.usd)::int,
      case when priced.listed then (case when p_quality='medium' then
        '{"1k":1,"2k":2,"4k":3}' else '{"1k":2,"2k":4,"4k":6}' end::jsonb->>public.canonical_resolution(p_resolution))::int else 0 end) end)
  from priced, budget
$$;

create or replace function admin.fallback_route_floor(p_tag text, p_resolution text, p_quality text) returns numeric
  language sql stable set search_path to '' as $$
  with route as (
    select admin.provider_list_priced(p) as listed, p.adapter, p.estimated_image_costs, p.capabilities
      from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1)
        and p_tag=p.id::text||'/'||p.model and public.canonical_resolution(p_resolution)=any(p.resolutions)
        and (p.adapter='openai_images' or p.capabilities<>'{}'::jsonb)
    union all
    select true,'openai_images','{}'::jsonb,'{}'::jsonb where p_tag like 'env/_%'
  ), measured as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'resolution' = any(public.resolution_aliases(p_resolution))
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null
        and g.created_at>=now()-interval '30 days' and not (g.inputs ? 'input_slots')
      having count(*)>=10
  ), priced as (
    select listed, greatest(
      (select usd from measured), (estimated_image_costs->>public.canonical_resolution(p_resolution))::numeric,
      case when not listed and jsonb_typeof(capabilities->'catalogImageCosts'->public.canonical_resolution(p_resolution))='number'
        then nullif((capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric,0) end,
      case when listed then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"4k":0.135}'
          else '{"1k":0.081,"2k":0.135,"4k":0.206}' end)::jsonb->>public.canonical_resolution(p_resolution))::numeric end
    ) as usd from route
  ), budget as (select admin.template_floor_budget() as usd)
  select greatest(1,ceil(priced.usd*1.10/budget.usd),
    case when listed then
      ((case when p_quality='medium' then '{"1k":1,"2k":2,"4k":3}'
        else '{"1k":2,"2k":4,"4k":6}' end)::jsonb->>public.canonical_resolution(p_resolution))::int end)
    from priced,budget where priced.usd is not null and budget.usd>0
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k') and p_quality in ('medium','high')
$$;

create or replace function admin.route_slot_costs(p_tag text) returns jsonb
  language sql stable set search_path to '' as $$
  select jsonb_build_object(
    'extra_input_usd', (select p.extra_input_image_usd from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag),
    'p95_full', coalesce((select jsonb_object_agg(quality,tiers) from (
      select quality, jsonb_object_agg(res,slots) tiers from (
        select quality, res, jsonb_object_agg(n::text,cost) slots from (
          -- Jobs before PR-2 say 3k for the same tier as 4k: one sample set.
          select g.inputs->>'quality' quality, public.canonical_resolution(g.inputs->>'resolution') res, admin.slot_count(g.inputs) n,
            percentile_cont(0.95) within group (order by g.cost_usd) cost
          from public.generation_jobs g
          where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'quality' in ('medium','high') and g.inputs->>'resolution' in ('1k','2k','3k','4k')
            and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
            and admin.slot_count(g.inputs) between 2 and 8
          group by 1,2,3 having count(*)>=10
        ) per_n group by quality, res
      ) per_res group by quality
    ) per_quality),'{}'::jsonb))
$$;

create or replace function admin.slot_route_floor(p_tag text, p_resolution text, p_quality text, p_slots integer, p_single integer) returns integer
  language sql stable set search_path to '' as $$
  with budget as (select admin.template_floor_budget() as usd),
  full_slots as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'resolution'=p_resolution
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
        and admin.slot_count(g.inputs)=p_slots
      having count(*)>=10
  ), extra as (
    select p.extra_input_image_usd as usd from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag
  )
  select case
    when p_single is null then null
    when coalesce(p_slots,0)<=1 then p_single
    when b.usd is null or b.usd<=0 then p_single*p_slots
    when (select usd from full_slots) is not null then greatest(p_single, ceil((select usd from full_slots)*1.10/b.usd)::int)
    when (select usd from extra) is not null then p_single+ceil((p_slots-1)*(select usd from extra)*1.10/b.usd)::int
    else p_single*p_slots end
  from budget b
$$;

-- 1553's body; only the environment-model budget changes.
create or replace function admin.assert_template_sale_floor(t public.templates) returns void
language plpgsql security definer set search_path='' as $$
declare
  bound uuid;
  route_tag text;
  supported text[];
  approved jsonb;
  tier text;
  budget numeric;
  usd numeric;
  openai_min jsonb;
  openai_usd jsonb;
  env_p95 jsonb;
begin
  if exists(select from public.template_sale_approvals s where s.template_id=t.id and s.unpriced_resolutions @> array['1k','2k','4k']) then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='请先为至少一个可售档位定价'; end if;
  select provider_id into bound from public.template_prompts where template_id=t.id for share;
  -- Keep model selection and its configured estimate stable through this commit.
  select p.id,p.id::text||'/'||p.model,admin.sale_route_resolutions(p) into bound,route_tag,supported
    from public.ai_providers p where p.module='image' and (p.id=bound or (bound is null and p.is_active)) for share;
  if bound is not null and cardinality(supported)=0 then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='所选模型的可用档位尚未确认'; end if;
  approved := admin.template_approved_prices(bound)->t.id;

  -- With no database provider the server uses its OpenAI environment model. SQL cannot
  -- see that setting. Take the highest eligible model p95 per tier in that case, at the
  -- template's own quality (1295).
  if bound is null then
    budget := admin.template_floor_budget();
    select jsonb_object_agg(r, cost) into env_p95 from (
      select r, max(p95) cost from (
        select provider, public.canonical_resolution(coalesce(inputs->>'resolution','1k')) r,
          percentile_cont(0.95) within group (order by cost_usd) p95
        from public.generation_jobs where provider like 'env/%' and status='succeeded'
          and cost_usd is not null and created_at >= now()-interval '30 days'
          and inputs ? 'quality' and inputs->>'quality'=t.quality and not (inputs ? 'input_slots')
        group by 1,2 having count(*)>=10
      ) per_model group by r
    ) per_tier;
  end if;
  if t.quality='medium' then
    openai_min := '{"1k":1,"2k":2,"4k":3}'; openai_usd := '{"1k":0.055,"2k":0.095,"4k":0.135}';
  else
    openai_min := '{"1k":2,"2k":4,"4k":6}'; openai_usd := '{"1k":0.081,"2k":0.135,"4k":0.206}';
  end if;
  foreach tier in array array['1k','2k','4k'] loop
    if exists(select from public.template_sale_approvals s where s.template_id=t.id and tier=any(s.unpriced_resolutions)) then continue; end if;
    if approved->>'quality'=t.quality and approved->'costs'->tier=t.credits_cost->tier then continue; end if;
    -- T96 never sells unsupported resolutions on this model. Those fields keep
    -- their existing positive placeholder; fallback reservations have their own check.
    if bound is not null then
      if not (tier=any(supported)) or coalesce((t.credits_cost->>tier)::int>=admin.slot_floor_credits(t,route_tag,tier,(admin.alternate_route_floor(route_tag,tier,t.quality)->>'credits')::int),false)
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= admin.slot_floor_credits(t,'env/unknown',tier,greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)::int)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
end;
$$;

-- floor_budget: what the editor divides costs by (the same as the floors above).
-- breakeven_budget and margin_target_bp: present only with a valid policy; the editor shows the
-- worst margin against the target from them. unit_price stays for old readers.
create or replace function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
  language sql stable set search_path to '' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
    'floor_budget',admin.template_floor_budget(),
    'breakeven_budget',admin.template_breakeven_budget(),
    'margin_target_bp',admin.template_margin_target_bp(),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id))
      || jsonb_build_object('list_priced',coalesce((select admin.provider_list_priced(a) from public.ai_providers a where a.id=p.provider_id),
           p.adapter='openai_images'))
      || jsonb_build_object('p95_by_quality',admin.route_p95_by_quality(coalesce(p.provider_id::text,'env')||'/'||p.model))
      || jsonb_build_object('slot_costs',admin.route_slot_costs(coalesce(p.provider_id::text,'env')||'/'||p.model))
      || case when p.is_active then jsonb_build_object('fallback_floors',(
        select jsonb_object_agg(quality,tiers) from (
          select quality,jsonb_object_agg(res,admin.fallback_route_floor(coalesce(p.provider_id::text,'env')||'/'||p.model,res,quality)) tiers
          from unnest(array['medium','high']) quality cross join unnest(array['1k','2k','4k']) res group by quality
        ) grouped)) else '{}'::jsonb end)
      from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;

-- The policy row the floors read is written only through the admin setting RPC (no hand-written
-- SQL on remote databases): scripts/set-catalog-policy.ts calls it. Body from 1521; only adds
-- the key, every other key is checked exactly as before.
create or replace function public.admin_set_system_setting(p_key text, p_value jsonb, p_actor uuid) returns void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin'
      and (p_key not in ('code_gift_policy','code_inviter_window_days','gallery_enabled','gallery_auto_approve',
                         'signup_gift_daily_cap','signup_gift_paused','signup_gift_per_ip',
                         'signup_gift_claim_phone','signup_gift_claim_google','poster_photo_credits',
                         'catalog_economics_policy')
           or p.banned_at is null)) then
    raise exception 'NOT_ADMIN';
  end if;

  case p_key
    when 'wishlist_enabled', 'gallery_enabled', 'gallery_auto_approve', 'signup_gift_paused',
         'signup_gift_claim_phone', 'signup_gift_claim_google' then
      if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
        raise exception 'INVALID_INPUT' using detail = p_key || ' must be a boolean';
      end if;
    when 'admin_test_daily_budget_usd' then
      if p_value is null or jsonb_typeof(p_value) <> 'number'
         or (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'admin_test_daily_budget_usd must be a number from 0 to 1000';
      end if;
    when 'signup_gift_daily_cap' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]+$'
         or (p_value #>> '{}')::numeric > 100000 then
        raise exception 'INVALID_INPUT' using detail = 'signup_gift_daily_cap must be an integer from 0 to 100000';
      end if;
    when 'signup_gift_per_ip' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[0-9]+$'
         or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'signup_gift_per_ip must be an integer from 0 to 1000';
      end if;
    -- 拍照识别's price per run (§5.3「每周复用」, Owner 2026-11-14). Unset: the feature is off.
    when 'poster_photo_credits' then
      if jsonb_typeof(p_value) is distinct from 'number' or (p_value #>> '{}') !~ '^[1-9][0-9]*$'
         or (p_value #>> '{}')::numeric > 1000 then
        raise exception 'INVALID_INPUT' using detail = 'poster_photo_credits must be an integer from 1 to 1000';
      end if;
    when 'code_inviter_window_days' then
      if jsonb_typeof(p_value) is distinct from 'number' or
         (p_value #>> '{}') !~ '^[1-9][0-9]*$' or (p_value #>> '{}')::numeric > 2147483647 then
        raise exception 'INVALID_INPUT' using detail = 'reward window must be a positive integer';
      end if;
    when 'code_gift_policy' then
      if jsonb_typeof(p_value) is distinct from 'object' or
         jsonb_typeof(p_value->'requirePaidGiftCap') is distinct from 'boolean' or
         jsonb_typeof(p_value->'maxCreditsPerCode') is distinct from 'number' or
         (p_value->>'maxCreditsPerCode') !~ '^[1-9][0-9]*$' or
         (p_value->>'maxCreditsPerCode')::numeric > 2147483647 or
         p_value - array['requirePaidGiftCap','maxCreditsPerCode'] <> '{}'::jsonb then
        raise exception 'INVALID_INPUT' using detail = 'invalid gift code policy';
      end if;
    -- 1568: the catalogue economics policy (§6.2 第 5 项), the same shape admin.catalog_policy()
    -- accepts: exactly the five basis-point integers, fees + the larger commission under 100%.
    when 'catalog_economics_policy' then
      -- Separate steps: no cast runs before the shape is known (SQL does not short-circuit OR).
      if jsonb_typeof(p_value) is distinct from 'object' then
        raise exception 'INVALID_INPUT' using detail = 'catalog_economics_policy must be an object';
      end if;
      if p_value - array['payment_bp','refund_bp','yearly_commission_bp','other_commission_bp','margin_bp'] <> '{}'::jsonb
         or exists (select from unnest(array['payment_bp','refund_bp','yearly_commission_bp','other_commission_bp','margin_bp']) k
              where jsonb_typeof(p_value->k) is distinct from 'number' or (p_value->>k) !~ '^[0-9]{1,4}$') then
        raise exception 'INVALID_INPUT' using detail = 'catalog_economics_policy must be five basis-point integers';
      end if;
      if (p_value->>'payment_bp')::int + (p_value->>'refund_bp')::int
         + greatest((p_value->>'yearly_commission_bp')::int, (p_value->>'other_commission_bp')::int) >= 10000 then
        raise exception 'INVALID_INPUT' using detail = 'catalog_economics_policy fees must stay under 100%';
      end if;
    else
      raise exception 'INVALID_INPUT' using detail = 'unknown setting';
  end case;

  insert into public.system_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), p_actor)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  if p_key in ('gallery_enabled', 'gallery_auto_approve') then
    insert into public.admin_audit_log (action, user_id, reason, target_id)
    values ('gallery_setting', p_actor, p_value::text, p_key);
  end if;
end;
$_$;
