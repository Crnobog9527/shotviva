-- 首页首屏大图 (Owner 2026-11-25): the phone-photo → result pair beside the home H1, picked in admin
-- instead of written in code. One template shows alone; two to six take turns. The pictures are
-- always the templates' own covers; a scene may carry a short caption (null: the template's name).
-- `scope` is 'default' or a site language. A language with rows shows its own scenes; one without
-- follows 'default'; with neither, the page keeps its built-in hero.
-- Languages are not listed here: the site's language list lives in code (core/i18n/locales.ts) and
-- the app checks the scope against it, so a new language needs no migration. The database only
-- checks the shape of a language tag.
-- Expand-only: a new table and a new admin function; nothing existing reads or changes.

create table public.home_hero_scenes (
  scope text not null constraint home_hero_scenes_scope_check check (scope = 'default' or scope ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  position integer not null constraint home_hero_scenes_position_check check (position between 1 and 6),
  template_id text not null references public.templates (id) on delete cascade on update cascade,
  caption text constraint home_hero_scenes_caption_check check (caption is null or length(btrim(caption)) between 1 and 60),
  primary key (scope, position),
  constraint home_hero_scenes_template_key unique (template_id, scope)
);

alter table public.home_hero_scenes enable row level security;
revoke all on public.home_hero_scenes from public, anon, authenticated;
grant all on public.home_hero_scenes to service_role;

-- Replaces one scope's whole list, in order: p_entries is a JSON array of
-- {"templateId": "...", "caption": "..." | null}, at most 6, no repeats, published web templates
-- only. An empty array clears it (a language then follows 'default'; 'default' then means the
-- built-in hero).
create function public.admin_set_home_hero(p_scope text, p_entries jsonb, p_actor uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_entries jsonb := coalesce(p_entries, '[]'::jsonb);
begin
  perform admin.require_admin(p_actor);
  if p_scope is null or not (p_scope = 'default' or p_scope ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$') or jsonb_typeof(v_entries) <> 'array' then
    raise exception 'INVALID_INPUT' using detail = 'scope default or a language tag, entries an array';
  end if;
  if jsonb_array_length(v_entries) > 6 then
    raise exception 'HERO_SIZE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_entries) as e(entry)
    where jsonb_typeof(e.entry) <> 'object' or coalesce(e.entry ->> 'templateId', '') = ''
      or (e.entry ? 'caption' and jsonb_typeof(e.entry -> 'caption') not in ('string', 'null'))
      or length(btrim(coalesce(e.entry ->> 'caption', 'x'))) not between 1 and 60
  ) then
    raise exception 'INVALID_INPUT' using detail = 'each entry a templateId, a caption of 1-60 characters or null';
  end if;
  if jsonb_array_length(v_entries) <> (select count(distinct e.entry ->> 'templateId') from jsonb_array_elements(v_entries) as e(entry)) then
    raise exception 'INVALID_INPUT' using detail = 'templates must not repeat';
  end if;
  lock table public.templates in share row exclusive mode;
  if exists (
    select 1 from jsonb_array_elements(v_entries) as e(entry)
    where not exists (select 1 from public.templates t where t.id = e.entry ->> 'templateId' and t.is_active and 'web' = any (t.visible_in))
  ) then
    raise exception 'INVALID_INPUT' using detail = 'only published web templates';
  end if;
  delete from public.home_hero_scenes where scope = p_scope;
  insert into public.home_hero_scenes (scope, position, template_id, caption)
  select p_scope, o.position::int, o.entry ->> 'templateId', nullif(btrim(coalesce(o.entry ->> 'caption', '')), '')
  from jsonb_array_elements(v_entries) with ordinality as o(entry, position);
end $$;

revoke all on function public.admin_set_home_hero(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_home_hero(text, jsonb, uuid) to service_role;
