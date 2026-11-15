-- The built-in `edit` template may be bound to an image line like any other template
-- (ARCHITECTURE §5.2, /admin/templates/edit 「出图模型」). Until now every check below ignored
-- template_prompts.provider_id for `edit` and priced, sized and reference-checked it on the active
-- line. A null binding keeps exactly that (the edit follows the default line); a set binding is
-- now honoured the same way as a web template's. Same signatures throughout, so the deployed code
-- keeps working: it never sends provider_id for `edit`, which keeps the stored binding (null).
-- Not changed: web_standard_sale_allowed and sale_floor_hidden (they only see templates on the web
-- surface, which `edit` never is) and activate_template_price_catalog_v2 (one-time cutover, done).

-- `edit` has one configuration: no 「切换配置」 (switch_template_profile and admin_save_template_profile
-- refuse it) and one wrapper for every line. Its profile label therefore follows the bound line
-- both ways, with its one profile row and its history, so the 1443 family check holds when the
-- Owner binds it to an Ark line or back. Other templates keep the 1490 rule unchanged.
create or replace function admin.relabel_seedream_rebind() returns trigger
language plpgsql security definer set search_path='' as $$
declare target text := admin.provider_profile(new.provider_id);
begin
  if new.template_id='edit' and new.provider_id is distinct from old.provider_id and target<>new.active_profile then
    delete from public.template_profiles where template_id='edit' and profile=target;
    update public.template_profiles set profile=target, updated_at=now() where template_id='edit' and profile=new.active_profile;
    update public.template_prompt_versions set profile=target where template_id='edit';
    new.active_profile := target;
    return new;
  end if;
  if new.provider_id is distinct from old.provider_id
     and old.active_profile='openai' and new.active_profile='openai'
     and target='seedream'
     and admin.is_seedream_route(old.provider_id)
     and not exists(select from public.template_profiles where template_id=new.template_id and profile='seedream') then
    update public.template_profiles set profile='seedream', updated_at=now()
      where template_id=new.template_id and profile='openai';
    update public.template_prompt_versions v set profile='seedream'
      where v.template_id=new.template_id and v.profile='openai' and admin.is_seedream_route(v.provider_id);
    new.active_profile := 'seedream';
  end if;
  return new;
end $$;

-- Input range on the line the edit runs on. Edits still attach no style references.
create or replace function admin.assert_template_reference_range(p_id text) returns void
language plpgsql set search_path='' as $$
declare
  v_images jsonb;
  v_count integer;
  v_provider uuid;
  v_min integer;
  v_max integer;
begin
  select t.fields->'images',coalesce(jsonb_array_length(tp.style_refs),0),tp.provider_id
    into v_images,v_count,v_provider from public.templates t
    left join public.template_prompts tp on tp.template_id=t.id where t.id=p_id and t.module='image';
  if not found then return; end if;
  -- Edits use the source work and never attach template style references.
  if p_id='edit' then v_count := 0; end if;
  select coalesce((p.capabilities->>'minReferences')::integer,0),
         coalesce((p.capabilities->>'maxReferences')::integer,case when p.adapter='openai_images' then 4 end)
    into v_min,v_max from public.ai_providers p where p.module='image'
      and (p.id=v_provider or (v_provider is null and p.is_active)) for share;
  if not found then v_min:=0; v_max:=4; end if;
  -- A legacy OpenRouter row without a catalog snapshot still supports legacy saves.
  -- Configuring private images requires a known upper bound as in 0941.
  if (v_count > 0 and v_max is null)
     or coalesce((v_images->>'min')::integer,case when v_count>0 then 0 end) + v_count < v_min
     or coalesce((v_images->>'max')::integer,case when v_count>0 then 0 end) + v_count > v_max then
    raise exception 'MODEL_REFERENCE_LIMIT' using detail=format(
      '模型支持 %s–%s 张输入图，模板设置为 %s–%s 张用户照片，加上 %s 张画风参考图',
      v_min,coalesce(v_max::text,'未知'),v_images->>'min',v_images->>'max',v_count);
  end if;
