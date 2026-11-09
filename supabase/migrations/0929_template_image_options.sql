-- A computed field on templates. Use the real row identified by the argument, including its
-- publication state, since PostgREST can also expose a composite argument as a direct RPC.
create or replace function admin.template_image_options(public.templates)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p.adapter = 'openrouter_images' then jsonb_build_object(
      'aspectRatios', coalesce(p.capabilities->'aspectRatios','[]'::jsonb),
      'resolutions', coalesce(p.capabilities->'resolutions','[]'::jsonb),
      'originalRatio', coalesce(p.capabilities->'originalRatio','false'::jsonb))
    else '{"aspectRatios":["16:9","4:5","1:1","9:16","3:2","4:3","2:3"],"resolutions":["1k","2k","3k"],"originalRatio":true}'::jsonb end
  from public.templates t
  left join public.template_prompts tp on tp.template_id = t.id
  left join public.ai_providers p on p.id = coalesce(
    case when t.id <> 'edit' then tp.provider_id end,
    (select a.id from public.ai_providers a where a.module = 'image' and a.is_active))
  where t.id = $1.id and (t.is_active or current_setting('role',true) = 'service_role')
$$;
revoke all on function admin.template_image_options(public.templates) from public;
grant execute on function admin.template_image_options(public.templates) to anon, authenticated, service_role;
-- The SQL-standard body binds the helper at definition time. Callers only need EXECUTE,
-- not USAGE on the private admin schema. PostgREST sees an invoker computed field.
create or replace function public.template_image_options(public.templates)
returns jsonb language sql stable security invoker set search_path = ''
return admin.template_image_options($1);
revoke all on function public.template_image_options(public.templates) from public;
grant execute on function public.template_image_options(public.templates) to anon, authenticated, service_role;

-- Partner v1 uses the default provider and the template's ordered list, including ratios
-- outside the web picker. Require 1K and intersect with both the selected and actual model.
create or replace function admin.partner_image_aspects(public.templates)
returns text[] language sql stable security definer set search_path = '' as $$
  select array(
    select r.ratio from public.templates t
    cross join lateral jsonb_array_elements_text(t.fields->'aspectRatios') with ordinality r(ratio, ord)
    where t.id = $1.id and t.is_active and t.visible_in @> array['partner']
      and not exists (
        select 1 from public.ai_providers p
        where p.module = 'image' and p.adapter = 'openrouter_images'
          and (p.is_active or p.id = (select tp.provider_id from public.template_prompts tp where tp.template_id = t.id))
          and not coalesce((p.capabilities->'resolutions') ? '1k'
            and coalesce(p.capabilities->'providerAspectRatios', p.capabilities->'aspectRatios') ? r.ratio, false))
    order by r.ord)
$$;
revoke all on function admin.partner_image_aspects(public.templates) from public;
grant execute on function admin.partner_image_aspects(public.templates) to anon, authenticated, service_role;
-- The SQL-standard body binds the helper at definition time. Callers only need EXECUTE,
-- not USAGE on the private admin schema. PostgREST sees an invoker computed field.
create or replace function public.partner_image_aspects(public.templates)
returns text[] language sql stable security invoker set search_path = ''
return admin.partner_image_aspects($1);
revoke all on function public.partner_image_aspects(public.templates) from public, anon, authenticated;
grant execute on function public.partner_image_aspects(public.templates) to anon, authenticated, service_role;
