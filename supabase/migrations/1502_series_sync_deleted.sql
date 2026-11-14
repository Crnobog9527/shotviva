-- 删除已下架的系列 (1500) in the T93 sync, where the test site is the source of truth:
--   * the source read says whether the series is deleted (a top-level 'deleted' key, outside the
--     'series' object the old script forwards, so the old script never writes it anywhere);
--   * sync_preview_series_delete carries a test-site delete to production: it unpublishes the
--     series there if it was live, moves its members out (templates keep their state and category)
--     and marks it deleted, in one transaction, audited as series_sync_delete;
--   * a series deleted on production is never brought back: its definition, 上下架 and member
--     writes answer SERIES_DELETED instead of changing it.
-- The other functions are as on main with the deleted check added; same signatures, create or
-- replace, grants kept. Old code on this database: nothing is deleted until the new code deletes
-- it, so every result is what it was.

create or replace function admin.template_sync_audit(p_actor uuid, p_action text, p_target text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('role', true), 'none') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'FORBIDDEN';
  end if;
  if p_action not in ('template_sync_active', 'template_sync_sale', 'series_sync_active', 'series_sync_delete') then
    raise exception 'INVALID_INPUT';
  end if;
  insert into public.admin_audit_log(action, user_id, target_id, reason) values(p_action, p_actor, p_target, p_reason);
end $$;

create or replace function public.read_template_series_sync_source(p_slug text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'series', jsonb_build_object('slug', s.slug, 'name_en', s.name_en, 'name_zh', s.name_zh,
      'description_en', s.description_en, 'description_zh', s.description_zh, 'cover_url', s.cover_url,
      'category_key', s.category_key, 'sort_order', s.sort_order, 'is_active', s.is_active,
      'show_members', s.show_members),
    'members', coalesce((select jsonb_agg(t.id order by t.series_sort_order, t.id)
      from public.templates t where t.series_id = s.id), '[]'::jsonb),
    'deleted', s.deleted_at is not null)
  from public.template_series s where s.slug = p_slug
$$;

create or replace function public.sync_preview_series(p_series jsonb, p_validate_only boolean default false) returns text
language plpgsql set search_path = '' as $_$
declare
  v_slug text := p_series->>'slug';
  previous public.template_series;
  saved public.template_series;
  v_result text;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID_SYNC'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  -- check_series_category would refuse it too; this names the reason for the workflow log.
  if not exists(select 1 from public.template_categories
      where key = p_series->>'category_key' and kind = 'template' and not is_system) then
    raise exception 'SERIES_CATEGORY_MISSING';
  end if;
  saved := jsonb_populate_record(null::public.template_series, p_series - 'id');
  select * into previous from public.template_series where slug = v_slug for update;
  if previous.deleted_at is not null then raise exception 'SERIES_DELETED'; end if;
  if previous.id is null then
    insert into public.template_series(slug, name_en, name_zh, description_en, description_zh, cover_url,
        category_key, sort_order, is_active, show_members)
      values(v_slug, saved.name_en, saved.name_zh, saved.description_en, saved.description_zh, saved.cover_url,
        saved.category_key, coalesce(saved.sort_order, 0), false, coalesce(saved.show_members, false));
    v_result := 'created';
  elsif (previous.name_en, previous.name_zh, previous.description_en, previous.description_zh, previous.cover_url,
      previous.category_key, previous.sort_order, previous.show_members)
      is distinct from (saved.name_en, saved.name_zh, saved.description_en, saved.description_zh, saved.cover_url,
      saved.category_key, coalesce(saved.sort_order, 0), coalesce(saved.show_members, false)) then
    update public.template_series set name_en = saved.name_en, name_zh = saved.name_zh,
      description_en = saved.description_en, description_zh = saved.description_zh, cover_url = saved.cover_url,
      category_key = saved.category_key, sort_order = coalesce(saved.sort_order, 0),
      show_members = coalesce(saved.show_members, false)
    where id = previous.id;
    v_result := 'updated';
  else
    v_result := 'unchanged';
  end if;
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $_$;

