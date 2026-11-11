-- T93 sync, series (Owner 2026-11-12: the series on the test site appear on production by the sync,
-- not by hand). Series ids differ between projects, so a series is matched by slug. As with the
-- categories (1270), the workflow runs as service_role and cannot pass an admin actor to
-- admin_save_template_series; these functions take the same locks in the same order (category tree
-- shared, then the series lock, then template rows) and keep its member rules. New functions only.

-- A series by slug: its fields (cover as stored on the test site) and its members in display order.
-- Null when the test site has no such series.
create or replace function public.read_template_series_sync_source(p_slug text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'series', jsonb_build_object('slug', s.slug, 'name_en', s.name_en, 'name_zh', s.name_zh,
      'description_en', s.description_en, 'description_zh', s.description_zh, 'cover_url', s.cover_url,
      'category_key', s.category_key, 'sort_order', s.sort_order, 'is_active', s.is_active,
      'show_members', s.show_members),
    'members', coalesce((select jsonb_agg(t.id order by t.series_sort_order, t.id)
      from public.templates t where t.series_id = s.id), '[]'::jsonb))
  from public.template_series s where s.slug = p_slug
$$;

-- The series definition onto production: created when the slug is new, otherwise every field follows
-- the test site (names, descriptions, cover, category, position, published, 仅系列 / members shown).
-- Membership is the next two steps (the templates, then sync_preview_series_members).
create or replace function public.sync_preview_series(p_series jsonb, p_validate_only boolean default false)
returns text language plpgsql set search_path = '' as $$
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
  if previous.id is null then
    insert into public.template_series(slug, name_en, name_zh, description_en, description_zh, cover_url,
        category_key, sort_order, is_active, show_members)
      values(v_slug, saved.name_en, saved.name_zh, saved.description_en, saved.description_zh, saved.cover_url,
        saved.category_key, coalesce(saved.sort_order, 0), coalesce(saved.is_active, false), coalesce(saved.show_members, false));
    v_result := 'created';
  elsif (previous.name_en, previous.name_zh, previous.description_en, previous.description_zh, previous.cover_url,
      previous.category_key, previous.sort_order, previous.is_active, previous.show_members)
      is distinct from (saved.name_en, saved.name_zh, saved.description_en, saved.description_zh, saved.cover_url,
      saved.category_key, coalesce(saved.sort_order, 0), coalesce(saved.is_active, false), coalesce(saved.show_members, false)) then
    update public.template_series set name_en = saved.name_en, name_zh = saved.name_zh,
      description_en = saved.description_en, description_zh = saved.description_zh, cover_url = saved.cover_url,
      category_key = saved.category_key, sort_order = coalesce(saved.sort_order, 0),
      is_active = coalesce(saved.is_active, false), show_members = coalesce(saved.show_members, false)
    where id = previous.id;
    v_result := 'updated';
  else
    v_result := 'unchanged';
  end if;
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;

-- The series' members exactly as on the test site, in that order (1, 2, 3…), after the member
-- templates were synced. As admin_save_template_series: no system templates, none taken by another
-- series. A listed template missing on production, or in another series there, is left out and
-- reported. A listed template production already has outside any series joins, even if its own
-- sync failed this run (it then keeps production's previous content). Production members the test
-- site no longer lists leave the series.
create or replace function public.sync_preview_series_members(p_slug text, p_members text[], p_validate_only boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_series uuid;
  v_placed text[];
  v_result jsonb;
begin
  if p_members is null or cardinality(p_members) <> (select count(distinct m) from unnest(p_members) m) then
    raise exception 'INVALID_SERIES_MEMBERS';
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series', 0));
  select id into v_series from public.template_series where slug = p_slug for update;
  if v_series is null then raise exception 'SERIES_MISSING'; end if;
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

revoke all on function public.read_template_series_sync_source(text) from public, anon, authenticated;
grant execute on function public.read_template_series_sync_source(text) to service_role;
revoke all on function public.sync_preview_series(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_series(jsonb, boolean) to service_role;
revoke all on function public.sync_preview_series_members(text, text[], boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_series_members(text, text[], boolean) to service_role;
