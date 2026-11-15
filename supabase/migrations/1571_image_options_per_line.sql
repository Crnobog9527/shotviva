-- 1571: load speed, part 3 (Owner, 2026-11-15「可以继续优化加载速度」).
--
-- template_image_options ran once per template in the catalogue read (~5 ms a row on production),
-- re-reading its line's row and capabilities each time, though only a few lines exist. What depends
-- only on the line (sale tiers, its ratio list, original ratio, exact pixels) is now worked out once
-- per line per statement through 1570's statement memo (cleared by any ai_providers write in the
-- statement); what depends on the template (unpriced tiers, locked ratios, the 1:2/1:3 opt-in) is
-- applied per row exactly as before. The default line's id is kept the same way. The 1554 body
-- stays as template_image_options_now, and the result is the same for every template.
-- Expand-only: new private functions; the replaced one keeps its signature and result.

create function admin.template_image_options_now(public.templates) returns jsonb
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

revoke all on function admin.template_image_options_now(public.templates) from public, anon, authenticated;
grant execute on function admin.template_image_options_now(public.templates) to service_role;

-- The line-only part of 1554's result, for one line id (null or a missing row: no line, as the
-- left join there gave).
create function admin.line_image_options_now(p_id uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object(
    'resolutions', to_jsonb(admin.sale_route_resolutions(p)),
    'ratios', case when p.adapter='openrouter_images' then coalesce(p.capabilities->'aspectRatios','[]'::jsonb)
      else '["16:9","4:5","1:1","9:16","3:2","4:3","2:3","1:2","1:3"]'::jsonb end,
    'originalRatio', case when p.adapter='openrouter_images' then coalesce(p.capabilities->'originalRatio','false'::jsonb) else 'true'::jsonb end,
    'exactPixels', to_jsonb(p.adapter is distinct from 'openrouter_images'))
  from (select 1) one left join public.ai_providers p on p.id=p_id
$$;

create function admin.line_image_options(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path to '' as $$
declare
  k text := 'line_image_options|' || quote_nullable(p_id);
  hit jsonb := admin.stmt_memo(k);
  v jsonb;
begin
  if hit ? 'v' and jsonb_typeof(hit->'v') = 'object' then return hit->'v'; end if;
  v := admin.line_image_options_now(p_id);
  perform admin.stmt_memo_put(k, v);
  return v;
end $$;

-- The active image line's id, once per statement.
create function admin.active_image_line() returns uuid
  language plpgsql stable security definer set search_path to '' as $$
declare
  hit jsonb := admin.stmt_memo('active_image_line');
  v uuid;
begin
  if hit ? 'v' and jsonb_typeof(hit->'v') in ('string', 'null') and coalesce(hit->>'v', '') ~ '^([0-9a-f-]{36})?$' then
    return (hit->>'v')::uuid;
  end if;
  select a.id into v from public.ai_providers a where a.module='image' and a.is_active;
  perform admin.stmt_memo_put('active_image_line', to_jsonb(v));
  return v;
end $$;

revoke all on function admin.line_image_options_now(uuid), admin.line_image_options(uuid), admin.active_image_line()
  from public, anon, authenticated;
grant execute on function admin.line_image_options_now(uuid), admin.line_image_options(uuid), admin.active_image_line()
  to service_role;

create or replace function admin.template_image_options(public.templates) returns jsonb
  language plpgsql stable security definer set search_path to '' as $_$
declare
  tid text;
  lock_flag jsonb;
  ratios jsonb;
  unpriced text[];
  line uuid;
  o jsonb;
  locked boolean;
begin
  -- Only the two keys this needs, not the whole row.
  select x.id, x.fields->'lockAspectRatios', coalesce(x.fields->'aspectRatios','[]'::jsonb) into tid, lock_flag, ratios
    from public.templates x
    where x.id=$1.id and (x.is_active or current_setting('role',true)='service_role');
  if not found then return null; end if;
  select s.unpriced_resolutions into unpriced from public.template_sale_approvals s where s.template_id=tid;
  select tp.provider_id into line from public.template_prompts tp where tp.template_id=tid;
  if line is null then line := admin.active_image_line(); end if;
  o := admin.line_image_options(line);
  locked := coalesce(lock_flag='true'::jsonb, false);
  return jsonb_build_object(
    'resolutions', array(select r from jsonb_array_elements_text(o->'resolutions') r where not(r=any(coalesce(unpriced,'{}')))),
    'aspectRatios', (select coalesce(jsonb_agg(a.r order by a.n),'[]'::jsonb)
      from jsonb_array_elements_text(o->'ratios') with ordinality a(r,n)
      where case when locked then ratios ? a.r
        else a.r not in ('1:2','1:3') or ratios ? a.r end),
    'originalRatio', case when locked then 'false'::jsonb else o->'originalRatio' end,
    'exactPixels', o->'exactPixels')
    || case when locked then '{"lockedRatios":true}'::jsonb else '{}'::jsonb end;
end $_$;
