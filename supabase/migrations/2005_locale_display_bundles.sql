-- 精选组合 per language (Owner 2026-11-25), next to 1575's per-language featured templates and
-- with the same rule: a language with rows here shows its own bundles in this order; with none it
-- follows the default ones (featured_bundles.featured_rank, migration 2004).
-- Expand-only: a new table and a new five-argument admin_set_locale_display beside 2003's
-- four-argument one, which keeps working unchanged for code deployed before this.

create table public.bundle_featured_locale (
  locale text not null constraint bundle_featured_locale_locale_check check (locale in ('en', 'zh')),
  bundle_id uuid not null references public.featured_bundles (id) on delete cascade,
  rank integer not null constraint bundle_featured_locale_rank_check check (rank >= 1),
  primary key (locale, bundle_id),
  constraint bundle_featured_locale_rank_key unique (locale, rank)
);

alter table public.bundle_featured_locale enable row level security;
revoke all on public.bundle_featured_locale from public, anon, authenticated;
grant all on public.bundle_featured_locale to service_role;

-- 2003's save plus the language's bundles: p_bundles null leaves them alone; otherwise the whole
-- list in order, and an empty one goes back to following the default. One call, so it is all or
-- nothing like 2003.
create function public.admin_set_locale_display(p_locale text, p_groups jsonb, p_featured text[], p_bundles uuid[], p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_bundles uuid[] := p_bundles;
begin
  perform public.admin_set_locale_display(p_locale, p_groups, p_featured, p_actor);
  if v_bundles is not null then
    if cardinality(v_bundles) <> (select count(distinct id) from unnest(v_bundles) as u(id)) then
      raise exception 'INVALID_INPUT' using detail = 'bundles must not repeat';
    end if;
    lock table public.featured_bundles in share row exclusive mode;
    if exists (select 1 from unnest(v_bundles) as u(id) where not exists (select 1 from public.featured_bundles b where b.id = u.id)) then
      raise exception 'BUNDLE_NOT_FOUND';
    end if;
    delete from public.bundle_featured_locale where locale = p_locale;
    insert into public.bundle_featured_locale (locale, bundle_id, rank)
    select p_locale, o.id, o.position::int from unnest(v_bundles) with ordinality as o(id, position);
  end if;
end $$;

revoke all on function public.admin_set_locale_display(text, jsonb, text[], uuid[], uuid) from public, anon, authenticated;
grant execute on function public.admin_set_locale_display(text, jsonb, text[], uuid[], uuid) to service_role;
