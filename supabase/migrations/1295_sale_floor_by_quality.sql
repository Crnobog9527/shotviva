-- The cost floor of a route without an approved price (ARCHITECTURE §6.1) is measured per quality.
-- Before, alternate_route_meets_floor took the p95 of every costed job on the route and resolution,
-- high and medium mixed, legacy rows without a recorded quality included. A few high-quality runs
-- moved that one number and hid every template on the route, medium ones included. Now the p95
-- samples only the jobs that recorded the template's own quality (like fallback_route_floor, 1010);
-- jobs without that evidence no longer count. Below the minimum sample the route's estimate and
-- the provider's list price apply, as before. The arithmetic of the floor is unchanged.

-- Serves the per-quality p95 with an index-only scan (the catalogue runs it once per template).
create index generation_jobs_route_quality_p95_idx on public.generation_jobs
  (provider, (inputs->>'resolution'), (inputs->>'quality'), created_at) include (cost_usd)
  where status='succeeded' and cost_usd is not null and inputs ? 'quality';

-- What the floor of one route, resolution and quality rests on: the cost per image in USD, where
-- it came from (p95 / estimate / catalog / list), how many measured jobs there were, and the floor
-- in credits. usd and credits are null when the route cannot be priced (then nothing is sold).
create function admin.alternate_route_floor(p_tag text, p_resolution text, p_quality text)
returns jsonb language sql stable set search_path='' as $$
  with route as (
    select p.adapter, p.capabilities, p.estimated_image_costs
    from public.ai_providers p
    where p.module='image' and p.id::text||'/'||p.model=p_tag
      and p.resolutions @> array[p_resolution] and p.capabilities<>'{}'::jsonb
      and p_resolution in ('1k','2k','3k')
  ), measured as (
    select count(*) as n, percentile_cont(0.95) within group (order by g.cost_usd) as p95
    from public.generation_jobs g
    where g.provider=p_tag and g.inputs->>'resolution'=p_resolution
      and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
      and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
  ), sources as (
    select r.adapter, m.n,
      -- Through jsonb as admin_image_provider_pricing returns it, so the rounding is unchanged.
      case when m.n>=10 then (to_jsonb(m.p95) #>> '{}')::numeric end as p95,
      (r.estimated_image_costs->>p_resolution)::numeric as estimate,
      case when r.adapter='openrouter_images' and jsonb_typeof(r.capabilities->'catalogImageCosts'->p_resolution)='number'
        and (r.capabilities->'catalogImageCosts'->>p_resolution)::numeric > 0
        then (r.capabilities->'catalogImageCosts'->>p_resolution)::numeric end as catalog,
      case when r.adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"3k":0.135}'
                    else '{"1k":0.081,"2k":0.135,"3k":0.206}' end)::jsonb->>p_resolution)::numeric end as list
    from route r cross join measured m
  ), priced as (
    select adapter, n, coalesce(p95,estimate,catalog,list) as usd,
      case when p95 is not null then 'p95' when estimate is not null then 'estimate'
           when catalog is not null then 'catalog' when list is not null then 'list' end as basis
    from sources
  ), budget as (
    select admin.lowest_credit_price()*0.761*0.4 as usd
  )
  select jsonb_build_object('usd',priced.usd,'basis',priced.basis,'samples',priced.n,
    'credits',case when priced.usd is not null and budget.usd>0 then greatest(
      ceil(priced.usd*1.10/budget.usd)::int,
      case when priced.adapter='openai_images' then (case when p_quality='medium' then
        '{"1k":1,"2k":2,"3k":3}' else '{"1k":2,"2k":4,"3k":6}' end::jsonb->>p_resolution)::int else 0 end) end)
  from priced, budget
$$;
revoke all on function admin.alternate_route_floor(text,text,text) from public,anon,authenticated;
grant execute on function admin.alternate_route_floor(text,text,text) to service_role;

create or replace function admin.alternate_route_meets_floor(p_tag text, p_resolution text,
  p_quality text, p_price integer) returns boolean
language sql stable set search_path='' as $$
  select coalesce(p_price >= (admin.alternate_route_floor(p_tag,p_resolution,p_quality)->>'credits')::int, false)
$$;

-- Why a published web template is missing from the catalogue (web_standard_sale_allowed false),
-- for the Owner's alert and the admin list. reason: sale_closed / unpriced / no_route /
-- route_unsupported / below_floor. For below_floor, floor is alternate_route_floor of the
-- default 1K route (usd, basis, samples, credits) and price the template's 1K credits.
create function admin.sale_floor_hidden() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  m record; t public.templates; sale public.template_sale_approvals; p public.ai_providers;
  route text; reason text; floor jsonb; result jsonb:='[]'::jsonb;
