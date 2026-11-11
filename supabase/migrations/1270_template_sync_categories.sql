-- T93 sync, categories (Owner 2026-11-12: production copies the test site's categories, series and
-- templates; nobody re-creates them by hand). The sync runs as service_role from the approved GitHub
-- workflow, so it cannot pass an admin actor to admin_save_template_category; these two functions do
-- the same checks under the same lock instead. New functions only; nothing existing changes.

-- The categories with these keys and every ancestor, parents first, as the sync needs them.
create or replace function public.read_template_category_sync_source(p_keys text[]) returns jsonb
language sql stable set search_path = '' as $$
  with recursive up(key, parent_id) as (
    select key, parent_id from public.template_categories where key = any(p_keys) and kind = 'template'
    union
    select c.key, c.parent_id from public.template_categories c join up on c.key = up.parent_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', c.key, 'parent_id', c.parent_id, 'level', c.level, 'is_system', c.is_system,
      'name_en', c.name_en, 'name_zh', c.name_zh, 'intro_en', c.intro_en, 'intro_zh', c.intro_zh,
      'card_style', c.card_style, 'sort_order', c.sort_order, 'slug', c.slug, 'is_visible', c.is_visible,
      'seo_title_en', c.seo_title_en, 'seo_title_zh', c.seo_title_zh,
      'seo_description_en', c.seo_description_en, 'seo_description_zh', c.seo_description_zh)
    order by c.level, c.sort_order, c.key), '[]'::jsonb)
  from public.template_categories c where c.key in (select key from up)
$$;

-- One category onto production. Missing: created from the test site's row (key, names, parent,
-- position, intro, card style, slug, visibility, SEO text). Present: only the names and the
-- position follow; parent, slug and the rest stay production's. System categories are never
-- created or touched. Returns created / updated / unchanged / system; p_validate_only rolls back.
create or replace function public.sync_preview_category(p_category jsonb, p_validate_only boolean default false)
returns text language plpgsql set search_path = '' as $$
declare
  k text := p_category->>'key';
  en text := btrim(p_category->>'name_en');
  zh text := btrim(p_category->>'name_zh');
  parent text := nullif(p_category->>'parent_id', '');
  v_position integer := (p_category->>'sort_order')::integer;
  previous public.template_categories;
  v_result text;
begin
  if k is null or k !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_position is null then raise exception 'INVALID_SYNC'; end if;
  -- The same exclusive tree lock as admin_save_template_category (分类管理).
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree', 0));
  select * into previous from public.template_categories where key = k for update;
  if previous.key is not null and previous.kind <> 'template' then raise exception 'CATEGORY_KIND_MISMATCH'; end if;
  if previous.is_system or coalesce((p_category->>'is_system')::boolean, false) then
    if previous.key is null then raise exception 'CATEGORY_MISSING'; end if;
    return 'system';
  end if;
  if exists(select 1 from public.template_categories where name_en_lookup = 'template:' || lower(en) and key <> k)
      or exists(select 1 from public.template_categories where name_zh_lookup = 'template:' || zh and key <> k) then
    raise exception 'CATEGORY_NAME_TAKEN';
  end if;
  if previous.key is null then
    if parent is not null and not exists(select 1 from public.template_categories
        where key = parent and kind = 'template' and not is_system and level < 3) then
      raise exception 'CATEGORY_PARENT_MISSING';
    end if;
    insert into public.template_categories(key, name_en, name_zh, intro_en, intro_zh, card_style, sort_order,
        parent_id, slug, is_visible, seo_title_en, seo_title_zh, seo_description_en, seo_description_zh)
      values(k, en, zh, nullif(btrim(p_category->>'intro_en'), ''), nullif(btrim(p_category->>'intro_zh'), ''),
        coalesce(p_category->>'card_style', 'pair'), v_position, parent, coalesce(nullif(p_category->>'slug', ''), k),
        coalesce((p_category->>'is_visible')::boolean, true), nullif(p_category->>'seo_title_en', ''),
        nullif(p_category->>'seo_title_zh', ''), nullif(p_category->>'seo_description_en', ''),
        nullif(p_category->>'seo_description_zh', ''));
    v_result := 'created';
  elsif (previous.name_en, previous.name_zh, previous.sort_order) is distinct from (en, zh, v_position) then
    update public.template_categories set name_en = en, name_zh = zh, sort_order = v_position where key = k;
    v_result := 'updated';
  else
    v_result := 'unchanged';
  end if;
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_result;
exception when sqlstate 'Z9301' then return v_result;
end $$;

revoke all on function public.read_template_category_sync_source(text[]) from public, anon, authenticated;
grant execute on function public.read_template_category_sync_source(text[]) to service_role;
revoke all on function public.sync_preview_category(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_preview_category(jsonb, boolean) to service_role;
