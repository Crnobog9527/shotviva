-- The three-argument overload delegates to the current two-argument price/prompt writer.
-- Older callers and template sync omit the third argument and preserve the target's keys.
create or replace function public.admin_upsert_template(p_template jsonb, p_prompt jsonb, p_style_refs jsonb)
returns void language plpgsql set search_path = '' as $$
declare previous_refs text := current_setting('shotviva.save_style_refs',true);
begin
  if p_prompt is null then raise exception 'PROMPT_REQUIRED'; end if;
  -- A failed SQL statement rolls back its local settings; restore on success as well.
  perform set_config('shotviva.save_style_refs',
    jsonb_build_object('id',p_template->>'id','refs',p_style_refs)::text, true);
  perform public.admin_upsert_template(p_template, p_prompt);
  perform set_config('shotviva.save_style_refs',coalesce(previous_refs,''),true);
end;
$$;
revoke all on function public.admin_upsert_template(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_upsert_template(jsonb,jsonb,jsonb) to service_role;

-- A save can change the model, upload count and style refs together. Check their final
-- combination, including when older editors or template sync only change model/fields.
create or replace function admin.check_template_style_ref_limit() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_id text;
  v_count integer;
  v_provider uuid;
  v_limit integer;
  v_photos integer;
begin
  if tg_table_name = 'templates' then v_id := new.id; else v_id := new.template_id; end if;
  select jsonb_array_length(tp.style_refs), tp.provider_id, coalesce((t.fields#>>'{images,max}')::integer, 0)
    into v_count, v_provider, v_photos from public.template_prompts tp
    join public.templates t on t.id = tp.template_id where tp.template_id = v_id;
  if not found or v_count = 0 then return null; end if;
  select coalesce((p.capabilities->>'maxReferences')::integer, case when p.adapter = 'openai_images' then 4 end) into v_limit
    from public.ai_providers p where p.module = 'image'
      and (p.id = v_provider or (v_provider is null and p.is_active)) for share;
  -- With no DB provider, T96's environment OpenAI Images adapter supports four inputs.
  if not found then v_limit := 4; end if;
  if v_limit is null or v_photos + v_count > v_limit then
    raise exception 'MODEL_REFERENCE_LIMIT' using detail =
      format('模板最多 %s 张用户照片，加上 %s 张画风参考图，模型上限为 %s',
        v_photos,v_count,coalesce(v_limit::text,'未知'));
  end if;
  return null;
end;
$$;
revoke all on function admin.check_template_style_ref_limit() from public,anon,authenticated;
create constraint trigger template_style_ref_limit after update of fields on public.templates
  deferrable initially deferred for each row when (old.fields is distinct from new.fields)
  execute function admin.check_template_style_ref_limit();
-- Immediate on prompt save so T93's validate-only (which rolls back its work) also
-- observes the limit. The public fields are written first by both template RPCs.
create trigger prompt_style_ref_limit after insert or update on public.template_prompts
  for each row execute function admin.check_template_style_ref_limit();
