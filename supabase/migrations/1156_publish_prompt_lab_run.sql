-- 「发布为模板」 commit (T101): one transaction turns a successful prompt-lab result into an
-- inactive, not-for-sale template draft. The run id is the idempotency key: a retry, or a second
-- admin publishing the same result, gets the first draft back. The private prompt is copied from
-- prompt_lab_versions here, so it never passes through the application. Listing and sale stay the
-- normal template editor's job, which runs the existing floor and style-sale checks.
create function public.admin_publish_prompt_lab_run(p_actor uuid,p_run_id uuid,p_template jsonb,p_assets jsonb,p_assets_base text)
returns jsonb language plpgsql set search_path='' as $$
declare r record; existing text; v_id text:=p_template->>'id'; v_name text:=btrim(p_template->>'name');
  v_zh text:=nullif(btrim(coalesce(p_template->>'name_zh','')),''); v_category text:=p_template->>'category';
  v_root text; v_system boolean; v_refs jsonb:=coalesce(p_assets->'style_refs','[]'); cover text;
begin
  perform admin.require_reference_admin(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('shotviva.prompt_lab_publish:'||p_run_id::text,0));
  select template_id into existing from public.reference_template_sources where run_id=p_run_id;
  if found then return jsonb_build_object('id',existing,'existing',true); end if;

  select x.session_id,x.status,x.model,x.quality,x.use_style_reference,v.prompt,s.asset_id into r
    from public.prompt_lab_runs x join public.prompt_lab_versions v on v.id=x.version_id
    join public.prompt_lab_sessions s on s.id=x.session_id where x.id=p_run_id;
  if not found then raise exception 'PROMPT_LAB_RUN_NOT_FOUND'; end if;
  -- Asset share lock, then session lock: the order permanent deletion uses.
  perform admin.lock_prompt_lab(r.session_id);
  perform 1 from public.prompt_lab_runs where id=p_run_id and status='succeeded' for share;
  if not found then raise exception 'RUN_NOT_PUBLISHABLE'; end if;
  perform 1 from public.ai_providers p where p.module='image' and p.id::text||'/'||p.model=r.model for share;
  if not found then raise exception 'MODEL_CHANGED'; end if;

  if v_id is null or v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_id)>64 or v_id in ('edit','freeform')
     or v_name is null or length(v_name) not between 1 and 120 or length(coalesce(v_zh,''))>120
     or p_assets_base is null or p_assets_base !~ '^https?://[^\s?#]+[^/]$' then raise exception 'INVALID_INPUT'; end if;
  if exists(select from public.templates where id=v_id) then raise exception 'TEMPLATE_EXISTS'; end if;
  select p.root_key,c.is_system into v_root,v_system from public.template_category_paths p
    join public.template_categories c on c.key=p.root_key where p.key=v_category;
  if v_root is null or v_system then raise exception 'INVALID_CATEGORY'; end if;
  -- Covers come from the server's own conversion (§8.3): slot, 16-hex digest, WebP, this id only.
  foreach cover in array array['before','after'] loop
    if not starts_with(coalesce(p_assets->>('cover_'||cover||'_url'),''),p_assets_base||'/covers/'||v_id||'/'||cover||'-')
       or substr(p_assets->>('cover_'||cover||'_url'),length(p_assets_base||'/covers/'||v_id||'/'||cover||'-')+1) !~ '^[0-9a-f]{16}\.webp$'
    then raise exception 'INVALID_INPUT'; end if;
  end loop;
  if jsonb_typeof(v_refs)<>'array' or jsonb_array_length(v_refs)<>r.use_style_reference::int
     or (r.use_style_reference and not admin.valid_style_refs(v_id,v_refs)) then raise exception 'INVALID_INPUT'; end if;

  insert into public.templates(id,module,name,category_key,subcategory_key,fields,quality,translations,sort_order,is_active,
    cover_media_type,cover_before_url,cover_after_url)
  values(v_id,'image',v_name,v_root,nullif(v_category,v_root),
    '{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1","4:5"],"toggles":[]}',r.quality,
    case when v_zh is null then '{}'::jsonb else jsonb_build_object('zh',jsonb_build_object('name',v_zh)) end,
    (select coalesce(max(sort_order),0)+10 from public.templates),false,'image',
    p_assets->>'cover_before_url',p_assets->>'cover_after_url');
  insert into public.template_prompts(template_id,body,model_params,provider_id,style_refs)
    values(v_id,r.prompt,'{}',split_part(r.model,'/',1)::uuid,v_refs);
  -- Same as a copy without a source mark: closed for sale, tiers the model cannot serve unpriced.
  perform admin.set_template_unpriced_resolutions(v_id,null);
  insert into public.reference_template_sources(template_id,asset_id,run_id) values(v_id,r.asset_id,p_run_id);
  return jsonb_build_object('id',v_id,'existing',false);
end $$;
revoke all on function public.admin_publish_prompt_lab_run(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_publish_prompt_lab_run(uuid,uuid,jsonb,jsonb,text) to service_role;
