-- Keep the old RPC contract: an editor omitting tree fields preserves them on update.
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
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'NOT_ADMIN'; end if;
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