begin
  for m in select pm.id from admin.published_web_members pm order by pm.id loop
    if admin.web_standard_sale_allowed(m.id) then continue; end if;
    select * into t from public.templates where id=m.id;
    select * into sale from public.template_sale_approvals where template_id=m.id;
    route:=null; floor:=null; p:=null;
    select a.id::text||'/'||a.model into route from public.ai_providers a where a.module='image' and
      a.id=coalesce((select tp.provider_id from public.template_prompts tp where tp.template_id=t.id and t.id<>'edit'),
                    (select b.id from public.ai_providers b where b.module='image' and b.is_active));
    if not coalesce(sale.enabled,false) then reason:='sale_closed';
    elsif '1k'=any(sale.unpriced_resolutions) then reason:='unpriced';
    elsif route is null then reason:='no_route';
    else
      select * into p from public.ai_providers a where a.module='image' and a.id::text||'/'||a.model=route;
      if not ('1k'=any(admin.sale_route_resolutions(p))) then reason:='route_unsupported';
      else reason:='below_floor'; floor:=admin.alternate_route_floor(route,'1k',t.quality);
      end if;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('template_id',t.id,'quality',t.quality,
      'price',(t.credits_cost->>'1k')::int,'route',route,'reason',reason,'floor',floor));
  end loop;
  return result;
end $$;
revoke all on function admin.sale_floor_hidden() from public,anon,authenticated;
grant execute on function admin.sale_floor_hidden() to service_role;

-- The server's entry point (alerts and /admin/templates); PostgREST serves public only.
create function public.admin_sale_floor_hidden() returns jsonb
language sql stable security definer set search_path='' as $$ select admin.sale_floor_hidden() $$;
revoke all on function public.admin_sale_floor_hidden() from public,anon,authenticated;
grant execute on function public.admin_sale_floor_hidden() to service_role;

-- Saving a template checks the same floor (assert_template_sale_floor, 1100). A bound route goes
-- through alternate_route_meets_floor above; the environment-model path now also samples only
-- the template's quality. Otherwise unchanged from 1100.
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
  if exists(select from public.template_sale_approvals s where s.template_id=t.id and s.unpriced_resolutions @> array['1k','2k','3k']) then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='请先为至少一个可售档位定价'; end if;
  if t.id<>'edit' then
    select provider_id into bound from public.template_prompts where template_id=t.id for share;
  end if;
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
    budget := admin.lowest_credit_price()*0.761*0.4;
    select jsonb_object_agg(r, cost) into env_p95 from (
      select r, max(p95) cost from (
        select provider, coalesce(inputs->>'resolution','1k') r,
          percentile_cont(0.95) within group (order by cost_usd) p95
        from public.generation_jobs where provider like 'env/%' and status='succeeded'
          and cost_usd is not null and created_at >= now()-interval '30 days'
          and inputs ? 'quality' and inputs->>'quality'=t.quality
        group by 1,2 having count(*)>=10
      ) per_model group by r
    ) per_tier;
  end if;
  if t.quality='medium' then
    openai_min := '{"1k":1,"2k":2,"3k":3}'; openai_usd := '{"1k":0.055,"2k":0.095,"3k":0.135}';
  else
    openai_min := '{"1k":2,"2k":4,"3k":6}'; openai_usd := '{"1k":0.081,"2k":0.135,"3k":0.206}';
  end if;
  foreach tier in array array['1k','2k','3k'] loop
    if exists(select from public.template_sale_approvals s where s.template_id=t.id and tier=any(s.unpriced_resolutions)) then continue; end if;
    if approved->>'quality'=t.quality and approved->'costs'->tier=t.credits_cost->tier then continue; end if;
    -- T96 never sells unsupported resolutions on this model. Those fields keep
    -- their existing positive placeholder; fallback reservations have their own check.
    if bound is not null then
      if not (tier=any(supported)) or admin.alternate_route_meets_floor(route_tag,tier,t.quality,(t.credits_cost->>tier)::int)
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
end;
$$;

-- The editor, bulk edit and template sync price from admin_image_pricing_catalog
-- (template_sync_pricing_input signs the same read). Each route also carries its p95 per quality,
-- at least ten jobs that recorded that quality, so the shown and checked floor of a medium
-- template follows medium jobs only, like the database check. The old per-resolution p95 stays
-- for older readers.
create function admin.route_p95_by_quality(p_tag text) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(quality,tiers),'{}'::jsonb) from (
    select quality,jsonb_object_agg(res,cost) tiers from (
      select g.inputs->>'quality' quality, g.inputs->>'resolution' res,
        percentile_cont(0.95) within group (order by g.cost_usd) cost
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs ? 'quality' and g.inputs->>'quality' in ('medium','high')
        and g.inputs->>'resolution' in ('1k','2k','3k')
        and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
      group by 1,2 having count(*)>=10
    ) per_tier group by quality
  ) per_quality
$$;
revoke all on function admin.route_p95_by_quality(text) from public,anon,authenticated;
grant execute on function admin.route_p95_by_quality(text) to service_role;

create or replace function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id))
      || jsonb_build_object('p95_by_quality',admin.route_p95_by_quality(coalesce(p.provider_id::text,'env')||'/'||p.model))
      || case when p.is_active then jsonb_build_object('fallback_floors',(
        select jsonb_object_agg(quality,tiers) from (
          select quality,jsonb_object_agg(res,admin.fallback_route_floor(coalesce(p.provider_id::text,'env')||'/'||p.model,res,quality)) tiers
          from unnest(array['medium','high']) quality cross join unnest(array['1k','2k','3k']) res group by quality
        ) grouped)) else '{}'::jsonb end)
      from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;
