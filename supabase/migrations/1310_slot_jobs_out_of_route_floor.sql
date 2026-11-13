-- Multi-image jobs (named image slots, ARCHITECTURE §5.1e) send up to four input images, so one
-- job costs more than a single-photo job on the same route, resolution and quality. Mixed into the
-- route's 30-day p95 they raise every template's cost floor on that route (seen on the test site:
-- one slot job moved the 1K floor and hid a template). From here on every p95 the floors read
-- leaves out jobs that carry inputs.input_slots. A slot template has its own floor instead: the
-- single-image floor of its route × its number of slots (admin.slot_floor_factor), applied wherever
-- a price is checked against a floor (sale, reservation, job, save, the hidden-template report). An
-- Owner-approved price still stands as it is. Jobs with style references are not split out here:
-- see the PR (the same mixing exists, smaller, and the count of references is not on the job row
-- in a form the floor can group by yet).

-- The per-quality p95 index (1295) without slot jobs, so the floor reads stay index-only.
drop index if exists public.generation_jobs_route_quality_p95_idx;
create index generation_jobs_route_quality_p95_idx on public.generation_jobs
  (provider, (inputs->>'resolution'), (inputs->>'quality'), created_at) include (cost_usd)
  where status='succeeded' and cost_usd is not null and inputs ? 'quality' and not (inputs ? 'input_slots');

-- How many single-image floors a template's price must cover: its number of image slots, at least 1.
create function admin.slot_floor_factor(t public.templates) returns integer
language sql immutable set search_path='' as $$
  select greatest(1, case when jsonb_typeof(t.fields->'images'->'slots')='array'
    then jsonb_array_length(t.fields->'images'->'slots') else 0 end)
$$;
revoke all on function admin.slot_floor_factor(public.templates) from public,anon,authenticated;
grant execute on function admin.slot_floor_factor(public.templates) to service_role;


-- 1295, single-image jobs only.
create or replace function admin.alternate_route_floor(p_tag text, p_resolution text, p_quality text)
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
      and not (g.inputs ? 'input_slots')
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

-- 1010, single-image jobs only.
create or replace function admin.fallback_route_floor(p_tag text, p_resolution text, p_quality text)
returns numeric language sql stable set search_path='' as $$
  with route as (
    select p.adapter, p.estimated_image_costs, p.capabilities
      from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1)
        and p_tag=p.id::text||'/'||p.model and p_resolution=any(p.resolutions)
        and (p.adapter='openai_images' or p.capabilities<>'{}'::jsonb)
    union all
    select 'openai_images','{}'::jsonb,'{}'::jsonb where p_tag like 'env/_%'
  ), measured as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs->>'resolution'=p_resolution
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null
        and g.created_at>=now()-interval '30 days' and not (g.inputs ? 'input_slots')
      having count(*)>=10
  ), priced as (
    select adapter, greatest(
      (select usd from measured), (estimated_image_costs->>p_resolution)::numeric,
      case when jsonb_typeof(capabilities->'catalogImageCosts'->p_resolution)='number'
        then nullif((capabilities->'catalogImageCosts'->>p_resolution)::numeric,0) end,
      case when adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"3k":0.135}'
          else '{"1k":0.081,"2k":0.135,"3k":0.206}' end)::jsonb->>p_resolution)::numeric end
    ) as usd from route
  ), budget as (select admin.lowest_credit_price()*0.761*0.4 as usd)
  select greatest(1,ceil(priced.usd*1.10/budget.usd),
    case when adapter='openai_images' then
      ((case when p_quality='medium' then '{"1k":1,"2k":2,"3k":3}'
        else '{"1k":2,"2k":4,"3k":6}' end)::jsonb->>p_resolution)::int end)
    from priced,budget where priced.usd is not null and budget.usd>0
      and p_resolution in ('1k','2k','3k') and p_quality in ('medium','high')
$$;

-- 1295, single-image jobs only (the editor's shown floor).
create or replace function admin.route_p95_by_quality(p_tag text) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_object_agg(quality,tiers),'{}'::jsonb) from (
    select quality,jsonb_object_agg(res,cost) tiers from (
      select g.inputs->>'quality' quality, g.inputs->>'resolution' res,
        percentile_cont(0.95) within group (order by g.cost_usd) cost
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs ? 'quality' and g.inputs->>'quality' in ('medium','high')
        and g.inputs->>'resolution' in ('1k','2k','3k')
        and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
        and not (g.inputs ? 'input_slots')
      group by 1,2 having count(*)>=10
    ) per_tier group by quality
  ) per_quality
$$;

-- 0924, single-image jobs only.
create or replace function public.admin_image_provider_pricing(p_env_model text)
returns table (
  provider_id uuid, label text, model text, adapter text, is_active boolean,
  capabilities jsonb, resolutions text[], estimated_image_costs jsonb, p95 jsonb
)
language sql stable security invoker set search_path = ''
as $$
  with samples as (
    select g.provider, coalesce(g.inputs->>'resolution', '1k') as resolution,
           percentile_cont(0.95) within group (order by g.cost_usd) as cost
      from public.generation_jobs g
     where g.created_at >= now() - interval '30 days'
       and coalesce(g.inputs->>'resolution', '1k') in ('1k','2k','3k')
       and g.status = 'succeeded' and g.cost_usd is not null
       and not (g.inputs ? 'input_slots')
     group by 1, 2 having count(*) >= 10
  ), costs as (
    select provider, jsonb_object_agg(resolution, cost) as p95 from samples group by provider
  )
  select p.id, p.label, p.model, p.adapter, p.is_active, p.capabilities, p.resolutions,
         p.estimated_image_costs, coalesce(c.p95, '{}'::jsonb)
    from public.ai_providers p
    left join costs c on c.provider = p.id::text || '/' || p.model
   where p.module = 'image'
  union all
  select null::uuid, '环境默认'::text, p_env_model, 'openai_images'::text, true, '{}'::jsonb,
         array['1k', '2k', '3k'], '{}'::jsonb, coalesce(c.p95, '{}'::jsonb)
    from (values (1)) as fallback(dummy) left join costs c on c.provider = 'env/' || p_env_model
   where not exists (select 1 from public.ai_providers where module = 'image' and is_active)
   order by 2, 1
