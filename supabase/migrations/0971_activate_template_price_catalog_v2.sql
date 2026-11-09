create function admin.activate_template_price_catalog_v2() returns void language plpgsql set search_path='' as $$
declare
  batch bigint;
  problems text;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  if not admin.is_template_catalog_v2() then raise exception 'TEMPLATE_CATALOG_VERSION_NOT_ACTIVE'; end if;
  if exists (select 1 from admin.template_price_batches where reverted_at is null) then return; end if;
  lock table public.templates, public.template_prompts, public.ai_providers in share row exclusive mode nowait;

  select string_agg(t.id,', ' order by t.id) into problems from public.templates t
    left join admin.template_tariffs_v2 c on c.id=t.id
    where t.is_active and c.id is null and t.category_key<>'art-styles'
      and t.id not in ('bright-listing','evening-glow') and t.id not like 'qa-%';
  if problems is not null then raise exception 'UNMAPPED_ACTIVE_TEMPLATES: %', problems; end if;

  -- Edit and partner requests run on the active provider; a web-only template may pin its own.
  select string_agg(t.id,', ' order by t.id) into problems from admin.template_tariffs_v2 c
    join public.templates t on t.id=c.id
    left join public.template_prompts tp on tp.template_id=t.id
    left join public.ai_providers a on a.module='image' and a.is_active
    left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,a.id)
    where tp.template_id is null or p.id is null or p.adapter<>'openai_images' or p.model<>'gpt-image-2.6-sunburst'
      or rtrim(p.base_url,'/')<>'https://api.openai.com/v1'
      or ('partner'=any(t.visible_in) and a.id is distinct from p.id)
      or not coalesce((p.capabilities->'resolutions') ?& array['1k','2k','3k'],false)
      or not coalesce((t.fields#>>'{images,min}')::int >= (p.capabilities->>'minReferences')::int
          and (t.fields#>>'{images,max}')::int <= (p.capabilities->>'maxReferences')::int,false);
  if problems is not null then raise exception 'TEMPLATE_MODEL_NOT_READY: %', problems; end if;

  insert into admin.template_price_batches default values returning id into batch;
  insert into admin.template_price_snapshots (batch_id,template_id,previous,applied,provider_id,provider_endpoint_hash)
    select batch,t.id,admin.template_price_state(t),
      case when c.id is null then admin.template_price_state(t)||'{"active":false,"featured":null}'::jsonb
        else admin.template_price_state(t)||jsonb_build_object('quality',c.quality,'costs',c.costs) end,
      case when c.id is not null then p.id end, case when c.id is not null then md5(p.base_url) end
    from public.templates t left join admin.template_tariffs_v2 c on c.id=t.id
    left join public.template_prompts tp on tp.template_id=t.id
    left join public.ai_providers a on a.module='image' and a.is_active
    left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,a.id)
    where c.id is not null or t.is_active;
  update public.templates t set quality=s.applied->>'quality',credits_cost=s.applied->'costs',
    is_active=(s.applied->>'active')::boolean,featured_rank=(s.applied->>'featured')::smallint
    from admin.template_price_snapshots s where s.batch_id=batch and s.template_id=t.id;
end;
$$;
revoke all on function admin.activate_template_price_catalog_v2() from public,anon,authenticated,service_role;

create function admin.rollback_template_price_catalog_v2() returns void language plpgsql set search_path='' as $$
declare batch bigint; problems text;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  select id into batch from admin.template_price_batches where reverted_at is null for update;
  if not found then return; end if;
  lock table public.templates in share row exclusive mode nowait;
  if exists (select 1 from public.generation_jobs g where g.inputs->>'pricing_catalog_version'='v2') then
    raise exception 'TEMPLATE_CATALOG_HAS_NEW_JOBS';
  end if;
  select string_agg(s.template_id,', ' order by s.template_id) into problems from admin.template_price_snapshots s
    left join public.templates t on t.id=s.template_id
    where s.batch_id=batch and (t.id is null or admin.template_price_state(t) is distinct from s.applied);
  if problems is not null then raise exception 'TEMPLATE_CATALOG_CHANGED: %',problems; end if;
  update admin.template_price_batches set reverted_at=clock_timestamp() where id=batch;
  update public.templates t set quality=s.previous->>'quality',credits_cost=s.previous->'costs',
    is_active=(s.previous->>'active')::boolean,featured_rank=(s.previous->>'featured')::smallint
    from admin.template_price_snapshots s where s.batch_id=batch and s.template_id=t.id;
end;
$$;
revoke all on function admin.rollback_template_price_catalog_v2() from public,anon,authenticated,service_role;
