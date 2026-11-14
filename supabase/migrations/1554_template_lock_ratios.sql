-- Per-template ratio lock (Owner 2026-11-15, ARCHITECTURE §8.1). A template whose
-- fields.lockAspectRatios is true offers exactly its fields.aspectRatios that the bound line can
-- make, in the line's order, and never 「跟随照片」 (originalRatio false). It is for fixed-layout
-- covers such as the prize posters (2:3), where any other ratio breaks the layout the user edits.
-- The flag lives in templates.fields, so the editor save, copy, bulk edit and prod←test sync carry
-- it unchanged. Other templates get exactly the 1553 result: tall ratios (1:2, 1:3) only when
-- listed, originalRatio from the line, and no new key. Same signature, so the deployed code keeps
-- working; it reads only resolutions / aspectRatios / originalRatio / exactPixels, and the server
-- check (allowedWebAspects) refuses any ratio not in the list, 'original' included.
create or replace function admin.template_image_options(public.templates) returns jsonb
language sql stable security definer set search_path='' as $_$
  select jsonb_build_object(
    'resolutions', array(select r from unnest(admin.sale_route_resolutions(p)) r where not(r=any(coalesce(s.unpriced_resolutions,'{}')))),
    'aspectRatios',(select coalesce(jsonb_agg(a.r order by a.n),'[]'::jsonb)
      from jsonb_array_elements_text(case when p.adapter='openrouter_images' then coalesce(p.capabilities->'aspectRatios','[]'::jsonb)
        else '["16:9","4:5","1:1","9:16","3:2","4:3","2:3","1:2","1:3"]'::jsonb end) with ordinality a(r,n)
      where case when l.locked then coalesce(t.fields->'aspectRatios','[]'::jsonb) ? a.r
        else a.r not in ('1:2','1:3') or coalesce(t.fields->'aspectRatios','[]'::jsonb) ? a.r end),
    'originalRatio',case when l.locked then 'false'::jsonb
      when p.adapter='openrouter_images' then coalesce(p.capabilities->'originalRatio','false'::jsonb) else 'true'::jsonb end,
    'exactPixels',p.adapter is distinct from 'openrouter_images')
    || case when l.locked then '{"lockedRatios":true}'::jsonb else '{}'::jsonb end
  from public.templates t
  cross join lateral (select coalesce(t.fields->'lockAspectRatios'='true'::jsonb,false) as locked) l
  left join public.template_sale_approvals s on s.template_id=t.id
  left join public.template_prompts tp on tp.template_id=t.id
  left join public.ai_providers p on p.id=coalesce(tp.provider_id,
    (select a.id from public.ai_providers a where a.module='image' and a.is_active))
  where t.id=$1.id and (t.is_active or current_setting('role',true)='service_role')
$_$;
