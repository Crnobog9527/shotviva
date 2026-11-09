-- A request receipt contains no prompt or asset data. Concurrent retries may stage distinct
-- object namespaces, but only the first successful transaction creates a template.
create table admin.template_copy_requests (
  request_id uuid primary key, actor_id uuid not null, source_id text not null,
  target_id text not null references public.templates(id) on delete cascade, previous_standard integer
);
alter table admin.template_copy_requests enable row level security;
revoke all on admin.template_copy_requests from public,anon,authenticated,service_role;
grant select,insert on admin.template_copy_requests to service_role;
create index template_copy_requests_target_idx on admin.template_copy_requests(target_id);

create or replace function public.admin_template_copy_source(p_actor uuid,p_source text,p_request uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare receipt admin.template_copy_requests%rowtype; manifest jsonb;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  select * into receipt from admin.template_copy_requests where request_id=p_request;
  if found then
    if (receipt.actor_id,receipt.source_id) is distinct from (p_actor,p_source) then raise exception 'REQUEST_MISMATCH'; end if;
    return jsonb_build_object('existing',jsonb_build_object('id',receipt.target_id,'previousStandard',receipt.previous_standard));
  end if;
  select jsonb_build_object('token',t.xmin::text||'/'||p.xmin::text,'assets',jsonb_build_object(
    'cover_before_url',t.cover_before_url,'cover_after_url',t.cover_after_url,'cover_poster_url',t.cover_poster_url,
    'cover_video_url',t.cover_video_url,'cover_locales',t.cover_locales,'style_refs',p.style_refs)) into manifest
    from public.templates t join public.template_prompts p on p.template_id=t.id
    join public.template_categories c on c.key=t.category_key
    where t.id=p_source and t.id not in ('edit','freeform') and not c.is_system;
  if manifest is null then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  return manifest;
end $$;

create or replace function public.admin_commit_template_copy(p_actor uuid,p_source text,p_request uuid,p_target text,p_token text,p_assets jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare t public.templates%rowtype; p public.template_prompts%rowtype; m jsonb; translated jsonb; old_standard integer;
begin
  -- Serialize only retries of this specific request; unrelated templates copy concurrently.
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,400));
  perform 1 from public.templates where id=p_source for share;
  perform 1 from public.template_prompts where template_id=p_source for share;
  m:=public.admin_template_copy_source(p_actor,p_source,p_request);
  if m ? 'existing' then return m->'existing'; end if;
  if p_token is distinct from m->>'token' then raise exception 'SOURCE_CHANGED'; end if;
  if p_target=p_source or p_target !~ '^[a-z0-9-]+-copy-[0-9a-f-]{36}$' or
    p_assets is distinct from replace(replace((m->'assets')::text,'/covers/'||p_source||'/','/covers/'||p_target||'/'),
      'style-refs/'||p_source||'/','style-refs/'||p_target||'/')::jsonb then raise exception 'REQUEST_MISMATCH'; end if;

  select * into strict t from public.templates where id=p_source;
  select * into strict p from public.template_prompts where template_id=p_source;
  if t.category_key='art-styles' and admin.is_template_catalog_v2() and (t.credits_cost->>'1k')::integer<>20 then
    -- A new id has no sale approval. Only Standard has an approved draft price; keep the
    -- stored HD/Max placeholders without marking either tier sellable (#399, Owner decision).
    old_standard:=(t.credits_cost->>'1k')::integer;
    t.credits_cost:=jsonb_set(t.credits_cost,'{1k}','20');
  end if;
  translated:=t.translations;
  if nullif(translated#>>'{zh,name}','') is not null then
    translated:=jsonb_set(translated,'{zh,name}',to_jsonb(left(translated#>>'{zh,name}',115)||'（副本）'));
  end if;
  insert into public.templates(id,module,name,description,category_key,fields,quality,credits_cost,visible_in,translations,
    sort_order,is_active,featured_rank,cover_media_type,cover_before_url,cover_after_url,cover_video_url,cover_poster_url,cover_locales)
  values(p_target,t.module,left(t.name,113)||' (Copy)',t.description,t.category_key,t.fields,t.quality,t.credits_cost,t.visible_in,translated,
    (select coalesce(max(sort_order),0)+10 from public.templates),false,null,t.cover_media_type,
    p_assets->>'cover_before_url',p_assets->>'cover_after_url',p_assets->>'cover_video_url',p_assets->>'cover_poster_url',p_assets->'cover_locales');
  insert into public.template_prompts(template_id,body,model_params,provider_id,style_refs)
    values(p_target,p.body,p.model_params,p.provider_id,p_assets->'style_refs');
  insert into admin.template_copy_requests values(p_request,p_actor,p_source,p_target,old_standard);
  return jsonb_build_object('id',p_target,'previousStandard',old_standard);
end $$;
revoke all on function public.admin_template_copy_source(uuid,text,uuid),public.admin_commit_template_copy(uuid,text,uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.admin_template_copy_source(uuid,text,uuid),public.admin_commit_template_copy(uuid,text,uuid,text,text,jsonb)
  to service_role;
