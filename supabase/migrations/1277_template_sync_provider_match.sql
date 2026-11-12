-- T93 sync: matching the template's model on the target (总控 2026-11-12). The test site had two rows
-- with the same adapter, model and endpoint (one the active provider, one an older copy), which
-- made every template bound to that model fail with PROVIDER_NOT_UNIQUE; production may have the
-- same kind of leftover. Now: one matching row is used as before; of several, the module's active
-- provider (ai_providers_one_active_per_module allows at most one) is used; several with none
-- active stay PROVIDER_NOT_UNIQUE (with the count as detail); none at all is PROVIDER_MISSING.
-- A row that is not the active provider is still a normal, selectable model, so a single match is
-- used whether or not it is active. Body otherwise as in 1276; same signature and grants.

CREATE OR REPLACE FUNCTION "public"."sync_preview_template"("p_template" "jsonb", "p_prompt" "jsonb", "p_provider" "jsonb", "p_floors" "jsonb", "p_run_id" "text", "p_locales" "text"[], "p_target_token" "text", "p_catalog_version" "text", "p_validate_only" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id text := p_template->>'id';
  v_provider uuid;
  v_catalog text;
  v_quote jsonb;
  v_inserted boolean;
  v_template_xmin text;
  v_prompt_xmin text;
  v_previous public.template_prompts;
  v_version integer;
  v_live boolean;
  v_featured smallint;
  -- The sub-category and series (2026-11-12): carried only when the source sends the keys, so a
  -- caller from before this migration keeps the old behaviour (production's own filing stays).
  v_assign boolean := p_template ? 'subcategory_key' and p_template ? 'series_slug';
  v_sub text := nullif(p_template->>'subcategory_key','');
  v_series uuid;
  v_old_series uuid;
  v_order integer := 0;
  -- Style references (1276): carried only when the source sends the key, as for the sub-category.
  v_refs boolean := p_prompt ? 'style_refs';
  v_prompt jsonb;
  v_matches integer;
begin
  if nullif(p_run_id,'') is null or nullif(btrim(p_prompt->>'body'),'') is null then
    raise exception 'INVALID_SYNC';
  end if;
  if v_refs and jsonb_typeof(p_prompt->'style_refs') is distinct from 'array' then raise exception 'INVALID_STYLE_REFS'; end if;
  -- Serialize dispatches even before the first template row exists.
  -- Same lock and lock order as #385 cutover and rollback. The subsequent read sees a
  -- cutover that won the lock; one that comes later must wait for the entire write.
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  perform pg_advisory_xact_lock(hashtextextended('template-sync:' || v_id, 0));
  select synced_version into v_version from public.template_sync_history
    where template_id = v_id and run_id = p_run_id;
  if found then return v_version; end if;
  v_catalog := admin.template_sync_catalog();
  if v_catalog not in ('v1','v2') or p_catalog_version is distinct from v_catalog
      or coalesce(p_floors->>'version','v1') <> v_catalog then raise exception 'CATALOG_MISMATCH'; end if;
  -- The tree lock before any category row (1272): 分类管理 takes the tree lock exclusively and then
  -- writes rows, so a row share taken first could wait on it while it waits on us. Same order as
  -- admin_save_template_assignment and the 1270–1271 sync: tree shared, series, then rows.
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  if v_assign then perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series',0)); end if;
  perform 1 from public.template_categories where key = p_template->>'category_key' for share;
  if not found then raise exception 'CATEGORY_MISSING'; end if;
  if v_assign then
    if v_sub is not null then
      perform 1 from public.template_category_paths p join public.template_categories c on c.key = p.key
        where p.key = v_sub and p.root_key = p_template->>'category_key' and p.key <> p.root_key and not c.is_system;
      if not found then raise exception 'SUBCATEGORY_MISSING'; end if;
      perform 1 from public.template_categories where key = v_sub for share;
    end if;
    if nullif(p_template->>'series_slug','') is not null then
      select id into v_series from public.template_series where slug = p_template->>'series_slug' for share;
      if not found then raise exception 'SERIES_MISSING'; end if;
    end if;
  end if;

  if p_provider is not null and p_provider <> 'null'::jsonb then
    -- The one production row with this adapter, model and endpoint; of several (a leftover copy),
    -- the module's active one (at most one per module). Otherwise say which case it is (1277).
    select count(*) into v_matches from public.ai_providers
      where module = 'image' and adapter = p_provider->>'adapter'
        and model = p_provider->>'model' and base_url = p_provider->>'base_url';
    if v_matches = 0 then raise exception 'PROVIDER_MISSING'; end if;
    begin
      select id into strict v_provider from public.ai_providers
        where module = 'image' and adapter = p_provider->>'adapter'
          and model = p_provider->>'model' and base_url = p_provider->>'base_url'
          and (v_matches = 1 or is_active) for share;
    exception when no_data_found or too_many_rows then
      raise exception 'PROVIDER_NOT_UNIQUE' using detail = format(
        '%s rows share this adapter, model and endpoint and none is the active provider', v_matches);
    end;
  end if;
  -- The editor RPC resolves the effective provider and checks its floor and exact tariff.
  -- Refuse incomplete input: the editor's comparison with a missing numeric tier is SQL NULL.
  if jsonb_typeof(p_floors->'providers') is distinct from 'object' or exists (
    select from jsonb_each(p_floors->'providers') f cross join unnest(array['1k','2k','3k']) r
      where jsonb_typeof(f.value->(p_template->>'quality')->r) is distinct from 'number'
         or (f.value->(p_template->>'quality')->>r)::numeric < 1
  ) then raise exception 'MODEL_CHANGED'; end if;

  -- Acquire the same row lock as normal editor saves, including racing first-time inserts.
  insert into public.templates (id, name, category_key, credits_cost, sort_order)
    values (v_id, p_template->>'name', p_template->>'category_key', p_template->'credits_cost',
      (select coalesce(max(sort_order),0) + 10 from public.templates))
    on conflict (id) do nothing returning true into v_inserted;
  select xmin::text, is_active, featured_rank into strict v_template_xmin, v_live, v_featured from public.templates where id = v_id for update;
  select tp.xmin::text into v_prompt_xmin from public.template_prompts tp where template_id=v_id for update;
  if p_target_token is distinct from (case when v_inserted then 'missing'
      else v_template_xmin || '/' || coalesce(v_prompt_xmin,'-') end) then raise exception 'STALE_TARGET'; end if;
  if v_featured is not null and not (p_template->'visible_in' ? 'web') then raise exception 'FEATURED_WEB_REQUIRED'; end if;
  if v_live and p_template->'visible_in' ? 'web' and
      (nullif(btrim(p_template->>'description'),'') is null or not public._template_has_cover_parts(
        p_template->>'cover_before_url', p_template->>'cover_after_url', p_template->'cover_locales', p_locales))
    then raise exception 'LIVE_TEMPLATE_INCOMPLETE'; end if;

  select tp.* into v_previous from public.template_prompts tp where template_id = v_id;
  -- Keep publication, feature rank and sort order under production control. The normal editor
  -- RPC also enforces production's model constraints when the T96 migration is present.
  -- With style references, the editor's three-argument writer: the same 0940 trigger checks the
  -- keys (this template's private prefix, at most three, no repeats) and the same 0941/0943 checks
  -- the model's input range with production's model; an unchanged list keeps the version. Without
  -- the key, the two-argument writer keeps production's own references, as before.
  v_prompt := (p_prompt - array['provider_id','style_refs']) || jsonb_build_object('provider_id',v_provider);
  if v_refs then
    perform public.admin_upsert_template(
      (p_template - array['sort_order','is_active','featured_rank','category','price_floors',
        'subcategory_key','series_slug','series_sort_order'])
        || jsonb_build_object('price_floors',p_floors),
      v_prompt, p_prompt->'style_refs');
  else
    perform public.admin_upsert_template(
      (p_template - array['sort_order','is_active','featured_rank','category','price_floors',
        'subcategory_key','series_slug','series_sort_order'])
        || jsonb_build_object('price_floors',p_floors),
      v_prompt);
  end if;
  -- The editor writer now holds the effective model lock. Compare the exact response used
  -- by its calculator with the current inputs (including p95, approved tariffs and unit).
  -- A quote changed between the last HTTP read and this transaction rolls back the upsert.
  if nullif(p_floors->>'env_model','') is null or jsonb_typeof(p_floors->'quote_receipt') is distinct from 'object' then
    raise exception 'PRICE_QUOTE_CHANGED';
  end if;
  v_quote := public.template_sync_pricing_input(p_floors->>'env_model')->'receipt';
  if admin.template_sync_quote(v_quote,v_provider,v_id='edit') is distinct from
     admin.template_sync_quote(p_floors->'quote_receipt',v_provider,v_id='edit') then
    raise exception 'PRICE_QUOTE_CHANGED';
  end if;
  -- Production files the template where the test site does: same sub-category, same series (by
  -- slug), none when the test site has none. Series order as the editor keeps it: unchanged while
  -- the series is, appended at the end of a series it joins.
  if v_assign then
    select series_id, coalesce(series_sort_order,0) into v_old_series, v_order from public.templates where id = v_id;
    if v_series is null then v_order := 0;
    elsif v_series is distinct from v_old_series then
      select coalesce(max(series_sort_order),0) + 1 into v_order from public.templates where series_id = v_series;
    end if;
    update public.templates set subcategory_key = v_sub, series_id = v_series, series_sort_order = v_order
      where id = v_id and (subcategory_key, series_id, series_sort_order) is distinct from (v_sub, v_series, v_order);
  end if;
  update public.templates set cover_media_type = p_template->>'cover_media_type',
    cover_video_url = p_template->>'cover_video_url', cover_poster_url = p_template->>'cover_poster_url',
    cover_locales = p_template->'cover_locales' where id = v_id;

  update public.template_prompts set version = version + 1
    where template_id = v_id and version = v_previous.version;
  select version into strict v_version from public.template_prompts where template_id = v_id;
  insert into public.template_sync_history(template_id, run_id, source_version, synced_version,
      previous_version, previous_body, previous_model_params, previous_provider_id, previous_style_refs)
    values (v_id, p_run_id, (p_prompt->>'version')::int, v_version,
      v_previous.version, v_previous.body, v_previous.model_params, v_previous.provider_id, v_previous.style_refs);
  -- The same constraints and T96 RPC are exercised before publishing any cover bytes.
  -- This private SQLSTATE rolls back all changes inside the function's exception block.
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_version;
exception when sqlstate 'Z9301' then return v_version;
end;
$$;
