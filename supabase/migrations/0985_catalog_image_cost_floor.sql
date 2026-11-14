-- A fixed catalog quote includes the OpenRouter top-up fee and is used only after
-- exact-route p95 and an explicit per-image estimate, as on template saves.
create or replace function admin.alternate_route_meets_floor(p_tag text,p_resolution text,p_quality text,p_price int)
returns boolean language sql stable set search_path='' as $$
  with route as (
    select p.* from public.admin_image_provider_pricing('') p
    where p.provider_id::text||'/'||p.model=p_tag
      and p.resolutions @> array[p_resolution] and p.capabilities<>'{}'::jsonb
  ), priced as (
    select adapter,coalesce((p95->>p_resolution)::numeric,(estimated_image_costs->>p_resolution)::numeric,
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
