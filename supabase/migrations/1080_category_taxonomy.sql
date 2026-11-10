-- Keep the existing keys/FKs, including built-in categories and old admin inserts.
alter table public.template_categories
  add column parent_id text references public.template_categories(key),
  add column kind text not null default 'template' check (kind in ('template','reference')),
  add column level smallint not null default 1 check (level between 1 and 3),
  add column slug text not null default '',
  add column is_visible boolean not null default true,
  add column seo_title_en text, add column seo_title_zh text,
  add column seo_description_en text, add column seo_description_zh text;
update public.template_categories set slug = key;
alter table public.template_categories add constraint template_category_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
create unique index template_category_sibling_slug on public.template_categories(parent_id,kind,slug) nulls not distinct;

-- Serialize structural writes. The shared advisory lock on assignment (1081)
-- prevents a template from being attached using the previous root during a move.
create function admin.prepare_category_node() returns trigger language plpgsql set search_path = '' as $$
declare p public.template_categories;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree',0));
  if tg_op='UPDATE' and (new.key<>old.key or new.kind<>old.kind or new.is_system<>old.is_system) then
    raise exception 'CATEGORY_IDENTITY_IMMUTABLE';
  end if;
  if tg_op='INSERT' and new.slug='' then new.slug:=new.key; end if;
  new.level:=1;
  if new.parent_id is not null then
    select kind,is_system,level,key into strict p.kind,p.is_system,p.level,p.key
      from public.template_categories where key=new.parent_id;
    if p.kind<>new.kind or p.is_system or new.is_system or new.key='art-styles' or new.key=p.key then raise exception 'INVALID_PARENT'; end if;
    new.level:=p.level+1;
  end if;
  return new;
end $$;
create trigger category_prepare before insert or update of key,kind,parent_id,level,is_system,slug
on public.template_categories for each row execute function admin.prepare_category_node();

-- Restrictive policy composes with 0580's public-read policy. T101's private labels stay private.
create policy category_template_kind on public.template_categories as restrictive
  for select to anon,authenticated using (kind='template');

create view public.template_category_paths with (security_invoker=true) as
select c.key, coalesce(g.key,p.key,c.key) as root_key,
       array_remove(array[g.slug,p.slug,c.slug],null) as path,
       not c.is_system and c.is_visible and coalesce(p.is_visible,true) and coalesce(g.is_visible,true) as web_visible
from public.template_categories c
left join public.template_categories p on p.key=c.parent_id
left join public.template_categories g on g.key=p.parent_id
where c.kind='template';
revoke all on public.template_category_paths from anon,authenticated;
grant select on public.template_category_paths to anon,authenticated,service_role;

-- The existing flat editor reorders public template roots only.
create or replace function public.admin_reorder_template_categories(p_keys text[], p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[] := coalesce(p_keys, '{}');
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if cardinality(v_keys) <> (select count(distinct k) from unnest(v_keys) as u(k))
     or (select array_agg(k order by k) from unnest(v_keys) as u(k))
        is distinct from (select array_agg(c.key order by c.key) from public.template_categories c where not c.is_system and c.kind='template' and c.parent_id is null) then
    raise exception 'INVALID_INPUT' using detail = 'the order must list every category once';
  end if;

  update public.template_categories c
  set sort_order = o.position * 10
  from unnest(v_keys) with ordinality as o(key, position)
  where c.key = o.key and c.sort_order <> o.position * 10;
end;
$$;
