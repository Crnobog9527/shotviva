-- The management list pages across all categories in display order.
create index template_series_admin_order_idx on public.template_series(sort_order,id);

-- One snapshot of the metadata and ordered membership for optimistic editing.
create function admin.template_series_revision(p_series public.template_series)
returns text language sql stable set search_path = '' as $$
  select md5(to_jsonb(p_series)::text || coalesce(jsonb_agg(t.id order by t.series_sort_order,t.id), '[]')::text)
  from public.templates t where t.series_id=p_series.id
$$;

-- The picker also searches unpublished and partner-only templates. Return public display
-- fields only; paging by primary key is stable while the editor changes its selection.
create function public.admin_series_candidates(p_search text, p_after text)
returns table(id text, name text, cover_url text, series_id uuid, is_active boolean)
language sql stable set search_path = '' as $$
  select t.id, coalesce(nullif(t.translations #>> '{zh,name}',''),t.name),
         coalesce(t.cover_after_url,t.cover_locales #>> '{zh,after}',t.cover_locales #>> '{en,after}'),
         t.series_id,t.is_active
    from public.templates t join public.template_categories c on c.key=t.category_key
   where not c.is_system and t.id not in ('freeform','edit') and (p_after is null or t.id>p_after)
     and (p_search='' or strpos(lower(t.id),lower(p_search))>0 or strpos(lower(t.name),lower(p_search))>0
          or strpos(lower(t.translations #>> '{zh,name}'),lower(p_search))>0)
   order by t.id limit 31
$$;

create function public.admin_template_series_detail(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(s) || jsonb_build_object('revision',admin.template_series_revision(s),'members',
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,
      'name',coalesce(nullif(t.translations #>> '{zh,name}',''),t.name),
      'cover_url',coalesce(t.cover_after_url,t.cover_locales #>> '{zh,after}',t.cover_locales #>> '{en,after}'),
      'is_active',t.is_active, 'series_id',s.id) order by t.series_sort_order,t.id)
      from public.templates t where t.series_id=s.id),'[]'))
  from public.template_series s where s.id=p_id
$$;

-- Members that another series owns cannot be silently taken. The template editor
-- takes these same locks before changing a template's series.
create function public.admin_save_template_series(p_id uuid, p_revision text, p_fields jsonb,
  p_members text[], p_actor uuid, p_reason text) returns uuid
language plpgsql set search_path = '' as $$
declare
  previous public.template_series;
  saved public.template_series;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series',0));
  if p_id is not null then
    select * into previous from public.template_series where id=p_id for update;
    if not found or p_revision is distinct from admin.template_series_revision(previous) then
      raise exception 'SERIES_CHANGED';
    end if;
    if previous.is_active and not (p_fields->>'is_active')::boolean and nullif(btrim(p_reason),'') is null then
      raise exception 'SERIES_REASON_REQUIRED';
    end if;
  end if;
  if p_members is null or cardinality(p_members)<>(select count(distinct m) from unnest(p_members) m) then
    raise exception 'INVALID_SERIES_MEMBERS';
  end if;
  perform 1 from public.templates where id=any(p_members) or series_id=p_id order by id for update;
  if cardinality(p_members)<>(select count(*) from public.templates t
      join public.template_categories c on c.key=t.category_key where t.id=any(p_members)
      and not c.is_system and t.id not in ('freeform','edit')) then
    raise exception 'INVALID_SERIES_MEMBERS';
  end if;
  if exists(select 1 from public.templates where id=any(p_members) and series_id is not null and series_id is distinct from p_id) then
    raise exception 'SERIES_MEMBER_TAKEN';
  end if;
  saved:=jsonb_populate_record(null::public.template_series,p_fields);
  if p_id is null then
    insert into public.template_series(slug,name_en,name_zh,description_en,description_zh,cover_url,
      category_key,sort_order,is_active,show_members)
    values(saved.slug,saved.name_en,saved.name_zh,saved.description_en,saved.description_zh,saved.cover_url,
      saved.category_key,saved.sort_order,saved.is_active,saved.show_members) returning id into p_id;
  else
    update public.template_series set slug=saved.slug,name_en=saved.name_en,name_zh=saved.name_zh,
      description_en=saved.description_en,description_zh=saved.description_zh,cover_url=saved.cover_url,
      category_key=saved.category_key,sort_order=saved.sort_order,is_active=saved.is_active,show_members=saved.show_members
    where id=p_id;
  end if;
  update public.templates set series_id=null,series_sort_order=0 where series_id=p_id and not (id=any(p_members));
  update public.templates t set series_id=p_id,series_sort_order=m.ord::integer
    from unnest(p_members) with ordinality as m(id,ord) where t.id=m.id
      and (t.series_id is distinct from p_id or t.series_sort_order<>m.ord);
  return p_id;
end $$;

revoke all on function admin.template_series_revision(public.template_series) from public;
grant execute on function admin.template_series_revision(public.template_series) to service_role;
revoke all on function public.admin_series_candidates(text,text) from public,anon,authenticated;
grant execute on function public.admin_series_candidates(text,text) to service_role;
revoke all on function public.admin_template_series_detail(uuid) from public,anon,authenticated;
grant execute on function public.admin_template_series_detail(uuid) to service_role;
revoke all on function public.admin_save_template_series(uuid,text,jsonb,text[],uuid,text) from public,anon,authenticated;
grant execute on function public.admin_save_template_series(uuid,text,jsonb,text[],uuid,text) to service_role;