end;
$$;

-- Sale floor on the bound line, as for every other template.
create or replace function admin.assert_template_sale_floor(t public.templates) returns void
language plpgsql security definer set search_path='' as $$
declare
  bound uuid;
  route_tag text;
  supported text[];
  approved jsonb;
  tier text;
  budget numeric;
  usd numeric;
  openai_min jsonb;
  openai_usd jsonb;
  env_p95 jsonb;
begin
  if exists(select from public.template_sale_approvals s where s.template_id=t.id and s.unpriced_resolutions @> array['1k','2k','4k']) then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='请先为至少一个可售档位定价'; end if;
  select provider_id into bound from public.template_prompts where template_id=t.id for share;
  -- Keep model selection and its configured estimate stable through this commit.
  select p.id,p.id::text||'/'||p.model,admin.sale_route_resolutions(p) into bound,route_tag,supported
    from public.ai_providers p where p.module='image' and (p.id=bound or (bound is null and p.is_active)) for share;
  if bound is not null and cardinality(supported)=0 then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='所选模型的可用档位尚未确认'; end if;
  approved := admin.template_approved_prices(bound)->t.id;

  -- With no database provider the server uses its OpenAI environment model. SQL cannot
  -- see that setting. Take the highest eligible model p95 per tier in that case, at the
  -- template's own quality (1295).
  if bound is null then
    budget := admin.lowest_credit_price()*0.761*0.4;
    select jsonb_object_agg(r, cost) into env_p95 from (
      select r, max(p95) cost from (
        select provider, public.canonical_resolution(coalesce(inputs->>'resolution','1k')) r,
          percentile_cont(0.95) within group (order by cost_usd) p95
        from public.generation_jobs where provider like 'env/%' and status='succeeded'
          and cost_usd is not null and created_at >= now()-interval '30 days'
          and inputs ? 'quality' and inputs->>'quality'=t.quality and not (inputs ? 'input_slots')
        group by 1,2 having count(*)>=10
      ) per_model group by r
    ) per_tier;
  end if;
  if t.quality='medium' then
    openai_min := '{"1k":1,"2k":2,"4k":3}'; openai_usd := '{"1k":0.055,"2k":0.095,"4k":0.135}';
  else
    openai_min := '{"1k":2,"2k":4,"4k":6}'; openai_usd := '{"1k":0.081,"2k":0.135,"4k":0.206}';
  end if;
  foreach tier in array array['1k','2k','4k'] loop
    if exists(select from public.template_sale_approvals s where s.template_id=t.id and tier=any(s.unpriced_resolutions)) then continue; end if;
    if approved->>'quality'=t.quality and approved->'costs'->tier=t.credits_cost->tier then continue; end if;
    -- T96 never sells unsupported resolutions on this model. Those fields keep
    -- their existing positive placeholder; fallback reservations have their own check.
    if bound is not null then
      if not (tier=any(supported)) or coalesce((t.credits_cost->>tier)::int>=admin.slot_floor_credits(t,route_tag,tier,(admin.alternate_route_floor(route_tag,tier,t.quality)->>'credits')::int),false)
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= admin.slot_floor_credits(t,'env/unknown',tier,greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)::int)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
end;
$$;

