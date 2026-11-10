-- Both editors move nodes with T102's same sibling and subtree algorithm. Public
-- entry points fix the kind, so template RPCs can never move reference nodes.
create function admin.move_category(p_kind text, p_key text, p_from_parent text, p_parent text, p_before text, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  old_parent text;
  parent_level integer := 0;
  siblings text[];
  pos integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  select parent_id into old_parent from public.template_categories where key=p_key and kind=p_kind and not is_system;
  if not found or old_parent is distinct from p_from_parent then raise exception 'CATEGORY_CHANGED'; end if;
  if p_parent is not null then
    select level into parent_level from public.template_categories where key=p_parent and kind=p_kind and not is_system;
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
    where kind=p_kind and not is_system and parent_id is not distinct from p_parent and key<>p_key;
  pos := case when p_before is null then cardinality(siblings)+1 else array_position(siblings,p_before) end;
  if pos is null then raise exception 'CATEGORY_CHANGED'; end if;
  siblings := siblings[1:pos-1] || array[p_key] || siblings[pos:cardinality(siblings)];
  update public.template_categories c set sort_order=o.n*10 from unnest(siblings) with ordinality o(key,n)
    where c.key=o.key and c.sort_order<>o.n*10;
end $$;
revoke all on function admin.move_category(text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function admin.move_category(text,text,text,text,text,uuid) to service_role;

create or replace function public.admin_move_template_category(p_key text,p_from_parent text,p_parent text,p_before text,p_actor uuid)
returns void language sql set search_path='' as $$
  select admin.move_category('template',p_key,p_from_parent,p_parent,p_before,p_actor)
$$;

create function public.admin_move_reference_category(p_actor uuid,p_key text,p_from_parent text,p_parent text,p_before text)
returns void language sql set search_path='' as $$
  select admin.move_category('reference',p_key,p_from_parent,p_parent,p_before,p_actor)
$$;

create function public.admin_save_reference_category(p_actor uuid,p_key text,p_name_en text,p_name_zh text,p_parent text,p_is_new boolean)
returns void language plpgsql set search_path='' as $$
declare next_order integer;
begin
  perform admin.require_reference_admin(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  if p_is_new is null then raise exception 'INVALID_INPUT'; end if;
  if p_is_new and exists(select from public.template_categories where key=p_key) then raise exception 'CATEGORY_KEY_TAKEN'; end if;
  if not p_is_new and not exists(select from public.template_categories where key=p_key and kind='reference') then
    raise exception 'CATEGORY_NOT_FOUND';
  end if;
  if exists(select from public.template_categories where name_en_lookup='reference:'||lower(btrim(p_name_en)) and key<>p_key)
    then raise exception 'CATEGORY_NAME_EN_TAKEN'; end if;
  if exists(select from public.template_categories where name_zh_lookup='reference:'||btrim(p_name_zh) and key<>p_key)
    then raise exception 'CATEGORY_NAME_ZH_TAKEN'; end if;
  if p_is_new then
    if p_parent is not null and not exists(select from public.template_categories where key=p_parent and kind='reference' and level<3)
      then raise exception 'INVALID_PARENT'; end if;
    select coalesce(max(sort_order),0)+10 into next_order from public.template_categories
      where kind='reference' and parent_id is not distinct from p_parent;
    insert into public.template_categories(key,name_en,name_zh,parent_id,kind,is_visible,sort_order)
      values(p_key,btrim(p_name_en),btrim(p_name_zh),p_parent,'reference',false,next_order);
  else
    update public.template_categories set name_en=btrim(p_name_en),name_zh=btrim(p_name_zh) where key=p_key;
  end if;
end $$;

create function public.admin_delete_reference_category(p_actor uuid,p_key text,p_move_to text) returns integer
language plpgsql set search_path='' as $$
declare moved integer:=0;
begin
  perform admin.require_reference_admin(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  perform 1 from public.template_categories where key=p_key and kind='reference' for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if exists(select from public.template_categories where parent_id=p_key) then raise exception 'CATEGORY_HAS_CHILDREN'; end if;
  if p_move_to is not null then
    perform 1 from public.template_categories where key=p_move_to and key<>p_key and kind='reference' for update;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
    update public.reference_assets set category_id=p_move_to where category_id=p_key;
    get diagnostics moved=row_count;
  elsif exists(select from public.reference_assets where category_id=p_key) then
    raise exception 'CATEGORY_MOVE_REQUIRED';
  end if;
  delete from public.template_categories where key=p_key;
  return moved;
end $$;
revoke all on function public.admin_move_reference_category(uuid,text,text,text,text),
  public.admin_save_reference_category(uuid,text,text,text,text,boolean),public.admin_delete_reference_category(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.admin_move_reference_category(uuid,text,text,text,text),
  public.admin_save_reference_category(uuid,text,text,text,text,boolean),public.admin_delete_reference_category(uuid,text,text)
  to service_role;
