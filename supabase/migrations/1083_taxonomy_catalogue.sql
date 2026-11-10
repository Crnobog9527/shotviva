-- A web member must be individually available, and its series and both category
-- paths must be visible. The same relation feeds mixed cards and the series picker.
create view public.web_template_members with (security_invoker=true) as
select t.id, t.series_id, t.series_sort_order, t.sort_order, c.key as category_key,
       (t.series_id is null or s.show_members) as standalone
from public.templates t
join public.template_category_paths c on c.key=coalesce(t.subcategory_key,t.category_key)
left join public.template_series s on s.id=t.series_id
left join public.template_category_paths sc on sc.key=s.category_key
where t.is_active and 'web'=any(t.visible_in) and c.web_visible
  and (t.series_id is null or (s.is_active and sc.web_visible));

create view public.web_catalogue_entries with (security_invoker=true) as
select 'template'::text as type, 'template-'||m.id as entry_key, m.sort_order, m.category_key, m.id as template_id,
       null::uuid as series_id, null::text as cover_template_id
from public.web_template_members m where m.standalone
union all
select 'series', 'series-'||s.id, s.sort_order, c.key, null, s.id, cover.id
from public.template_series s
join public.template_category_paths c on c.key=s.category_key and c.web_visible
cross join lateral (select m.id from public.web_template_members m where m.series_id=s.id
                   order by m.series_sort_order,m.id limit 1) cover
where s.is_active;

-- Composite-argument relationships make these union rows embeddable through
-- PostgREST. Only the requested columns travel over the network.
create function public.entry_template(public.web_catalogue_entries) returns setof public.templates
rows 1 stable language sql set search_path = '' as $$
  select t.* from public.templates t where t.id=$1.template_id
$$;
create function public.entry_series(public.web_catalogue_entries) returns setof public.template_series
rows 1 stable language sql set search_path = '' as $$
  select s.* from public.template_series s where s.id=$1.series_id
$$;
create function public.entry_cover(public.web_catalogue_entries) returns setof public.templates
rows 1 stable language sql set search_path = '' as $$
  select t.* from public.templates t where t.id=$1.cover_template_id
$$;

create function public.web_templates(p_series_id uuid default null, p_template_id text default null, p_include_members boolean default false) returns setof public.templates
stable language sql set search_path = '' as $$
  select t.* from public.web_template_members m join public.templates t on t.id=m.id
  where (p_series_id is null and p_template_id is null and (m.standalone or p_include_members)) or m.series_id=p_series_id or m.id=p_template_id
$$;

-- Match a prefix positionally, not by slug membership (different parents can reuse a slug).
create function public.category_entries(p_path text[]) returns setof public.web_catalogue_entries
stable language sql set search_path = '' as $$
  with recursive nodes(key,depth) as (
    select c.key,1 from public.template_categories c
    where cardinality(p_path) between 1 and 3 and c.parent_id is null and c.kind='template'
      and c.slug=p_path[1] and c.is_visible and not c.is_system
    union all
    select c.key,n.depth+1 from nodes n join public.template_categories c on c.parent_id=n.key
    where c.is_visible and (n.depth>=cardinality(p_path) or c.slug=p_path[n.depth+1])
  )
  select e.* from nodes n join public.web_catalogue_entries e on e.category_key=n.key
  where n.depth>=cardinality(p_path)
$$;

create or replace function public.admin_delete_template_category(p_key text,p_move_to text,p_actor uuid)
returns integer language plpgsql set search_path = '' as $$
declare moved integer:=0; dest text;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'NOT_ADMIN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  perform 1 from public.template_categories where key=p_key and kind='template' for update;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  if exists(select 1 from public.template_categories where key=p_key and is_system) then raise exception 'CATEGORY_SYSTEM'; end if;
  if exists(select 1 from public.template_categories where parent_id=p_key) then raise exception 'CATEGORY_HAS_CHILDREN'; end if;
  if not exists(select 1 from public.template_categories where kind='template' and not is_system and key<>p_key)
    then raise exception 'CATEGORY_LAST'; end if;
  if exists(select 1 from public.templates where category_key=p_key or subcategory_key=p_key)
    or exists(select 1 from public.template_series where category_key=p_key) then
    if p_move_to is null then raise exception 'CATEGORY_MOVE_REQUIRED'; end if;
    select c.root_key into dest from public.template_category_paths c join public.template_categories n on n.key=c.key
      where c.key=p_move_to and not n.is_system and c.key<>p_key;
    if not found then raise exception 'INVALID_INPUT'; end if;
    update public.templates set category_key=dest,subcategory_key=nullif(p_move_to,dest)
      where category_key=p_key or subcategory_key=p_key;
    get diagnostics moved = row_count;
    update public.template_series set category_key=p_move_to where category_key=p_key;
  end if;
  delete from public.template_categories where key=p_key;
  return moved;
end $$;

revoke all on public.web_template_members from anon,authenticated;
grant select on public.web_template_members to anon,authenticated,service_role;

revoke all on public.web_catalogue_entries from anon,authenticated;
grant select on public.web_catalogue_entries to anon,authenticated,service_role;

revoke all on function public.entry_template(public.web_catalogue_entries) from public;
grant execute on function public.entry_template(public.web_catalogue_entries) to anon,authenticated,service_role;

revoke all on function public.entry_series(public.web_catalogue_entries) from public;
grant execute on function public.entry_series(public.web_catalogue_entries) to anon,authenticated,service_role;

revoke all on function public.entry_cover(public.web_catalogue_entries) from public;
grant execute on function public.entry_cover(public.web_catalogue_entries) to anon,authenticated,service_role;

revoke all on function public.web_templates(uuid,text,boolean) from public;
grant execute on function public.web_templates(uuid,text,boolean) to anon,authenticated,service_role;

revoke all on function public.category_entries(text[]) from public;
grant execute on function public.category_entries(text[]) to anon,authenticated,service_role;