create or replace function public.sync_preview_series_active(p_actor uuid, p_slug text, p_active boolean, p_run_id text, p_validate_only boolean default false)
returns text
language plpgsql set search_path = '' as $$
declare
  previous public.template_series;
  v_result text := 'unchanged';
begin
  if p_active is null or nullif(p_run_id, '') is null then raise exception 'INVALID_SYNC'; end if;
  if not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select * into previous from public.template_series where slug = p_slug for update;
  if previous.id is null then raise exception 'SERIES_MISSING'; end if;
  if previous.deleted_at is not null then raise exception 'SERIES_DELETED'; end if;
  if previous.is_active is distinct from p_active then
    update public.template_series set is_active = p_active where id = previous.id;
    perform admin.template_sync_audit(p_actor, 'series_sync_active', p_slug,
      'T93 sync from preview run ' || p_run_id || case when p_active then ': published' else ': unpublished' end);
    v_result := case when p_active then 'published' else 'unpublished' end;
  end if;
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;

create or replace function public.sync_preview_series_members(p_slug text, p_members text[], p_validate_only boolean default false)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_series uuid;
  v_deleted timestamptz;
  v_placed text[];
  v_result jsonb;
begin
  if p_members is null or cardinality(p_members) <> (select count(distinct m) from unnest(p_members) m) then
    raise exception 'INVALID_SERIES_MEMBERS';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select id, deleted_at into v_series, v_deleted from public.template_series where slug = p_slug for update;
  if v_series is null then raise exception 'SERIES_MISSING'; end if;
  if v_deleted is not null then raise exception 'SERIES_DELETED'; end if;
  perform 1 from public.templates where id = any(p_members) or series_id = v_series order by id for update;
  select coalesce(array_agg(m.id order by m.ord), '{}') into v_placed
    from unnest(p_members) with ordinality as m(id, ord)
    join public.templates t on t.id = m.id
    join public.template_categories c on c.key = t.category_key
    where not c.is_system and t.id not in ('freeform', 'edit')
      and (t.series_id is null or t.series_id = v_series);
  update public.templates set series_id = null, series_sort_order = 0
    where series_id = v_series and not (id = any(v_placed));
  update public.templates t set series_id = v_series, series_sort_order = m.ord::integer
    from unnest(v_placed) with ordinality as m(id, ord)
    where t.id = m.id and (t.series_id is distinct from v_series or t.series_sort_order <> m.ord);
  v_result := jsonb_build_object('placed', to_jsonb(v_placed),
    'skipped', to_jsonb(array(select m from unnest(p_members) m where not (m = any(v_placed)))));
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;

-- A series deleted on the test site, deleted here too. 'absent' when production never had it,
-- 'unchanged' when it is already deleted here; otherwise 'deleted' with how many templates it moved
-- out and whether it was live (then it goes down in the same step: a live series is never left
-- without its members). One audit row per real delete.
create function public.sync_preview_series_delete(p_actor uuid, p_slug text, p_run_id text, p_validate_only boolean default false)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  previous public.template_series;
  v_moved integer;
  v_result jsonb;
begin
  if nullif(p_run_id, '') is null then raise exception 'INVALID_SYNC'; end if;
  if not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select * into previous from public.template_series where slug = p_slug for update;
  if previous.id is null then return jsonb_build_object('result', 'absent', 'moved', 0, 'was_live', false); end if;
  if previous.deleted_at is not null then return jsonb_build_object('result', 'unchanged', 'moved', 0, 'was_live', false); end if;
  perform 1 from public.templates where series_id = previous.id order by id for update;
  update public.templates set series_id = null, series_sort_order = 0 where series_id = previous.id;
  get diagnostics v_moved = row_count;
  update public.template_series set is_active = false, deleted_at = now() where id = previous.id;
  perform admin.template_sync_audit(p_actor, 'series_sync_delete', p_slug,
    format('T93 sync from preview run %s: deleted on the test site, %s templates moved out%s',
      p_run_id, v_moved, case when previous.is_active then ', was published' else '' end));
  v_result := jsonb_build_object('result', 'deleted', 'moved', v_moved, 'was_live', previous.is_active);
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;
revoke all on function public.sync_preview_series_delete(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_series_delete(uuid, text, text, boolean) to service_role;
