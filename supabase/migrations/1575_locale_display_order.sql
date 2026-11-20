-- Per-language display rules for the home page, the featured sections and Create's category
-- tree. Expand-only: the shared template_categories.sort_order and templates.featured_rank keep
-- working exactly as before and stay what a language follows until an admin sets its own order.
-- Written only by the admin functions below (service role); SEO pages never read these tables.

create table public.template_category_locale_order (
  locale text not null constraint template_category_locale_order_locale_check check (locale in ('en', 'zh')),
  category_key text not null references public.template_categories (key) on delete cascade on update cascade,
  sort_order integer not null,
  primary key (locale, category_key)
);

create table public.template_featured_locale (
  locale text not null constraint template_featured_locale_locale_check check (locale in ('en', 'zh')),
  template_id text not null references public.templates (id) on delete cascade on update cascade,
  rank integer not null constraint template_featured_locale_rank_check check (rank >= 1),
  primary key (locale, template_id),
  constraint template_featured_locale_rank_key unique (locale, rank)
);

alter table public.template_category_locale_order enable row level security;
alter table public.template_featured_locale enable row level security;
revoke all on public.template_category_locale_order from public, anon, authenticated;
revoke all on public.template_featured_locale from public, anon, authenticated;
grant all on public.template_category_locale_order to service_role;
grant all on public.template_featured_locale to service_role;

-- One sibling group's order for one language. p_keys must be exactly the group's current
-- children (CATEGORY_CHANGED when the tree moved since the editor loaded); an empty list
-- clears the group, which then follows the shared order again.
create function public.admin_set_category_locale_order(p_locale text, p_parent text, p_keys text[], p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_keys text[] := coalesce(p_keys, '{}');
  v_siblings text[];
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_locale is null or p_locale not in ('en', 'zh') then
    raise exception 'INVALID_INPUT' using detail = 'unknown language';
  end if;
  if cardinality(v_keys) <> (select count(distinct k) from unnest(v_keys) as u(k)) then
    raise exception 'INVALID_INPUT' using detail = 'keys must not repeat';
  end if;
  -- The same lock as tree moves, so the siblings checked below are the siblings written.
  perform pg_advisory_xact_lock(hashtextextended('shotviva.category_tree', 0));
  select coalesce(array_agg(c.key), '{}') into v_siblings
  from public.template_categories c
  where c.kind = 'template' and not c.is_system and c.parent_id is not distinct from p_parent;

  delete from public.template_category_locale_order o
  where o.locale = p_locale and o.category_key = any (v_siblings);
  if cardinality(v_keys) = 0 then return; end if;
  if cardinality(v_keys) <> cardinality(v_siblings) or not (v_siblings @> v_keys) then
    raise exception 'CATEGORY_CHANGED';
  end if;
  insert into public.template_category_locale_order (locale, category_key, sort_order)
  select p_locale, o.key, o.position * 10 from unnest(v_keys) with ordinality as o(key, position);
end $$;

-- One language's featured list, replaced whole. Only published web templates; an empty list
-- clears it, so the language follows the shared featured list again.
create function public.admin_set_featured_locale(p_locale text, p_ids text[], p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_ids text[] := coalesce(p_ids, '{}');
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_locale is null or p_locale not in ('en', 'zh') then
    raise exception 'INVALID_INPUT' using detail = 'unknown language';
  end if;
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as u(id)) then
    raise exception 'INVALID_INPUT' using detail = 'ids must not repeat';
  end if;
  lock table public.templates in share row exclusive mode;
  if exists (
    select 1 from unnest(v_ids) as u(id)
    where not exists (select 1 from public.templates t where t.id = u.id and t.is_active and 'web' = any (t.visible_in))
  ) then
    raise exception 'INVALID_INPUT' using detail = 'only published web templates can be featured';
  end if;
  delete from public.template_featured_locale where locale = p_locale;
  insert into public.template_featured_locale (locale, template_id, rank)
  select p_locale, o.id, o.position::int from unnest(v_ids) with ordinality as o(id, position);
end $$;

revoke all on function public.admin_set_category_locale_order(text, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.admin_set_featured_locale(text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_set_category_locale_order(text, text, text[], uuid) to service_role;
grant execute on function public.admin_set_featured_locale(text, text[], uuid) to service_role;
