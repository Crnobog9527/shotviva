-- 首页「更多真实案例」 per language (Owner 2026-11-25): the row of phone-photo → result pairs under
-- the home first screen, picked in admin instead of written in code. Up to eight entries, each a
-- published template or a 精选组合 (migration 2004); the pictures are always the template's own
-- covers. A language with no rows shows the built-in list.
-- Expand-only: a new table and a new admin function; nothing existing reads or changes.

create table public.home_case_strip (
  locale text not null constraint home_case_strip_locale_check check (locale in ('en', 'zh')),
  rank integer not null constraint home_case_strip_rank_check check (rank between 1 and 8),
  template_id text references public.templates (id) on delete cascade on update cascade,
  bundle_id uuid references public.featured_bundles (id) on delete cascade,
  primary key (locale, rank),
  constraint home_case_strip_one_entry_check check (num_nonnulls(template_id, bundle_id) = 1)
);
-- No repeats within a language; also the indexes the two cascades look rows up by.
create unique index home_case_strip_template_key on public.home_case_strip (template_id, locale) where template_id is not null;
create unique index home_case_strip_bundle_key on public.home_case_strip (bundle_id, locale) where bundle_id is not null;

alter table public.home_case_strip enable row level security;
revoke all on public.home_case_strip from public, anon, authenticated;
grant all on public.home_case_strip to service_role;

-- Replaces one language's whole list, in order: p_entries is a JSON array of
-- {"kind": "template" | "bundle", "id": "..."}, at most 8, no repeats; templates must be
-- published on the web, bundles must exist. An empty array goes back to the built-in list.
create function public.admin_set_home_case_strip(p_locale text, p_entries jsonb, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_entries jsonb := coalesce(p_entries, '[]'::jsonb);
begin
  perform admin.require_admin(p_actor);
  if p_locale is null or p_locale not in ('en', 'zh') or jsonb_typeof(v_entries) <> 'array' then
    raise exception 'INVALID_INPUT' using detail = 'locale en or zh, entries an array';
  end if;
  if jsonb_array_length(v_entries) > 8 then
    raise exception 'CASE_STRIP_SIZE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_entries) as e(entry)
    where jsonb_typeof(e.entry) <> 'object' or e.entry ->> 'kind' is null or e.entry ->> 'kind' not in ('template', 'bundle')
      or coalesce(e.entry ->> 'id', '') = ''
  ) then
    raise exception 'INVALID_INPUT' using detail = 'each entry a kind and an id';
  end if;
  if jsonb_array_length(v_entries) <> (select count(distinct (e.entry ->> 'kind', e.entry ->> 'id')) from jsonb_array_elements(v_entries) as e(entry)) then
    raise exception 'INVALID_INPUT' using detail = 'entries must not repeat';
  end if;
  lock table public.templates in share row exclusive mode;
  lock table public.featured_bundles in share row exclusive mode;
  if exists (
    select 1 from jsonb_array_elements(v_entries) as e(entry)
    where e.entry ->> 'kind' = 'template'
      and not exists (select 1 from public.templates t where t.id = e.entry ->> 'id' and t.is_active and 'web' = any (t.visible_in))
  ) then
    raise exception 'INVALID_INPUT' using detail = 'only published web templates';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_entries) as e(entry)
    where e.entry ->> 'kind' = 'bundle'
      and not exists (select 1 from public.featured_bundles b where b.id::text = e.entry ->> 'id')
  ) then
    raise exception 'BUNDLE_NOT_FOUND';
  end if;
  delete from public.home_case_strip where locale = p_locale;
  insert into public.home_case_strip (locale, rank, template_id, bundle_id)
  select p_locale, o.position::int,
    case when o.entry ->> 'kind' = 'template' then o.entry ->> 'id' end,
    case when o.entry ->> 'kind' = 'bundle' then (o.entry ->> 'id')::uuid end
  from jsonb_array_elements(v_entries) with ordinality as o(entry, position);
end $$;

revoke all on function public.admin_set_home_case_strip(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_home_case_strip(text, jsonb, uuid) to service_role;