-- Tiers the bound line supports decide which may stay priced.
create or replace function admin.set_template_unpriced_resolutions(p_id text, p_unpriced text[]) returns void
language plpgsql security definer set search_path='' as $$
declare t public.templates; supported text[]; previous text[]; next_unpriced text[];
begin
  -- 3k from a caller still on the old name is read as 4k (PR-2).
  p_unpriced := public.canonical_tier_array(p_unpriced);
  select * into strict t from public.templates where id=p_id for update;
  select admin.sale_route_resolutions(p) into supported
    from public.templates x left join public.template_prompts tp on tp.template_id=x.id
    left join public.ai_providers p on p.id=coalesce(tp.provider_id,
      (select a.id from public.ai_providers a where a.module='image' and a.is_active)) where x.id=p_id;
  select unpriced_resolutions into previous from public.template_sale_approvals where template_id=p_id;
  next_unpriced:=coalesce(p_unpriced, previous, array(select tier from unnest(array['1k','2k','4k']) tier where tier<>all(supported)));
  if not (next_unpriced <@ array['1k','2k','4k']) or array_position(next_unpriced,null) is not null or exists(
    select from unnest(coalesce(previous,array['1k','2k','4k'])) tier where tier<>all(next_unpriced) and tier<>all(supported))
  then raise exception 'MODEL_CHANGED'; end if;
  if next_unpriced is not distinct from previous then return; end if;
  insert into public.template_sale_approvals(template_id,unpriced_resolutions) values(p_id,next_unpriced)
    on conflict(template_id) do update set unpriced_resolutions=excluded.unpriced_resolutions;
  if previous is not null and not(previous <@ next_unpriced) then perform admin.assert_template_sale_floor(t); end if;
end;
$$;

-- The sizes and ratios the edit panel offers follow the bound line.
create or replace function admin.template_image_options(public.templates) returns jsonb
language sql stable security definer set search_path='' as $_$
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
  left join public.ai_providers p on p.id=coalesce(tp.provider_id,
    (select a.id from public.ai_providers a where a.module='image' and a.is_active))
  where t.id=$1.id and (t.is_active or current_setting('role',true)='service_role')
$_$;

-- prod←test sync: the edit template's quote is its bound line's, plus the active line's when it
-- has none (as for every template). p_edit stays in the signature for the sync RPCs that pass it.
create or replace function admin.template_sync_quote(p_receipt jsonb, p_provider uuid, p_edit boolean) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_array(p_receipt->'terms',
    p_receipt->'routes'->p_provider::text,
    case when p_provider is null then p_receipt->'routes'->(p_receipt->>'active') end)
$$;

-- The editor save: `edit` takes the provider_id it is sent (null means 跟随默认线路) and, sent
-- none, keeps its stored binding, like every template. The rest is unchanged.
create or replace function public.admin_upsert_template(p_template jsonb, p_prompt jsonb) returns void
language plpgsql set search_path='' as $$
declare
  v_id text := p_template ->> 'id';
  v_provider uuid;
  v_model text;
  v_floor jsonb;
  v_resolution text;
  v_approved jsonb;
  unpriced text[];