$$;

-- 1172, single-image jobs only.
create or replace function admin.web_standard_sale_allowed(template_id text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare t public.templates; route text; price integer;
begin
  select * into t from public.templates where id=template_id and is_active and 'web'=any(visible_in);
  if not found then return false; end if;
  price:=(t.credits_cost->>'1k')::int;
  select p.id::text||'/'||p.model into route from public.ai_providers p where p.module='image' and
    p.id=coalesce((select tp.provider_id from public.template_prompts tp where tp.template_id=t.id and t.id<>'edit'),
                  (select a.id from public.ai_providers a where a.module='image' and a.is_active));
  if route is not null then return admin.template_route_allowed(t,route,'1k',price,false); end if;
  if not admin.template_route_allowed(t,'env/unknown','1k',price,false) then return false; end if;
  if not admin.is_template_catalog_v2() then return true; end if;
  return not exists (
    select j.provider from public.generation_jobs j where j.provider like 'env/_%'
      and j.status='succeeded' and j.cost_usd is not null and j.created_at>=now()-interval '30 days'
      and j.inputs->>'resolution'='1k' and j.inputs->>'quality'=t.quality and not (j.inputs ? 'input_slots')
      group by j.provider
    having count(*)>=10 and not admin.template_route_allowed(t,j.provider,'1k',price,false)
  );
end $$;

-- 1172; a slot template's floor is the single-image floor × its slots (price/factor >= floor
-- is exactly price >= floor×factor for whole credits).
create or replace function admin.reservation_route_allowed(t public.templates, route text, tier text,
  price integer, fallback boolean, v2 boolean) returns boolean
language plpgsql stable set search_path='' as $$
begin
  if fallback or exists (
    select from public.template_prompts tp join public.ai_providers p on p.id=tp.provider_id
    where tp.template_id=t.id and route is distinct from p.id::text||'/'||p.model
  ) then
    if not coalesce(price>=admin.fallback_route_floor(route,tier,t.quality)*admin.slot_floor_factor(t),false) then return false; end if;
  end if;
  if v2 and exists (
    select from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
    join admin.template_tariffs_v2 c on c.id=s.template_id
    where b.reverted_at is null and s.template_id=t.id and c.quality=t.quality
      and c.costs->tier=t.credits_cost->tier and
      (route is distinct from s.provider_id::text||'/gpt-image-2.6-sunburst'
        or not (admin.template_approved_prices(s.provider_id) ? t.id))
  ) then return admin.alternate_route_meets_floor(route,tier,t.quality,price/admin.slot_floor_factor(t)); end if;
  return true;
end $$;

-- 1250; the same slot factor. An approved price for this template still stands.
create or replace function admin.job_route_allowed(t public.templates, route text, tier text,
  price integer, v2 boolean) returns boolean language plpgsql stable set search_path='' as $$
declare sale public.template_sale_approvals; p public.ai_providers; approved jsonb;
begin
  select * into sale from public.template_sale_approvals where template_id=t.id;
  if tier=any(sale.unpriced_resolutions) then return false; end if;
  if not v2 then return true; end if;
  if not coalesce(sale.enabled,false) then return false; end if;
  if route like 'env/_%' then
    return coalesce(price>=admin.fallback_route_floor(route,tier,t.quality)*admin.slot_floor_factor(t),false);
  end if;
  select * into p from public.ai_providers
    where module='image' and id::text=split_part(route,'/',1) and id::text||'/'||model=route;
  if not found or not (tier=any(admin.sale_route_resolutions(p))) then return false; end if;
  approved:=admin.template_approved_price(p.id,t.id);
  if approved->>'quality'=t.quality and (approved->'costs'->>tier)::int=price then return true; end if;
  return admin.alternate_route_meets_floor(route,tier,t.quality,price/admin.slot_floor_factor(t));
end $$;

-- 1295; single-image samples and the slot factor at save.
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
          and inputs ? 'quality' and inputs->>'quality'=t.quality and not (inputs ? 'input_slots')
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
      if not (tier=any(supported)) or admin.alternate_route_meets_floor(route_tag,tier,t.quality,(t.credits_cost->>tier)::int/admin.slot_floor_factor(t))
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)*admin.slot_floor_factor(t)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
end;
$$;

-- 1295; the alert and admin list show the floor a slot template is held to.
create or replace function admin.sale_floor_hidden() returns jsonb
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
        -- A slot template's floor is per slot (above); report the floor its price is held to.
        if admin.slot_floor_factor(t)>1 then
          floor:=floor||jsonb_build_object('slots',admin.slot_floor_factor(t),'credits',(floor->>'credits')::int*admin.slot_floor_factor(t));
        end if;
      end if;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('template_id',t.id,'quality',t.quality,
      'price',(t.credits_cost->>'1k')::int,'route',route,'reason',reason,'floor',floor));
  end loop;
  return result;
end $$;
