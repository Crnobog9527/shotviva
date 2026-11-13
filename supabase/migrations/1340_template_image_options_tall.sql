-- Tall poster ratios 1:2 and 1:3 (dense-text posters, ARCHITECTURE §8.1). OpenAI routes can make
-- them; a template offers them only when its own fields.aspectRatios lists them, so every other
-- template keeps the same seven fixed sizes. Carries exactPixels from 1290 (shotviva#534) so the
-- definition is the same whichever of the two lands first. Deployed code ignores unknown ratios
-- (it intersects with its own list), so this is safe before the code ships.
create or replace function admin.template_image_options(public.templates) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'resolutions', array(select r from unnest(admin.sale_route_resolutions(p)) r where not(r=any(coalesce(s.unpriced_resolutions,'{}')))),
    'aspectRatios',(select coalesce(jsonb_agg(a.r order by a.n),'[]'::jsonb)
      from jsonb_array_elements_text(case when p.adapter='openrouter_images' then coalesce(p.capabilities->'aspectRatios','[]'::jsonb)
        else '["16:9","4:5","1:1","9:16","3:2","4:3","2:3","1:2","1:3"]'::jsonb end) with ordinality a(r,n)
      where a.r not in ('1:2','1:3') or coalesce(t.fields->'aspectRatios','[]'::jsonb) ? a.r),
    'originalRatio',case when p.adapter='openrouter_images' then coalesce(p.capabilities->'originalRatio','false'::jsonb) else 'true'::jsonb end,
    'exactPixels',p.adapter is distinct from 'openrouter_images')
  from public.templates t left join public.template_sale_approvals s on s.template_id=t.id
  left join public.template_prompts tp on tp.template_id=t.id
  left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,
    (select a.id from public.ai_providers a where a.module='image' and a.is_active))
  where t.id=$1.id and (t.is_active or current_setting('role',true)='service_role')
$$;
