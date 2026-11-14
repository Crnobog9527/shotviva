-- The copy RPC runs as service_role. Keep the approval table writable only by narrow functions.
create function admin.copy_template_price_marks(p_source text,p_target text) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.template_sale_approvals(template_id,enabled,unpriced_resolutions)
    select p_target,false,s.unpriced_resolutions from public.template_sale_approvals s where s.template_id=p_source;
  if not found then perform admin.set_template_unpriced_resolutions(p_target,null); end if;
end;
$$;
revoke all on function admin.copy_template_price_marks(text,text) from public,anon,authenticated;
grant execute on function admin.copy_template_price_marks(text,text) to service_role;
create or replace function public.admin_commit_template_copy(p_actor uuid,p_source text,p_request uuid,p_target text,p_token text,p_assets jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare t public.templates%rowtype; p public.template_prompts%rowtype; m jsonb; translated jsonb;
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
  translated:=t.translations;
  if nullif(translated#>>'{zh,name}','') is not null then
    translated:=jsonb_set(translated,'{zh,name}',to_jsonb(left(translated#>>'{zh,name}',115)||'（副本）'));
  end if;
  insert into public.templates(id,module,name,description,category_key,subcategory_key,fields,quality,credits_cost,visible_in,translations,
    sort_order,is_active,featured_rank,cover_media_type,cover_before_url,cover_after_url,cover_video_url,cover_poster_url,cover_locales)
  values(p_target,t.module,left(t.name,113)||' (Copy)',t.description,t.category_key,t.subcategory_key,t.fields,t.quality,t.credits_cost,t.visible_in,translated,
    (select coalesce(max(sort_order),0)+10 from public.templates),false,null,t.cover_media_type,
    p_assets->>'cover_before_url',p_assets->>'cover_after_url',p_assets->>'cover_video_url',p_assets->>'cover_poster_url',p_assets->'cover_locales');
  insert into public.template_prompts(template_id,body,model_params,provider_id,style_refs)
    values(p_target,p.body,p.model_params,p.provider_id,p_assets->'style_refs');
  perform admin.copy_template_price_marks(p_source,p_target);
  insert into admin.template_copy_requests values(p_request,p_actor,p_source,p_target,null);
  return jsonb_build_object('id',p_target,'previousStandard',null);
end $$;
