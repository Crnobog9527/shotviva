-- Apply one move to the current siblings under the same lock as tree and assignment writes.
-- A null anchor appends. Other admins' inserts/reorders are retained.
create function public.admin_move_template_category(p_key text, p_from_parent text, p_parent text, p_before text, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  old_parent text;
  parent_level integer := 0;
  siblings text[];
  pos integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'NOT_ADMIN'; end if;
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
revoke all on function public.admin_move_template_category(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_move_template_category(text,text,text,text,uuid) to service_role;
