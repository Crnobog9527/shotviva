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
  if exists(select 1 from public.template_categories where lower(name_en)=lower(en) and key<>k) then raise exception 'CATEGORY_NAME_EN_TAKEN'; end if;
  if exists(select 1 from public.template_categories where name_zh=zh and key<>k) then raise exception 'CATEGORY_NAME_ZH_TAKEN'; end if;

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

create or replace function public.admin_move_template_category(p_key text, p_from_parent text, p_parent text, p_before text, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  old_parent text;
  parent_level integer := 0;
  siblings text[];
  pos integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  select parent_id into old_parent from public.template_categories where key=p_key and kind='template' and not is_system;
  if not found or old_parent is distinct from p_from_parent then raise exception 'CATEGORY_CHANGED'; end if;
  if p_parent is not null then
    select level into parent_level from public.template_categories where key=p_parent and kind='template' and not is_system;
    if not found or p_key='art-styles' then raise exception 'INVALID_PARENT'; end if;
  end if;
  if old_parent is distinct from p_parent then
    -- Include descendants when checking the three-level limit and prohibit cycles before firing move triggers.
    if exists(with recursive subtree(key,depth) as (
      select p_key,1 union all select c.key,s.depth+1 from public.template_categories c join subtree s on c.parent_id=s.key
    ) select 1 from subtree where key=p_parent or depth+parent_level>3) then raise exception 'INVALID_PARENT'; end if;
    update public.template_categories set parent_id=p_parent where key=p_key;
  end if;
  select coalesce(array_agg(key order by sort_order,key),'{}') into siblings from public.template_categories
    where kind='template' and not is_system and parent_id is not distinct from p_parent and key<>p_key;
  pos := case when p_before is null then cardinality(siblings)+1 else array_position(siblings,p_before) end;
  if pos is null then raise exception 'CATEGORY_CHANGED'; end if;
  siblings := siblings[1:pos-1] || array[p_key] || siblings[pos:cardinality(siblings)];
  update public.template_categories c set sort_order=o.n*10 from unnest(siblings) with ordinality o(key,n)
    where c.key=o.key and c.sort_order<>o.n*10;
end $$;

create or replace function public.admin_save_template_series(p_id uuid, p_revision text, p_fields jsonb,
  p_members text[], p_actor uuid, p_reason text) returns uuid
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
