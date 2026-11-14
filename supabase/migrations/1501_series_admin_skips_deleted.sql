-- 删除已下架的系列 (1500): 系列管理 no longer lists deleted series, so the admin functions it calls
-- treat a deleted series as gone. Each is the function as it stands on main with only the deleted
-- filter added; same signatures, create or replace, grants kept.
--   admin_reorder_template_series: the whole order is every series not deleted (deleted ones keep
--     their old sort_order and are never asked for);
--   admin_set_template_series_flag, admin_save_template_series: a deleted id is SERIES_CHANGED,
--     as a series someone else removed (the editor reloads);
--   admin_template_series_detail: null for a deleted series (the page answers 404).
-- Old code on this database: no series is deleted until the new code deletes one, so every
-- result is what it was. (The revision hash includes the row, now with deleted_at: null, so an
-- editor left open across the migration is told once to reload.)

create or replace function public.admin_reorder_template_series(p_actor uuid, p_ids uuid[]) returns integer
language plpgsql set search_path = '' as $$
declare v_moved integer;
begin
  if not exists(select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  perform 1 from public.template_series where deleted_at is null order by id for update;
  if p_ids is null or cardinality(p_ids) <> (select count(distinct i) from unnest(p_ids) i)
     or cardinality(p_ids) <> (select count(*) from public.template_series where deleted_at is null)
     or exists(select 1 from unnest(p_ids) i where not exists(
       select 1 from public.template_series s where s.id = i and s.deleted_at is null)) then
    raise exception 'SERIES_CHANGED';
  end if;
  update public.template_series s set sort_order = m.ord::integer * 10
    from unnest(p_ids) with ordinality as m(id, ord) where s.id = m.id and s.sort_order <> m.ord * 10;
  get diagnostics v_moved = row_count;
  return v_moved;
end $$;

create or replace function public.admin_set_template_series_flag(p_actor uuid, p_ids uuid[], p_field text, p_value boolean, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_reason text := nullif(btrim(p_reason), '');
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'FORBIDDEN';
  end if;
  if not exists(select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_field not in ('is_active', 'show_members') or p_value is null or p_ids is null
     or cardinality(p_ids) not between 1 and 200
     or cardinality(p_ids) <> (select count(distinct i) from unnest(p_ids) i) then
    raise exception 'INVALID_INPUT';
  end if;
  if p_field = 'is_active' and not p_value and v_reason is null then raise exception 'SERIES_REASON_REQUIRED'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  perform 1 from public.template_series where id = any(p_ids) order by id for update;
  if (select count(*) from public.template_series where id = any(p_ids) and deleted_at is null) <> cardinality(p_ids) then
    raise exception 'SERIES_CHANGED';
  end if;
  if p_field = 'is_active' then
    with changed as (update public.template_series set is_active = p_value
      where id = any(p_ids) and is_active <> p_value returning id) select array_agg(id) into v_ids from changed;
  else
    with changed as (update public.template_series set show_members = p_value
      where id = any(p_ids) and show_members <> p_value returning id) select array_agg(id) into v_ids from changed;
  end if;
  insert into public.admin_audit_log(action, user_id, target_id, reason)
    select case p_field when 'is_active' then 'series_set_active' else 'series_set_show_members' end,
      p_actor, i::text, format('系列管理批量%s：%s', case when p_field = 'is_active' then
        case when p_value then '上架' else '下架' end else
        case when p_value then '开启成员单独展示' else '关闭成员单独展示' end end,
        coalesce(v_reason, '无备注'))
    from unnest(coalesce(v_ids, '{}')) i;
  return coalesce(cardinality(v_ids), 0);
end $$;

create or replace function public.admin_template_series_detail(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(s) || jsonb_build_object('revision',admin.template_series_revision(s),'members',
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,
      'name',coalesce(nullif(t.translations #>> '{zh,name}',''),t.name),
      'cover_url',coalesce(t.cover_after_url,t.cover_locales #>> '{zh,after}',t.cover_locales #>> '{en,after}'),
      'is_active',t.is_active, 'series_id',s.id) order by t.series_sort_order,t.id)
      from public.templates t where t.series_id=s.id),'[]'))
  from public.template_series s where s.id=p_id and s.deleted_at is null
$$;

create or replace function public.admin_save_template_series(p_id uuid, p_revision text, p_fields jsonb, p_members text[], p_actor uuid, p_reason text)
returns uuid
language plpgsql set search_path = '' as $$
declare
  previous public.template_series;
  saved public.template_series;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series',0));
  if p_id is not null then
    select * into previous from public.template_series where id=p_id for update;
    if not found or previous.deleted_at is not null or p_revision is distinct from admin.template_series_revision(previous) then
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
