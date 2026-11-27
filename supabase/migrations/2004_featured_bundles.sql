-- 精选组合 (Owner 2026-11-25): an admin-named bundle of 2-8 templates from any categories, shown on
-- the home page as one card in its own 「精选组合」 group that cycles through its templates. Not a
-- series: a template can sit in several bundles, a bundle has no public page or address.
-- Expand-only: two new tables and four admin functions; nothing existing reads or changes.
-- featured_rank places a bundle in the default 首页精选 (null: not placed), among bundles only.

create table public.featured_bundles (
  id uuid primary key default gen_random_uuid(),
  name_en text not null constraint featured_bundles_name_en_check check (length(btrim(name_en)) between 1 and 80),
  name_zh text not null constraint featured_bundles_name_zh_check check (length(btrim(name_zh)) between 1 and 80),
  featured_rank integer constraint featured_bundles_featured_rank_check check (featured_rank >= 1),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint featured_bundles_featured_rank_key unique (featured_rank)
);

create table public.featured_bundle_items (
  bundle_id uuid not null references public.featured_bundles (id) on delete cascade,
  template_id text not null references public.templates (id) on delete cascade on update cascade,
  position integer not null constraint featured_bundle_items_position_check check (position between 1 and 8),
  primary key (bundle_id, template_id),
  constraint featured_bundle_items_position_key unique (bundle_id, position)
);
create index featured_bundle_items_template_idx on public.featured_bundle_items (template_id);

alter table public.featured_bundles enable row level security;
alter table public.featured_bundle_items enable row level security;
revoke all on public.featured_bundles from public, anon, authenticated;
revoke all on public.featured_bundle_items from public, anon, authenticated;
grant all on public.featured_bundles to service_role;
grant all on public.featured_bundle_items to service_role;

create function admin.require_admin(p_actor uuid) returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
end $$;
revoke all on function admin.require_admin(uuid) from public, anon, authenticated;
grant execute on function admin.require_admin(uuid) to service_role;

-- Creates (p_id null) or replaces a bundle's names and templates, in order. Only published web
-- templates, 2 to 8, no repeats. Returns the bundle's id.
create function public.admin_save_featured_bundle(p_id uuid, p_name_en text, p_name_zh text, p_template_ids text[], p_actor uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_ids text[] := coalesce(p_template_ids, '{}');
  v_id uuid := p_id;
begin
  perform admin.require_admin(p_actor);
  if length(btrim(coalesce(p_name_en, ''))) not between 1 and 80 or length(btrim(coalesce(p_name_zh, ''))) not between 1 and 80 then
    raise exception 'INVALID_INPUT' using detail = 'both names, up to 80 characters';
  end if;
  if cardinality(v_ids) not between 2 and 8 then
    raise exception 'BUNDLE_SIZE';
  end if;
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as u(id)) then
    raise exception 'INVALID_INPUT' using detail = 'templates must not repeat';
  end if;
  lock table public.templates in share row exclusive mode;
  if exists (
    select 1 from unnest(v_ids) as u(id)
    where not exists (select 1 from public.templates t where t.id = u.id and t.is_active and 'web' = any (t.visible_in))
  ) then
    raise exception 'INVALID_INPUT' using detail = 'only published web templates';
  end if;
  if v_id is null then
    insert into public.featured_bundles (name_en, name_zh, created_by) values (btrim(p_name_en), btrim(p_name_zh), p_actor) returning id into v_id;
  else
    update public.featured_bundles set name_en = btrim(p_name_en), name_zh = btrim(p_name_zh), updated_at = now() where id = v_id;
    if not found then raise exception 'BUNDLE_NOT_FOUND'; end if;
    delete from public.featured_bundle_items where bundle_id = v_id;
  end if;
  insert into public.featured_bundle_items (bundle_id, template_id, position)
  select v_id, o.id, o.position::int from unnest(v_ids) with ordinality as o(id, position);
  return v_id;
end $$;

create function public.admin_delete_featured_bundle(p_id uuid, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform admin.require_admin(p_actor);
  delete from public.featured_bundles where id = p_id;
  if not found then raise exception 'BUNDLE_NOT_FOUND'; end if;
end $$;

-- The bundles in the default 首页精选, whole list in order; the rest leave it. Empty clears it.
create function public.admin_set_featured_bundles(p_ids uuid[], p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_ids uuid[] := coalesce(p_ids, '{}');
begin
  perform admin.require_admin(p_actor);
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as u(id)) then
    raise exception 'INVALID_INPUT' using detail = 'bundles must not repeat';
  end if;
  lock table public.featured_bundles in share row exclusive mode;
  if exists (select 1 from unnest(v_ids) as u(id) where not exists (select 1 from public.featured_bundles b where b.id = u.id)) then
    raise exception 'BUNDLE_NOT_FOUND';
  end if;
  update public.featured_bundles set featured_rank = null where featured_rank is not null;
  update public.featured_bundles b set featured_rank = o.position::int
  from unnest(v_ids) with ordinality as o(id, position) where b.id = o.id;
end $$;

revoke all on function public.admin_save_featured_bundle(uuid, text, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_featured_bundle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_featured_bundles(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.admin_save_featured_bundle(uuid, text, text, text[], uuid) to service_role;
grant execute on function public.admin_delete_featured_bundle(uuid, uuid) to service_role;
grant execute on function public.admin_set_featured_bundles(uuid[], uuid) to service_role;