begin
  -- 3k from a caller still on the old name is read as 4k (PR-2).
  p_template := public.canonical_tiers(p_template);
  perform 1 from public.templates where id = v_id for update;
  if p_prompt ? 'provider_id' then
    v_provider := (p_prompt ->> 'provider_id')::uuid;
  else
    select provider_id into v_provider from public.template_prompts where template_id = v_id;
  end if;
  select p.id, p.model into v_provider, v_model from public.ai_providers p
    where p.module = 'image' and (p.id = v_provider or (v_provider is null and p.is_active)) for share;

  -- Older deployments send no pricing snapshot. New code derives it from site products and
  -- measured costs on the server; callers without the service role cannot invoke this RPC.
  if admin.is_template_catalog_v2() and (p_template#>>'{price_floors,version}') is distinct from 'v2' then
    raise exception 'MODEL_CHANGED' using detail='请刷新模板报价后再保存';
  end if;
  if p_template ? 'unpriced_resolutions' then
    unpriced:=array(select jsonb_array_elements_text(p_template->'unpriced_resolutions'));
  else
    select unpriced_resolutions into unpriced from public.template_sale_approvals where template_id=v_id;
  end if;
  if p_template ? 'price_floors' then
    v_floor := p_template->'price_floors'->'providers'->coalesce(v_provider::text, 'env');
    if v_floor is null or (v_provider is not null and p_template->'price_floors' ? 'models'
        and v_model is distinct from (p_template->'price_floors'->'models'->>v_provider::text)) then
      raise exception 'MODEL_CHANGED';
    end if;
    v_approved := admin.template_approved_prices(v_provider)->v_id;
    foreach v_resolution in array array['1k','2k','4k'] loop
      if v_resolution=any(unpriced) then continue; end if;
      if (p_template->'credits_cost'->>v_resolution)::integer <
          (v_floor->coalesce(p_template->>'quality','high')->>v_resolution)::integer
        and not coalesce(v_approved->>'quality'=p_template->>'quality'
          and v_approved->'costs'->v_resolution=p_template->'credits_cost'->v_resolution,false) then
        raise exception 'MODEL_CREDIT_FLOOR' using detail = format('%s 积分低于所选模型下限，请检查该档建议积分和成本估价', v_resolution);
      end if;
    end loop;
  end if;
  insert into public.templates as t (
    id, module, name, category, category_key, cover_before_url, cover_after_url,
    fields, quality, credits_cost, sort_order, is_active, visible_in, translations, description, featured_rank
  ) values (
    v_id,
    coalesce(p_template ->> 'module', 'image'),
    p_template ->> 'name',
    -- New code sends the key; old code and the prompt import send a name. The 0581 trigger
    -- fills whichever is missing.
    p_template ->> 'category',
    nullif(p_template ->> 'category_key', ''),
    nullif(p_template ->> 'cover_before_url', ''),
    nullif(p_template ->> 'cover_after_url', ''),
    coalesce(p_template -> 'fields', '{}'::jsonb),
    coalesce(p_template ->> 'quality', 'high'),
    -- Required: a template without its three prices must not save at some default.
    p_template -> 'credits_cost',
    -- New templates go to the end unless a position is given.
    coalesce(
      (p_template ->> 'sort_order')::integer,
      (select coalesce(max(sort_order), 0) + 10 from public.templates)
    ),
    coalesce((p_template ->> 'is_active')::boolean, false),
    array(select jsonb_array_elements_text(coalesce(p_template -> 'visible_in', '["web"]'::jsonb))),
    coalesce(p_template -> 'translations', '{}'::jsonb),
    nullif(btrim(p_template ->> 'description'), ''),
    (p_template ->> 'featured_rank')::smallint
  )
  on conflict (id) do update set
    module = excluded.module,
    name = excluded.name,
    category = excluded.category,
    -- After the BEFORE INSERT trigger, so always set (EXCLUDED carries the trigger's values).
    category_key = excluded.category_key,
    -- Only when the payload carries them: the editor leaves covers to the upload.
    cover_before_url = case when p_template ? 'cover_before_url' then excluded.cover_before_url else t.cover_before_url end,
    cover_after_url = case when p_template ? 'cover_after_url' then excluded.cover_after_url else t.cover_after_url end,
    fields = excluded.fields,
    quality = excluded.quality,
    credits_cost = excluded.credits_cost,
    sort_order = coalesce((p_template ->> 'sort_order')::integer, t.sort_order),
    is_active = coalesce((p_template ->> 'is_active')::boolean, t.is_active),
    visible_in = excluded.visible_in,
    -- The editor always sends the whole object; the prompt import script does not, and keeps it.
    translations = case when p_template ? 'translations' then excluded.translations else t.translations end,
    description = case when p_template ? 'description' then excluded.description else t.description end,
    featured_rank = case
      when p_template ? 'featured_rank' then excluded.featured_rank
      when coalesce((p_template ->> 'is_active')::boolean, t.is_active) and 'web' = any (excluded.visible_in) then t.featured_rank
      else null
    end;

  if p_prompt is not null then
    insert into public.template_prompts as tp (template_id, body, model_params, provider_id)
    values (v_id, p_prompt ->> 'body', coalesce(p_prompt -> 'model_params', '{}'::jsonb), (p_prompt ->> 'provider_id')::uuid)
    on conflict (template_id) do update set
      body = excluded.body,
      model_params = excluded.model_params,
      provider_id = case when p_prompt ? 'provider_id' then excluded.provider_id else tp.provider_id end;
  else
    perform admin.assert_template_reference_range(v_id);
  end if;
  perform admin.set_template_unpriced_resolutions(v_id,unpriced);
end;
$$;
