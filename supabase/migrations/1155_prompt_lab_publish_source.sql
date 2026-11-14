-- 「发布为模板」 step one (T101). Reads what the server must copy before the draft exists: the
-- result, its test photo and (when the run sent it) the reference as a style image. A run that
-- already became a template returns that receipt instead, so a retried publish copies nothing.
-- The prompt is not returned: the commit copies it inside the database.
create function public.admin_prompt_lab_publish_source(p_actor uuid,p_run_id uuid,p_template_id text)
returns jsonb language plpgsql stable set search_path='' as $$
declare r record; existing text;
begin
  perform admin.require_reference_admin(p_actor);
  select template_id into existing from public.reference_template_sources where run_id=p_run_id;
  if found then return jsonb_build_object('existing',jsonb_build_object('id',existing)); end if;
  select x.status,x.model,x.output_key,x.use_style_reference,ph.object_key photo_key,a.id asset_id,a.status asset_status,
         a.width,a.height,a.created_at asset_created_at
    into r from public.prompt_lab_runs x
    join public.prompt_lab_sessions s on s.id=x.session_id
    join public.reference_assets a on a.id=s.asset_id
    join public.admin_test_photos ph on ph.id=x.photo_id
    where x.id=p_run_id;
  if not found then raise exception 'PROMPT_LAB_RUN_NOT_FOUND'; end if;
  if r.asset_status<>'active' then raise exception 'REFERENCE_ARCHIVED'; end if;
  if r.status<>'succeeded' then raise exception 'RUN_NOT_PUBLISHABLE'; end if;
  -- The draft must use the model the result came from, not whatever the provider row says now.
  if not exists(select from public.ai_providers p where p.module='image' and p.id::text||'/'||p.model=r.model) then
    raise exception 'MODEL_CHANGED';
  end if;
  if p_template_id is null or p_template_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_template_id)>64 then
    raise exception 'INVALID_INPUT';
  end if;
  if exists(select from public.templates where id=p_template_id) then raise exception 'TEMPLATE_EXISTS'; end if;
  return jsonb_build_object('run',jsonb_build_object(
    'output_key',r.output_key,'photo_key',r.photo_key,'use_style_reference',r.use_style_reference,
    'asset',jsonb_build_object('id',r.asset_id,'width',r.width,'height',r.height,'created_at',r.asset_created_at)));
end $$;
revoke all on function public.admin_prompt_lab_publish_source(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_prompt_lab_publish_source(uuid,uuid,text) to service_role;
