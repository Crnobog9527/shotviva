-- 1552: one cost pool per underlying OpenAI image model.
--
-- The official OpenAI line (openai_images, gpt-image-2.6-sunburst) and a BYOK OpenRouter line on
-- openai/gpt-image-2.6-sunburst (1551, byok_list_price) are billed the same: OpenAI's list price.
-- So the sale floor treats them as one route for costs:
--   * measured p95 (30 days, >=10 samples, quality and tier matched) pools the jobs of every line
--     in the pool, the env default line on that model included;
--   * the catalogue estimate of a list-priced OpenRouter line is not used: like the official line
--     it falls back to OpenAI's list estimate for its quality, without OpenRouter's top-up factor;
--   * approved v2 prices recorded against the official line hold on its BYOK pool-mates.
-- A non-BYOK OpenRouter line (byok_list_price off) keeps its own samples and catalogue estimate.
-- Expand-only: create or replace with unchanged signatures; old code reads the same shapes, with
-- one extra key (list_priced) on each admin_image_pricing_catalog provider.

create function admin.route_cost_tags(p_tag text) returns text[]
  language sql stable set search_path to '' as $$
  with me as (
    select admin.provider_cost_model(p) as m from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag
    union all select substr(p_tag, length('env/')+1) where p_tag like 'env/_%'
  )
  select array(select distinct tag from (
    select p_tag as tag
    union all select p.id::text||'/'||p.model from public.ai_providers p, me
      where me.m is not null and p.module='image' and admin.provider_cost_model(p)=me.m
    union all select 'env/'||me.m from me where me.m is not null
  ) pool order by tag)
$$;

revoke all on function admin.route_cost_tags(text) from public, anon, authenticated;
grant execute on function admin.route_cost_tags(text) to service_role;

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
    select admin.lowest_credit_price()*0.761*0.4 as usd
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
  ), budget as (select admin.lowest_credit_price()*0.761*0.4 as usd)
  select greatest(1,ceil(priced.usd*1.10/budget.usd),
    case when listed then
      ((case when p_quality='medium' then '{"1k":1,"2k":2,"4k":3}'
        else '{"1k":2,"2k":4,"4k":6}' end)::jsonb->>public.canonical_resolution(p_resolution))::int end)
    from priced,budget where priced.usd is not null and budget.usd>0
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k') and p_quality in ('medium','high')
$$;

create or replace function admin.route_p95_by_quality(p_tag text) returns jsonb
  language sql stable set search_path to '' as $$
  select coalesce(jsonb_object_agg(quality,tiers),'{}'::jsonb) from (
    select quality,jsonb_object_agg(res,cost) tiers from (
      -- Jobs before PR-2 say 3k for the same tier as 4k: one sample set.
      select g.inputs->>'quality' quality, public.canonical_resolution(g.inputs->>'resolution') res,
        percentile_cont(0.95) within group (order by g.cost_usd) cost
      from public.generation_jobs g
      where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs ? 'quality' and g.inputs->>'quality' in ('medium','high')
        and g.inputs->>'resolution' in ('1k','2k','3k','4k')
        and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
        and not (g.inputs ? 'input_slots')
      group by 1,2 having count(*)>=10
    ) per_tier group by quality
  ) per_quality
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
            and admin.slot_count(g.inputs) between 2 and 4
          group by 1,2,3 having count(*)>=10
        ) per_n group by quality, res
      ) per_res group by quality
    ) per_quality),'{}'::jsonb))
$$;

create or replace function admin.slot_route_floor(p_tag text, p_resolution text, p_quality text, p_slots integer, p_single integer) returns integer
  language sql stable set search_path to '' as $$
  with budget as (select admin.lowest_credit_price()*0.761*0.4 as usd),
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

-- Approvals were recorded against the official line (provider_id, endpoint hash). They hold on
-- that line and on a BYOK OpenRouter line running the same model; the official row must still
-- exist with the recorded endpoint (admin_delete_provider below refuses to drop it).
create or replace function admin.template_approved_price(p_provider uuid, p_template text) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('quality',c.quality,'costs',c.costs)
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers sp on sp.id=s.provider_id
  join public.ai_providers p on p.id=p_provider
  where b.reverted_at is null and admin.is_template_catalog_v2() and s.template_id=p_template
    and sp.module='image' and sp.adapter='openai_images' and sp.model='gpt-image-2.6-sunburst'
    and md5(sp.base_url) is not distinct from s.provider_endpoint_hash
    and (sp.capabilities->'resolutions') ?& array['1k','2k','4k']
    and p.module='image' and (p.id=sp.id or (p.adapter='openrouter_images' and admin.provider_cost_model(p)=sp.model))
    and (p.capabilities->'resolutions') ?& array['1k','2k','4k']
  limit 1
$$;

