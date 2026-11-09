-- One range for the inputs actually sent to the model. Read current rows so the
-- prompt trigger, direct changes to fields and legacy saves all see the same references.
create or replace function admin.assert_template_reference_range(p_id text)
returns void language plpgsql set search_path = '' as $$
declare
  v_images jsonb;
  v_count integer;
  v_provider uuid;
  v_min integer;
  v_max integer;
begin
  select t.fields->'images',coalesce(jsonb_array_length(tp.style_refs),0),
         case when t.id <> 'edit' then tp.provider_id end
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
revoke all on function admin.assert_template_reference_range(text) from public,anon,authenticated;
grant execute on function admin.assert_template_reference_range(text) to service_role;

create or replace function admin.check_template_style_ref_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name='templates' then perform admin.assert_template_reference_range(new.id);
  else perform admin.assert_template_reference_range(new.template_id); end if;
  return null;
end;
$$;

-- Keep the template/price writer. Validate only after its public fields and private prompt
-- (including the 0941 wrapper's optional style references) are in their final state.
create or replace function public.admin_upsert_template(p_template jsonb, p_prompt jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id text := p_template ->> 'id';
  v_provider uuid;
  v_model text;
  v_floor jsonb;
  v_resolution text;
begin
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
  if p_template ? 'price_floors' then
    v_floor := p_template->'price_floors'->'providers'->coalesce(v_provider::text, 'env');
    if v_floor is null or (v_provider is not null and p_template->'price_floors' ? 'models'
        and v_model is distinct from (p_template->'price_floors'->'models'->>v_provider::text)) then
      raise exception 'MODEL_CHANGED';
    end if;
    foreach v_resolution in array array['1k','2k','3k'] loop
      if (p_template->'credits_cost'->>v_resolution)::integer <
          (v_floor->coalesce(p_template->>'quality','high')->>v_resolution)::integer then
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
    -- With a null prompt the immediate prompt trigger never runs (including on create).
    perform admin.assert_template_reference_range(v_id);
  end if;
end;
$$;
