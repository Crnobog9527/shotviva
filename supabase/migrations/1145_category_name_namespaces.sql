-- Keep legacy template lookup and uniqueness inside the template namespace. A reference
-- category can carry the same human names as the template category it may later suggest.
alter table public.template_categories
  add column name_en_lookup text generated always as (kind||':'||lower(name_en)) stored,
  add column name_zh_lookup text generated always as (kind||':'||name_zh) stored;
drop index public.template_categories_name_en_key;
drop index public.template_categories_name_zh_key;
create unique index template_categories_name_en_key on public.template_categories(name_en_lookup);
create unique index template_categories_name_zh_key on public.template_categories(name_zh_lookup);

create or replace function public.admin_save_template_category(p_category jsonb, p_is_new boolean, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  k text := btrim(p_category->>'key');
  en text := btrim(p_category->>'name_en');
  zh text := btrim(p_category->>'name_zh');
  parent text := p_category->>'parent_id';
  next_order integer;
  previous public.template_categories;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  select * into previous from public.template_categories where key=k;
  if p_is_new and found then raise exception 'CATEGORY_KEY_TAKEN'; end if;
  if not p_is_new then
    if previous.key is null or previous.kind <> 'template' then raise exception 'CATEGORY_NOT_FOUND'; end if;
    if previous.is_system then raise exception 'CATEGORY_SYSTEM'; end if;
  end if;
  if exists(select 1 from public.template_categories where name_en_lookup='template:'||lower(en) and key<>k) then raise exception 'CATEGORY_NAME_EN_TAKEN'; end if;
  if exists(select 1 from public.template_categories where name_zh_lookup='template:'||zh and key<>k) then raise exception 'CATEGORY_NAME_ZH_TAKEN'; end if;

  if p_is_new then
    if parent is not null and not exists(select 1 from public.template_categories
        where key=parent and kind='template' and not is_system and level<3) then raise exception 'INVALID_PARENT'; end if;
    select coalesce(max(sort_order),0)+10 into next_order from public.template_categories
      where parent_id is not distinct from parent and kind='template' and not is_system;
    insert into public.template_categories(key, name_en, name_zh, intro_en, intro_zh, card_style, sort_order,
      parent_id,slug,is_visible,seo_title_en,seo_title_zh,seo_description_en,seo_description_zh)
    values(k,en,zh,nullif(btrim(p_category->>'intro_en'),''),nullif(btrim(p_category->>'intro_zh'),''),
      coalesce(p_category->>'card_style','pair'),next_order,parent,coalesce(p_category->>'slug',k),
      coalesce((p_category->>'is_visible')::boolean,true),nullif(p_category->>'seo_title_en',''),nullif(p_category->>'seo_title_zh',''),
      nullif(p_category->>'seo_description_en',''),nullif(p_category->>'seo_description_zh',''));
  else
    update public.template_categories set name_en=en, name_zh=zh, intro_en=nullif(btrim(p_category->>'intro_en'),''),
      intro_zh=nullif(btrim(p_category->>'intro_zh'),''), card_style=coalesce(p_category->>'card_style','pair'),
      slug=coalesce(p_category->>'slug',previous.slug), is_visible=coalesce((p_category->>'is_visible')::boolean,previous.is_visible),
      seo_title_en=nullif(coalesce(p_category->>'seo_title_en',previous.seo_title_en),''),
      seo_title_zh=nullif(coalesce(p_category->>'seo_title_zh',previous.seo_title_zh),''),
      seo_description_en=nullif(coalesce(p_category->>'seo_description_en',previous.seo_description_en),''),
      seo_description_zh=nullif(coalesce(p_category->>'seo_description_zh',previous.seo_description_zh),'')
    where key=k;
  end if;
end $$;

create or replace function public.template_category_for(p_value text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
  v_key text;
  v_base text;
  v_name_en text;
  v_name_zh text;
  v_n integer;
begin
  if v_value = '' then
    return null;
  end if;
  select c.key into v_key
  from public.template_categories c
  where (c.kind='template' and c.key=v_value) or c.name_en_lookup='template:'||lower(v_value) or c.name_zh_lookup='template:'||v_value
  order by (c.key = v_value) desc, c.sort_order
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  v_base := rtrim(left(btrim(regexp_replace(lower(v_value), '[^a-z0-9]+', '-', 'g'), '-'), 36), '-');
  if v_base = '' then
    v_base := 'category';
  end if;
  v_key := v_base;
  v_n := 1;
  while exists (select 1 from public.template_categories c where c.key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '-' || v_n;
  end loop;

  v_name_en := btrim(left(v_value, 32));
  v_n := 1;
  while exists (select 1 from public.template_categories c where c.name_en_lookup='template:'||lower(v_name_en)) loop
    v_n := v_n + 1;
    v_name_en := btrim(left(v_value, 32 - length(' ' || v_n))) || ' ' || v_n;
  end loop;
  v_name_zh := btrim(left(v_value, 12));
  v_n := 1;
  while exists (select 1 from public.template_categories c where c.name_zh_lookup='template:'||v_name_zh) loop
    v_n := v_n + 1;
    v_name_zh := btrim(left(v_value, 12 - length(' ' || v_n))) || ' ' || v_n;
  end loop;

  insert into public.template_categories (key, name_en, name_zh, card_style, sort_order)
  values (
    v_key, v_name_en, v_name_zh, 'pair',
    (select coalesce(max(c.sort_order), 0) + 10 from public.template_categories c where c.kind='template' and not c.is_system)
  );
  return v_key;
end;
$$;