create or replace function admin.template_approved_prices(p_provider uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(s.template_id,jsonb_build_object('quality',c.quality,'costs',c.costs)), '{}')
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers sp on sp.id=s.provider_id
  join public.ai_providers p on p.id=p_provider
  where b.reverted_at is null and admin.is_template_catalog_v2()
    and sp.module='image' and sp.adapter='openai_images' and sp.model='gpt-image-2.6-sunburst'
    and md5(sp.base_url) is not distinct from s.provider_endpoint_hash
    and (sp.capabilities->'resolutions') ?& array['1k','2k','4k']
    and p.module='image' and (p.id=sp.id or (p.adapter='openrouter_images' and admin.provider_cost_model(p)=sp.model))
    and (p.capabilities->'resolutions') ?& array['1k','2k','4k']
$$;

-- A price equal to an approved one needs the approval to hold on this route; otherwise the
-- route's own floor applies.
create or replace function admin.reservation_route_allowed(t public.templates, route text, tier text, price integer, fallback boolean, v2 boolean) returns boolean
  language plpgsql stable set search_path to '' as $$
begin
  if fallback or exists (
    select from public.template_prompts tp join public.ai_providers p on p.id=tp.provider_id
    where tp.template_id=t.id and route is distinct from p.id::text||'/'||p.model
  ) then
    if not coalesce(price>=admin.slot_floor_credits(t,route,tier,admin.fallback_route_floor(route,tier,t.quality)::int),false) then return false; end if;
  end if;
  if v2 and exists (
    select from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
    join admin.template_tariffs_v2 c on c.id=s.template_id
    where b.reverted_at is null and s.template_id=t.id and c.quality=t.quality
      and c.costs->tier=t.credits_cost->tier
  ) and admin.template_approved_price((select p.id from public.ai_providers p where p.module='image'
      and p.id::text=split_part(route,'/',1) and p.id::text||'/'||p.model=route), t.id) is null
  then return coalesce(price>=admin.slot_floor_credits(t,route,tier,(admin.alternate_route_floor(route,tier,t.quality)->>'credits')::int),false); end if;
  return true;
end $$;

create or replace function public.admin_image_provider_pricing(p_env_model text)
  returns table(provider_id uuid, label text, model text, adapter text, is_active boolean, capabilities jsonb,
    resolutions text[], estimated_image_costs jsonb, p95 jsonb)
  language sql stable set search_path to '' as $$
  select r.id, r.label, r.model, r.adapter, r.is_active, r.capabilities, r.resolutions, r.estimated_image_costs,
    coalesce((
      -- Jobs before PR-2 say 3k for the same tier as 4k: one sample set.
      select jsonb_object_agg(s.resolution, s.cost) from (
        select public.canonical_resolution(coalesce(g.inputs->>'resolution', '1k')) as resolution,
               percentile_cont(0.95) within group (order by g.cost_usd) as cost
          from public.generation_jobs g
         where g.provider = any((select admin.route_cost_tags(r.tag))::text[])
           and g.created_at >= now() - interval '30 days'
           and coalesce(g.inputs->>'resolution', '1k') in ('1k','2k','3k','4k')
           and g.status = 'succeeded' and g.cost_usd is not null
           and not (g.inputs ? 'input_slots')
         group by 1 having count(*) >= 10
      ) s), '{}'::jsonb)
  from (
    select p.id, p.label, p.model, p.adapter, p.is_active, p.capabilities, p.resolutions, p.estimated_image_costs,
           p.id::text || '/' || p.model as tag
      from public.ai_providers p where p.module = 'image'
    union all
    select null::uuid, '环境默认'::text, p_env_model, 'openai_images'::text, true, '{}'::jsonb,
           array['1k', '2k', '4k'], '{}'::jsonb, 'env/' || p_env_model
     where not exists (select 1 from public.ai_providers where module = 'image' and is_active)
  ) r
  order by 2, 1
$$;

-- list_priced tells the editor to price the line like the official one (no catalogue estimate,
-- OpenAI's list estimate by quality), as alternate_route_floor does.
create or replace function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
  language sql stable set search_path to '' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
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

-- The official line's row carries the approved prices its BYOK pool-mates sell at: keep it while a
-- live price batch points at it, even after no template is bound to it.
create or replace function public.admin_delete_provider(p_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare
  v_active boolean;
begin
  -- Row lock: a concurrent switch to this row waits for the delete, or the delete sees it active.
  select is_active into v_active from public.ai_providers where id = p_id for update;
  if not found then
    raise exception 'PROVIDER_NOT_FOUND';
  end if;
  -- The module would silently fall back (env, or none for decision): switch first.
  if v_active then
    raise exception 'PROVIDER_ACTIVE' using errcode = '55000';
  end if;

  if exists (select 1 from public.template_prompts where provider_id = p_id) then
    raise exception 'PROVIDER_REFERENCED' using errcode = '23503';
  end if;
  if exists (select 1 from admin.template_price_snapshots s join admin.template_price_batches b on b.id = s.batch_id
             where s.provider_id = p_id and b.reverted_at is null) then
    raise exception 'PROVIDER_REFERENCED' using errcode = '23503', detail = '这条线路记着已批准的价格，其他线路在沿用，不能删除';
  end if;

  delete from public.ai_providers where id = p_id;
  delete from vault.secrets where name = 'shotviva.provider.' || p_id::text;
end;
$$;
