-- T96: under the batch lock, select the floor for each template’s effective model.
create or replace function public.admin_bulk_edit_templates(p_ids text[], p_patch jsonb, p_floor jsonb, p_actor uuid, p_locales text[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := array(select distinct u.id from unnest(coalesce(p_ids, '{}')) as u(id));
  v_patch jsonb := coalesce(p_patch, '{}');
  v_cost jsonb := coalesce(p_patch -> 'credits_cost', '{}');
  v_visible text[];
  v_category text := p_patch ->> 'category_key';
  v_failures jsonb;
  v_changed integer;
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 200 then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 200 templates';
  end if;
  if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}' or v_patch - 'credits_cost' - 'visible_in' - 'quality' - 'category_key' <> '{}' then
    raise exception 'INVALID_INPUT' using detail = 'patch must name credits_cost, visible_in, quality or category_key';
  end if;
  if v_patch ? 'quality' and (v_patch ->> 'quality') is distinct from 'high' and (v_patch ->> 'quality') is distinct from 'medium' then
    raise exception 'INVALID_INPUT' using detail = 'quality must be high or medium';
  end if;
  if jsonb_typeof(v_cost) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost must be an object';
  end if;
  if exists (
    select 1 from jsonb_each(v_cost) as e(key, value)
    where e.key not in ('1k', '2k', '3k') or jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^[1-9][0-9]{0,2}$'
  ) then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost tiers must be whole numbers 1..999';
  end if;
  if v_patch ? 'visible_in' then
    if jsonb_typeof(v_patch -> 'visible_in') <> 'array' then
      raise exception 'INVALID_INPUT' using detail = 'visible_in must be an array';
    end if;
    v_visible := array(select distinct x from jsonb_array_elements_text(v_patch -> 'visible_in') as v(x) order by x desc);
    if cardinality(v_visible) = 0 or not (v_visible <@ array['web', 'partner']) then
      raise exception 'INVALID_INPUT' using detail = 'visible_in must be web, partner or both';
    end if;
  end if;
  if v_patch ? 'category_key' then
    -- Held until commit, so the category cannot be deleted under this write.
    perform 1 from public.template_categories c where c.key = v_category and not c.is_system for share;
    if not found then
      raise exception 'CATEGORY_NOT_FOUND' using detail = 'category_key must name a category that is not a system one';
    end if;
  end if;
  if p_floor is null or exists (
    select 1 from unnest(array['high', 'medium']) as q(quality), unnest(array['1k', '2k', '3k']) as r(res)
    where jsonb_typeof(p_floor -> q.quality -> r.res) is distinct from 'number'
  ) then
    raise exception 'INVALID_INPUT' using detail = 'floor table is incomplete';
  end if;

  -- The rows are checked and written under one lock, so no other save slips in between.
  perform 1 from public.templates t where t.id = any (v_ids) for update;

  -- A supplier may have switched since the admin action read costs. Re-read the effective
  -- binding under the template lock; a missing/different model requires a fresh preview.
  if p_floor ? 'models' and exists (
    select 1 from public.templates t
      left join public.template_prompts tp on tp.template_id = t.id
      left join public.ai_providers active on active.is_active and active.module = 'image'
      left join public.ai_providers p on p.id = coalesce(tp.provider_id, active.id)
     where t.id = any(v_ids) and (
       not (p_floor->'providers' ? coalesce(p.id::text, 'env'))
       or (p.id is not null and p.model is distinct from (p_floor->'models'->>p.id::text)))
  ) then raise exception 'MODEL_CHANGED'; end if;

  with planned as (
    select a.id, t.id is not null as found, coalesce(t.name, a.id) as name, t.is_active,
           t.description, t.cover_before_url, t.cover_after_url, t.cover_locales, t.visible_in as old_visible,
           coalesce(v_patch ->> 'quality', t.quality) as quality,
           coalesce(p_floor -> 'providers' -> coalesce(tp.provider_id::text, active.id::text, 'env'), p_floor) as floor,
           t.credits_cost || v_cost as credits_cost,
           coalesce(v_visible, t.visible_in) as visible_in,
           a.id in ('edit', 'freeform') or coalesce(c.is_system, false) as is_builtin
    from unnest(v_ids) as a(id)
    left join public.templates t on t.id = a.id
    left join public.template_categories c on c.key = t.category_key
    left join public.template_prompts tp on tp.template_id = t.id
    left join public.ai_providers active on active.module = 'image' and active.is_active
  ),
  failures as (
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', case when p.found then 'system' else 'not_found' end) as failure
    from planned p
    where not p.found or p.is_builtin
    union all
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'reason', 'below_floor', 'resolution', r.res,
      'floor', (p.floor -> p.quality ->> r.res)::integer, 'given', (p.credits_cost ->> r.res)::integer
    )
    from planned p
    cross join unnest(array['1k', '2k', '3k']) as r(res)
    where p.found and not p.is_builtin and (p.credits_cost ->> r.res)::integer < (p.floor -> p.quality ->> r.res)::integer
    union all
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', 'web_incomplete')
    from planned p
    where p.found and not p.is_builtin and p.is_active
      and 'web' = any (p.visible_in) and not ('web' = any (p.old_visible))
      and (nullif(btrim(p.description), '') is null
           or not (nullif(btrim(p.cover_before_url), '') is not null or exists (
             select 1 from unnest(coalesce(p_locales, '{}')) as l(code)
             where nullif(btrim(p.cover_locales -> l.code ->> 'before'), '') is not null))
           or not (nullif(btrim(p.cover_after_url), '') is not null or exists (
             select 1 from unnest(coalesce(p_locales, '{}')) as l(code)
             where nullif(btrim(p.cover_locales -> l.code ->> 'after'), '') is not null)))
  )
  select coalesce(jsonb_agg(f.failure), '[]'::jsonb) into v_failures from failures f;

  if jsonb_array_length(v_failures) > 0 then
    return jsonb_build_object('failures', v_failures);
  end if;

  update public.templates t
  set quality = coalesce(v_patch ->> 'quality', t.quality),
      credits_cost = t.credits_cost || v_cost,
      visible_in = coalesce(v_visible, t.visible_in),
      -- templates.category (the English name) follows through T75's trigger.
      category_key = coalesce(v_category, t.category_key),
      featured_rank = case when v_visible is not null and not ('web' = any (v_visible)) then null else t.featured_rank end
  where t.id = any (v_ids);
  get diagnostics v_changed = row_count;

  return jsonb_build_object('failures', '[]'::jsonb, 'changed', v_changed);
end;
$$;

revoke execute on function public.admin_bulk_edit_templates(text[], jsonb, jsonb, uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_bulk_edit_templates(text[], jsonb, jsonb, uuid, text[]) to service_role;
