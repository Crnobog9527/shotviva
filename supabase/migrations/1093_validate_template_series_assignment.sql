create or replace function public.admin_save_template_assignment(
  p_actor uuid, p_template jsonb, p_prompt jsonb, p_assignment jsonb, p_is_new boolean,
  p_expected integer default null, p_selected integer default null, p_style_refs jsonb default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_id text := p_template->>'id';
  v_node text := p_template->>'category_key';
  v_series uuid;
  v_previous_series uuid;
  v_old public.templates%rowtype;
  v_root text;
  v_system boolean;
  v_version integer;
  v_order integer := 0;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_is_new is null or not coalesce(p_assignment ? 'series_id',false) then raise exception 'INVALID_INPUT'; end if;
  begin
    v_series := (p_assignment->>'series_id')::uuid;
    v_previous_series := (p_assignment->>'previous_series_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_INPUT';
  end;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series',0));
  select * into v_old from public.templates where id=v_id for update;
  if found and p_is_new then raise exception 'TEMPLATE_EXISTS'; end if;
  if v_old.id is null and not p_is_new then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  if not p_is_new and (not (p_assignment ? 'previous_series_id')
      or v_previous_series is distinct from v_old.series_id
      or p_assignment->>'previous_category' is distinct from coalesce(v_old.subcategory_key,v_old.category_key)) then
    raise exception 'STALE_TEMPLATE_ASSIGNMENT';
  end if;
  select p.root_key,c.is_system into v_root,v_system from public.template_category_paths p
    join public.template_categories c on c.key=p.key where p.key=v_node;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if v_system or exists(select from public.template_categories where key=v_old.category_key and is_system) then
    if v_old.category_key is distinct from v_node or v_series is not null then raise exception 'SYSTEM_ASSIGNMENT'; end if;
  end if;
  if v_series is not null and not exists(select from public.template_series where id=v_series) then
    raise exception 'SERIES_NOT_FOUND';
  end if;

  p_template:=jsonb_set(p_template,'{category_key}',to_jsonb(v_root));
  if p_expected is not null then
    v_version:=public.admin_save_versioned_template(p_actor,p_template,p_prompt,p_expected,p_selected,p_style_refs);
  elsif p_style_refs is not null then
    perform public.admin_upsert_template(p_template,p_prompt,p_style_refs);
  else
    perform public.admin_upsert_template(p_template,p_prompt);
  end if;
  if v_series is not distinct from v_old.series_id then
    v_order:=coalesce(v_old.series_sort_order,0);
  elsif v_series is not null then
    select coalesce(max(series_sort_order),0)+1 into v_order from public.templates where series_id=v_series;
  end if;
  update public.templates set subcategory_key=nullif(v_node,v_root),series_id=v_series,series_sort_order=v_order
    where id=v_id and (subcategory_key,series_id,series_sort_order)
      is distinct from (nullif(v_node,v_root),v_series,v_order);
  if v_version is null then select version into v_version from public.template_prompts where template_id=v_id; end if;
  return v_version;
end $$;
