-- T87: per-language template covers (ARCHITECTURE §8.3 「封面按语言适配」). The existing cover
-- columns stay the common cover (no language); cover_locales holds each language's own, all
-- optional:  { "<locale>": { "before", "after", "media" ('animated' | 'video'), "video", "poster" } }
-- A page shows its language's own cover where set, else the common one, else (no common cover) the
-- first launched language that has one (core/templates cover-for-locale.ts). Languages that are
-- registered but not launched yet (site.config locales.upcoming) can be filled ahead; the site
-- never shows them. Written only through admin_set_template_locale_cover (0824) and
-- admin_set_test_run_cover (0823). Expand-only: deployed code never reads it.

alter table public.templates
  add column cover_locales jsonb not null default '{}'::jsonb
    constraint templates_cover_locales_object check (jsonb_typeof(cover_locales) = 'object');
