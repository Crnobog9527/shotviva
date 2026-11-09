-- Binding UUIDs differ between projects; duplicated natural keys are deliberately rejected.
create index ai_providers_image_sync_identity on public.ai_providers(adapter, model, base_url)
  where module = 'image';

-- Each committed dispatch is also the private recovery record for the prompt it replaced.
create table public.template_sync_history (
  template_id text not null references public.templates(id) on delete cascade,
  run_id text not null,
  source_version integer not null check (source_version > 0),
  synced_version integer not null,
  previous_version integer,
  previous_body text,
  previous_model_params jsonb,
  previous_provider_id uuid,
  created_at timestamptz not null default now(),
  primary key (template_id, run_id)
);
alter table public.template_sync_history enable row level security;
revoke all on public.template_sync_history from public, anon, authenticated, service_role;
grant select, insert on public.template_sync_history to service_role;

-- Ordinary editor saves retain the original change-detection rule. A sync can also advance
-- an unchanged prompt one revision (e.g. when the only change was a cover or the provider).
create or replace function public.bump_template_prompt_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body or new.model_params is distinct from old.model_params
      or new.version = old.version + 1 then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

-- The release checkpoint writes the marker together with the tariffs. An absent marker is v1.
create function admin.template_sync_catalog() returns text language sql stable set search_path = '' as $$
  select coalesce((select case when value = '"v2"'::jsonb then 'v2' else 'unknown' end
    from public.system_settings where key = 'pricing_catalog_version'), 'v1')
$$;
revoke all on function admin.template_sync_catalog() from public, anon, authenticated;
grant execute on function admin.template_sync_catalog() to service_role;

-- One statement/MVCC snapshot, including the wallet denomination. Explicit projections keep
-- private style reference keys and provider credentials out of the sync payload.
create function public.read_template_sync_source(p_id text) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('catalog', admin.template_sync_catalog(), 'template', to_jsonb(t),
    'prompt', to_jsonb(p), 'provider', to_jsonb(a))
  from (select id,module,name,description,category_key,translations,fields,quality,credits_cost,visible_in,
          cover_before_url,cover_after_url,cover_media_type,cover_video_url,cover_poster_url,cover_locales
          from public.templates where id=p_id) t
  left join lateral (select body,version,model_params,provider_id from public.template_prompts
    where template_id=t.id) p on true
  left join lateral (select adapter,model,base_url from public.ai_providers
    where id=p.provider_id and module='image') a on true
$$;
revoke all on function public.read_template_sync_source(text) from public, anon, authenticated;
grant execute on function public.read_template_sync_source(text) to service_role;

-- xmin changes on every committed edit, including one to just a cover, binding or private refs.
create function public.read_template_sync_target(p_id text,p_run_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'token', coalesce((select t.xmin::text || '/' || coalesce(p.xmin::text,'-')
      from public.templates t left join public.template_prompts p on p.template_id=t.id
      where t.id=p_id), 'missing'),
    'version', (select synced_version from public.template_sync_history where template_id=p_id and run_id=p_run_id))
$$;
revoke all on function public.read_template_sync_target(text,text) from public, anon, authenticated;
grant execute on function public.read_template_sync_target(text,text) to service_role;

create or replace function public.sync_preview_template(
  p_template jsonb, p_prompt jsonb, p_provider jsonb, p_floors jsonb, p_run_id text, p_locales text[],
  p_target_token text, p_catalog_version text, p_validate_only boolean default false
) returns integer language plpgsql set search_path = '' as $$
declare
  v_id text := p_template->>'id';
  v_provider uuid;
  v_catalog text;
  v_inserted boolean;
  v_template_xmin text;
  v_prompt_xmin text;
  v_previous public.template_prompts;
  v_version integer;
  v_live boolean;
  v_featured smallint;
begin
  if nullif(p_run_id,'') is null or nullif(btrim(p_prompt->>'body'),'') is null then
    raise exception 'INVALID_SYNC';
  end if;
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
  perform 1 from public.template_categories where key = p_template->>'category_key' for share;
  if not found then raise exception 'CATEGORY_MISSING'; end if;

  if p_provider is not null and p_provider <> 'null'::jsonb then
    begin
      select id into strict v_provider from public.ai_providers
        where module = 'image' and adapter = p_provider->>'adapter'
          and model = p_provider->>'model' and base_url = p_provider->>'base_url' for share;
    exception when no_data_found or too_many_rows then raise exception 'PROVIDER_NOT_UNIQUE';
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
  perform public.admin_upsert_template(
    (p_template - array['sort_order','is_active','featured_rank','category','price_floors'])
      || jsonb_build_object('price_floors',p_floors),
    (p_prompt - 'provider_id') || jsonb_build_object('provider_id',v_provider));
  update public.templates set cover_media_type = p_template->>'cover_media_type',
    cover_video_url = p_template->>'cover_video_url', cover_poster_url = p_template->>'cover_poster_url',
    cover_locales = p_template->'cover_locales' where id = v_id;

  update public.template_prompts set version = version + 1
    where template_id = v_id and version = v_previous.version;
  select version into strict v_version from public.template_prompts where template_id = v_id;
  insert into public.template_sync_history(template_id, run_id, source_version, synced_version,
      previous_version, previous_body, previous_model_params, previous_provider_id)
    values (v_id, p_run_id, (p_prompt->>'version')::int, v_version,
      v_previous.version, v_previous.body, v_previous.model_params, v_previous.provider_id);
  -- The same constraints and T96 RPC are exercised before publishing any cover bytes.
  -- This private SQLSTATE rolls back all changes inside the function's exception block.
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_version;
exception when sqlstate 'Z9301' then return v_version;
end;
$$;
revoke all on function public.sync_preview_template(jsonb,jsonb,jsonb,jsonb,text,text[],text,text,boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_template(jsonb,jsonb,jsonb,jsonb,text,text[],text,text,boolean) to service_role;
