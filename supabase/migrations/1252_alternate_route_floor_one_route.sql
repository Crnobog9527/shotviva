-- Same floor as before, sampling only the route being priced. The old body called
-- admin_image_provider_pricing(''), which computes every provider's p95 from all 30-day
-- jobs, once per template on every catalogue read. The p95 goes through jsonb exactly as
-- that function returns it, so the rounding of the floor is unchanged.
create or replace function admin.alternate_route_meets_floor(p_tag text, p_resolution text,
  p_quality text, p_price integer) returns boolean
language sql stable set search_path='' as $$
  with route as (
    select p.adapter, p.capabilities, p.estimated_image_costs,
      (select to_jsonb(percentile_cont(0.95) within group (order by g.cost_usd)) #>> '{}'
         from public.generation_jobs g
        where g.provider=p_tag and coalesce(g.inputs->>'resolution','1k')=p_resolution
          and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
       having count(*)>=10) as p95
    from public.ai_providers p
    where p.module='image' and p.id::text||'/'||p.model=p_tag
      and p.resolutions @> array[p_resolution] and p.capabilities<>'{}'::jsonb
      and p_resolution in ('1k','2k','3k')
  ), priced as (
    select adapter,coalesce(p95::numeric,(estimated_image_costs->>p_resolution)::numeric,
      case when adapter='openrouter_images' and jsonb_typeof(capabilities->'catalogImageCosts'->p_resolution)='number'
        and (capabilities->'catalogImageCosts'->>p_resolution)::numeric > 0
        then (capabilities->'catalogImageCosts'->>p_resolution)::numeric end,
      case when adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"3k":0.135}'
                    else '{"1k":0.081,"2k":0.135,"3k":0.206}' end)::jsonb->>p_resolution)::numeric end) as usd
    from route
  ), budget as (
    select admin.lowest_credit_price()*0.761*0.4 as usd
  )
  select coalesce((select p_price >= ceil(priced.usd*1.10/nullif(budget.usd,0))
    and (priced.adapter<>'openai_images' or p_price>=(case when p_quality='medium' then
      '{"1k":1,"2k":2,"3k":3}' else '{"1k":2,"2k":4,"3k":6}' end::jsonb->>p_resolution)::int)
    from priced,budget),false)
$$;
