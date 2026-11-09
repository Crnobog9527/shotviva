-- T96: validate against the effective provider in the same transaction as the template and prompt.
create or replace function public.admin_upsert_template(p_template jsonb, p_prompt jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id text := p_template ->> 'id';
  v_provider uuid;
  v_caps jsonb;
  v_model text;
  v_floor jsonb;
  v_refs jsonb := p_template #> '{fields,images}';
  v_resolution text;
begin
  perform 1 from public.templates where id = v_id for update;
  if p_prompt ? 'provider_id' then
    v_provider := (p_prompt ->> 'provider_id')::uuid;
  else
    select provider_id into v_provider from public.template_prompts where template_id = v_id;
  end if;
  select p.id, p.capabilities, p.model into v_provider, v_caps, v_model from public.ai_providers p
    where p.module = 'image' and (p.id = v_provider or (v_provider is null and p.is_active)) for share;
  if (v_refs->>'min')::integer < (v_caps->>'minReferences')::integer
    or (v_refs->>'max')::integer > (v_caps->>'maxReferences')::integer then
    raise exception 'MODEL_REFERENCE_LIMIT' using detail = format('所选模型支持 %s–%s 张参考图，模板设置为 %s–%s 张',
      v_caps->>'minReferences', v_caps->>'maxReferences', v_refs->>'min', v_refs->>'max');
  end if;

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
  end if;
end;
$$;
