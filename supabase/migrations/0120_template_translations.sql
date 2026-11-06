-- T21: the template's display text in other languages (ARCHITECTURE §5, §17). English stays in
-- `name` and `fields`; `translations` holds only what differs:
--   { "zh": { "name": "…", "description": "…", "fields": { "<copy key>": { "label": "…", "placeholder": "…" } } } }
-- A missing language or item falls back to English when read. Prompts are never translated.
-- Only enabled languages may be keys (v1: zh), and each language entry is an object.

alter table public.templates
  add column translations jsonb not null default '{}'::jsonb;

alter table public.templates
  add constraint templates_translations_check check (
    jsonb_typeof(translations) = 'object'
    and translations - 'zh' = '{}'::jsonb
    and (not translations ? 'zh' or jsonb_typeof(translations -> 'zh') = 'object')
  );
