-- Admin pricing only. One indexed 30-day scan over measured, successful generations, and
-- exact provider row UUID + model tags (switching a provider's model starts a new sample).
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
revoke all on function public.admin_image_provider_pricing(text) from public, anon, authenticated;
grant execute on function public.admin_image_provider_pricing(text) to service_role;
