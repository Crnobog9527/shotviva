alter table public.templates add column subcategory_key text references public.template_categories(key);
-- The catalogue joins on the actual assigned node (root when no subcategory exists).
create index templates_assigned_web_category_idx on public.templates(coalesce(subcategory_key,category_key),sort_order,id)
  where is_active and 'web'=any(visible_in);
create index templates_subcategory_idx on public.templates(subcategory_key) where subcategory_key is not null;

-- Explicitly preserve both pre-existing unqualified PostgREST embeddings now that
-- there are two FKs. New readers can select the leaf with the explicit FK hint.
create function public.template_categories(public.templates) returns setof public.template_categories
rows 1 stable language sql set search_path = '' as $$
  select c.* from public.template_categories c where c.key=$1.category_key
$$;
create function public.templates(public.template_categories) returns setof public.templates
stable language sql set search_path = '' as $$
  select t.* from public.templates t where t.category_key=$1.key
$$;

create function admin.check_template_category_path() returns trigger language plpgsql set search_path = '' as $$
declare root text;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  -- A legacy writer moving a template to another root has no subcategory input.
  if tg_op='UPDATE' and new.category_key<>old.category_key and new.subcategory_key is not distinct from old.subcategory_key
      and not exists(select 1 from public.template_category_paths where key=new.subcategory_key and root_key=new.category_key) then
    new.subcategory_key:=null;
  end if;
  select root_key into root from public.template_category_paths where key=coalesce(new.subcategory_key,new.category_key);
  if root is distinct from new.category_key or new.subcategory_key=new.category_key then raise exception 'INVALID_CATEGORY_PATH' using errcode='23503'; end if;
  return new;
end $$;
-- After the legacy name-to-key trigger.
create trigger zz_template_category_path before insert or update of category,category_key,subcategory_key
on public.templates for each row execute function admin.check_template_category_path();

create function admin.move_category_subtree() returns trigger language plpgsql set search_path = '' as $$
declare root text;
begin
  -- The BEFORE trigger derives each child's level. A descendant reaching level 4
  -- (including an attempted cycle) rolls the entire move back.
  update public.template_categories set level=new.level+1 where parent_id=new.key;
  if new.kind='template' then
    select root_key into strict root from public.template_category_paths where key=new.key;
    update public.templates set category_key=root,
      subcategory_key=case when new.key<>root then new.key end
    where coalesce(subcategory_key,category_key)=new.key and
      (category_key<>root or subcategory_key=root);
  end if;
  return null;
end $$;
create trigger category_move after update of parent_id,level on public.template_categories
for each row execute function admin.move_category_subtree();

create function public.category_path(public.templates) returns text[] stable language sql set search_path = '' as $$
  select c.path from public.template_category_paths c where c.key=coalesce($1.subcategory_key,$1.category_key)
$$;

revoke all on function public.template_categories(public.templates) from public;
grant execute on function public.template_categories(public.templates) to anon,authenticated,service_role;

revoke all on function public.templates(public.template_categories) from public;
grant execute on function public.templates(public.template_categories) to anon,authenticated,service_role;

revoke all on function public.category_path(public.templates) from public;
grant execute on function public.category_path(public.templates) to anon,authenticated,service_role;
