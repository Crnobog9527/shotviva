-- This invoker RPC uses the same configured-and-confirmed tiers as the sale editor.
grant execute on function admin.sale_route_resolutions(public.ai_providers) to service_role;

-- Existing hidden prices are retained. Only explicitly edited tiers must be supported.
create function admin.bulk_model_problem(t public.templates,tp public.template_prompts,p public.ai_providers,updated_costs jsonb)
returns text language plpgsql stable set search_path='' as $$
declare caps jsonb:=p.capabilities; refs int:=coalesce(jsonb_array_length(tp.style_refs),0); ratios jsonb;
begin
  if tp.template_id is null then return '缺少提示词'; end if;
  if t.module<>'image' then return '仅图片模板支持出图模型'; end if;
  if p.adapter='openrouter_images' and coalesce(jsonb_array_length(caps->'resolutions'),0)=0 then return '所选模型的能力尚未确认'; end if;
  if exists(select from jsonb_object_keys(updated_costs) tier where not (tier=any(admin.sale_route_resolutions(p)))) then
    return '所选模型不支持所填积分档位';
  end if;
  ratios:=coalesce(caps->'providerAspectRatios',caps->'aspectRatios');
  if ratios is not null and exists(select from jsonb_array_elements_text(t.fields->'aspectRatios') r where not (ratios ? r)) then
    return '所选模型不支持模板配置的比例';
  end if;
  if coalesce((t.fields#>>'{images,min}')::int,case when refs>0 then 0 end)+refs<coalesce((caps->>'minReferences')::int,0) or
     coalesce((t.fields#>>'{images,max}')::int,case when refs>0 then 0 end)+refs>coalesce((caps->>'maxReferences')::int,4) then
    return '用户照片与画风参考图总数超出模型范围';
  end if;
  return null;
end;
$$;
revoke all on function admin.bulk_model_problem(public.templates,public.template_prompts,public.ai_providers,jsonb) from public,anon,authenticated;
grant execute on function admin.bulk_model_problem(public.templates,public.template_prompts,public.ai_providers,jsonb) to service_role;

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
  change_model boolean := p_patch ? 'provider_id';
  target uuid := (p_patch->>'provider_id')::uuid;
  v_category text := p_patch ->> 'category_key';
  v_failures jsonb;
  catalog_minimums jsonb:=case when admin.is_template_catalog_v2() then admin.template_catalog_minimums() else '{}' end;
  v_changed integer;
begin
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 200 then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 200 templates';
  end if;
  if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}' or v_patch - 'credits_cost' - 'visible_in' - 'quality' - 'category_key' - 'provider_id' <> '{}' then
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
  perform 1 from public.templates t where t.id = any (v_ids) order by t.id for update;
  if change_model then
    perform 1 from public.template_prompts where template_id=any(v_ids) order by template_id for update;
    perform 1 from public.ai_providers where module='image' and (id=target or (target is null and is_active)) for share;
    if target is not null and not found then raise exception 'MODEL_CHANGED'; end if;
  end if;

  if admin.is_template_catalog_v2() and (p_floor->>'version') is distinct from 'v2' then
    raise exception 'MODEL_CHANGED' using detail='请刷新模板报价后再保存';
  end if;
  -- A supplier may have switched since the admin action read costs. Re-read the effective
  -- binding under the template lock; a missing/different model requires a fresh preview.
  if p_floor ? 'models' and exists (
    select 1 from public.templates t
      left join public.template_prompts tp on tp.template_id = t.id
      left join public.ai_providers active on active.is_active and active.module = 'image'
      left join public.ai_providers p on p.id = coalesce(case when change_model then target else tp.provider_id end, active.id)
     where t.id = any(v_ids) and (
       not (p_floor->'providers' ? coalesce(p.id::text, 'env'))
       or (p.id is not null and p.model is distinct from (p_floor->'models'->>p.id::text)))
  ) then raise exception 'MODEL_CHANGED'; end if;

  with planned as (
    select a.id, t.id is not null as found, coalesce(t.name, a.id) as name, t.is_active,
           t.description, t.cover_before_url, t.cover_after_url, t.cover_locales, t.visible_in as old_visible,
           coalesce(v_patch ->> 'quality', t.quality) as quality,
           coalesce(p_floor -> 'providers' -> coalesce((case when change_model then target else tp.provider_id end)::text, active.id::text, 'env'), p_floor) as floor,
           admin.template_approved_prices(coalesce(case when change_model then target else tp.provider_id end,active.id))->t.id as approved,
           catalog_minimums->t.id as tariff,
           coalesce(sale.unpriced_resolutions, array(select tier from unnest(array['1k','2k','3k']) tier
             where tier<>all(admin.sale_route_resolutions(previous)))) as unpriced_resolutions,
           t.credits_cost || v_cost as credits_cost,
           coalesce(v_visible, t.visible_in) as visible_in,
           a.id in ('edit', 'freeform') or coalesce(c.is_system, false) as is_builtin,
           case when change_model then admin.bulk_model_problem(t,tp,chosen,v_cost)
                when exists(select from jsonb_object_keys(v_cost) tier where not(tier=any(admin.sale_route_resolutions(chosen))))
                then '所选模型不支持所填积分档位' end model_problem
    from unnest(v_ids) as a(id)
    left join public.templates t on t.id = a.id
    left join public.template_categories c on c.key = t.category_key
    left join public.template_sale_approvals sale on sale.template_id = t.id
    left join public.template_prompts tp on tp.template_id = t.id
    left join public.ai_providers active on active.module = 'image' and active.is_active
    left join public.ai_providers previous on previous.id=coalesce(tp.provider_id,active.id)
    left join public.ai_providers chosen on chosen.id=coalesce(case when change_model then target else tp.provider_id end,active.id)
  ),
  failures as (
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', case when p.found then 'system' else 'not_found' end) as failure
    from planned p
    where not p.found or p.is_builtin
    union all
    select jsonb_build_object('id',p.id,'name',p.name,'reason','model','detail',p.model_problem)
    from planned p where p.found and not p.is_builtin and p.model_problem is not null
    union all
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'reason', 'below_floor', 'resolution', r.res,
      'floor', minimum.credits, 'given', (p.credits_cost ->> r.res)::integer
    )
    from planned p
    cross join unnest(array['1k', '2k', '3k']) as r(res)
    cross join lateral (select greatest((p.floor -> p.quality ->> r.res)::integer,
      case when p.tariff->>'quality'=p.quality then (p.tariff->'costs'->>r.res)::integer end) as credits) minimum
    where p.found and not p.is_builtin
      and (v_cost ? r.res or not (r.res=any(p.unpriced_resolutions)))
      and (p.credits_cost ->> r.res)::integer < minimum.credits
      and not coalesce(p.approved->>'quality'=p.quality and p.approved->'costs'->r.res=p.credits_cost->r.res,false)
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

  -- Capture missing legacy tier markers against the old route before changing a binding.
  if change_model or v_cost <> '{}'::jsonb then
    perform admin.set_template_unpriced_resolutions(t.id, null)
      from public.templates t where t.id=any(v_ids)
        and not exists(select from public.template_sale_approvals s where s.template_id=t.id);
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

  if change_model then
    update public.template_prompts set provider_id=target where template_id=any(v_ids) and provider_id is distinct from target;
  end if;

  -- A capability expansion or a model change alone never opens a previously unpriced tier.
  if v_cost <> '{}'::jsonb then
    perform admin.set_template_unpriced_resolutions(s.template_id,
      array(select tier from unnest(s.unpriced_resolutions) tier where not (v_cost ? tier)))
    from public.template_sale_approvals s where s.template_id=any(v_ids)
      and exists(select from unnest(s.unpriced_resolutions) tier where v_cost ? tier);
  end if;
  return jsonb_build_object('failures', '[]'::jsonb, 'changed', v_changed);
end;
$$;
