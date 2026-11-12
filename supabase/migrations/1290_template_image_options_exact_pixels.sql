-- 1K / 2K / 4K (PR-1, shotviva#534): the workspace prints each tier's pixel size. OpenAI routes
-- deliver the site's size table exactly; OpenRouter models answer with their own native sizes at
-- 1K and 2K, so the picker marks those as approximate. Adds one key, exactPixels, to the options
-- a template reports; everything else is 1100's definition unchanged. Deployed code ignores the
-- new key, and new code reads a missing key as exact.
create or replace function admin.template_image_options(public.templates) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'resolutions', array(select r from unnest(admin.sale_route_resolutions(p)) r where not(r=any(coalesce(s.unpriced_resolutions,'{}')))),
    'aspectRatios',case when p.adapter='openrouter_images' then coalesce(p.capabilities->'aspectRatios','[]'::jsonb)
      else '["16:9","4:5","1:1","9:16","3:2","4:3","2:3"]'::jsonb end,
    'originalRatio',case when p.adapter='openrouter_images' then coalesce(p.capabilities->'originalRatio','false'::jsonb) else 'true'::jsonb end,
    'exactPixels',p.adapter is distinct from 'openrouter_images')
  from public.templates t left join public.template_sale_approvals s on s.template_id=t.id
  left join public.template_prompts tp on tp.template_id=t.id
  left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,
    (select a.id from public.ai_providers a where a.module='image' and a.is_active))
  where t.id=$1.id and (t.is_active or current_setting('role',true)='service_role')
$$;
