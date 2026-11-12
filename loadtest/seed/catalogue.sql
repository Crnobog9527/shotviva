-- Synthetic, production-shaped catalogue for local load tests. LOCAL DATABASES ONLY.
-- Shape follows the live catalogue (category tree, series of high-quality members bound to
-- the active image model, medium templates with an approved price batch, partner-only and
-- inactive templates, a 30-day job history). Every name, price and prompt here is made up.
--
--   psql -v scale=1 -v jobs=32 -v users=50 -f loadtest/seed/catalogue.sql
--
-- scale multiplies templates, series and categories; jobs is the 30-day job history size;
-- users is the number of sign-in accounts (loadtest-N@example.test, password in README).
\set ON_ERROR_STOP on
\if :{?scale} \else \set scale 1 \endif
\if :{?jobs} \else \set jobs 32 \endif
\if :{?users} \else \set users 50 \endif

-- Refuse anything but a disposable local database: one with a real account in it is not one.
do $guard$
begin
  if exists (select from auth.users where email is null or email not like 'loadtest-%@example.test') then
    raise exception 'refusing to seed: this database has accounts other than loadtest-N@example.test (run it only on a fresh `supabase db reset`)';
  end if;
end $guard$;

begin;
-- Users first, with triggers on, so profiles are created the normal way.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
  recovery_token, email_change_token_new, email_change, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  'loadtest-' || n || '@example.test', extensions.crypt('loadtest-password', extensions.gen_salt('bf', 4)),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''
from generate_series(1, :users) n
on conflict do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u where u.email like 'loadtest-%@example.test'
  and not exists (select from auth.identities i where i.user_id = u.id);
update public.profiles p set credits = 1000000, free_credits = 0
from auth.users u where u.id = p.id and u.email like 'loadtest-%@example.test';

-- The rest bypasses the publish-time floor triggers: this is fixture data, and the catalogue
-- read is exactly what has to decide which of these templates may be listed.
set local session_replication_role = replica;

insert into public.system_settings(key, value) values ('pricing_catalog_version', '"v2"')
on conflict (key) do update set value = excluded.value;

insert into public.ai_providers (id, module, adapter, label, base_url, model, is_active, resolutions, capabilities, estimated_image_costs)
values
  ('11111111-0000-4000-8000-000000000001', 'image', 'openai_images', 'LT active image', 'https://api.openai.com/v1',
   'gpt-image-2.6-sunburst', true, '{1k,2k,3k}', '{"resolutions":["1k","2k","3k"],"aspectRatios":["16:9","4:5","1:1","9:16","3:2","4:3","2:3"],"originalRatio":true,"minReferences":0,"maxReferences":4,"fetchedAt":"2026-11-01T00:00:00Z"}', '{}'),
  ('11111111-0000-4000-8000-000000000002', 'image', 'openrouter_images', 'LT spare image', 'https://openrouter.ai/api/v1',
   'lt/spare-model', false, '{1k,2k}', '{"resolutions":["1k","2k"],"aspectRatios":["1:1"],"originalRatio":false,"minReferences":0,"maxReferences":1,"catalogImageCosts":{"1k":0.03,"2k":0.05},"fetchedAt":"2026-11-01T00:00:00Z"}', '{}'),
  ('11111111-0000-4000-8000-000000000003', 'decision', 'openai_responses', 'LT decision', 'https://api.openai.com/v1',
   'lt-decision', false, '{1k,2k,3k}', '{}', '{}')
on conflict (id) do nothing;

-- A fake key in the local Vault: the stub accepts anything, and the app refuses a provider without one.
update public.ai_providers set api_key_last4 = 'fake',
  vault_secret_id = vault.create_secret('sk-loadtest-not-a-real-key', 'loadtest-image-key-' || gen_random_uuid(), 'load tests only')
where id = '11111111-0000-4000-8000-000000000001' and vault_secret_id is null;

-- Category tree: 6 roots, 3*scale children, scale grandchildren per root.
insert into public.template_categories (key, name_en, name_zh, kind, level, slug, parent_id, sort_order)
select 'lt-r' || r, 'LT Root ' || r, '压测' || r, 'template', 1, 'lt-r' || r, null, r
from generate_series(1, 6) r on conflict do nothing;
insert into public.template_categories (key, name_en, name_zh, kind, level, slug, parent_id, sort_order)
select 'lt-r' || r || '-c' || c, 'LT ' || r || '-' || c, '压' || r || '-' || c, 'template', 2,
  'lt-c' || c, 'lt-r' || r, c
from generate_series(1, 6) r, generate_series(1, 3 * :scale) c on conflict do nothing;
insert into public.template_categories (key, name_en, name_zh, kind, level, slug, parent_id, sort_order)
select 'lt-r' || r || '-c' || c || '-g', 'LT ' || r || '-' || c || 'g', '压' || r || '-' || c || 'g', 'template', 3,
  'lt-g', 'lt-r' || r || '-c' || c, 1
from generate_series(1, 6) r, generate_series(1, :scale) c on conflict do nothing;

-- Series: 3*scale, five high-quality members each, members hidden from the standalone grid.
insert into public.template_series (id, slug, name_en, name_zh, category_key, sort_order, is_active, show_members)
select ('22222222-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid, 'lt-series-' || s, 'LT Series ' || s,
  '压测系列' || s, 'lt-r' || (1 + s % 6), s, true, false
from generate_series(1, 3 * :scale) s on conflict do nothing;

-- Templates: per 25, 15 series members (high), 6 medium web, 2 partner-only, 2 low-priced (hidden).
-- The first eight medium ones reuse the approved-tariff ids so the price batch applies.
with ids as (
  select n,
    case when n <= 15 * :scale then 'series'
         when n <= 21 * :scale then 'medium'
         when n <= 23 * :scale then 'partner'
         else 'cheap' end as kind
  from generate_series(1, 25 * :scale) n
), named as (
  select n, kind,
    coalesce(case when kind = 'medium' then (array['dark-dining','delivery-menu','white-background',
      'lifestyle-table','spa-podium','promo-poster','pet-studio'])[n - 15 * :scale] end, 'lt-tpl-' || n) as id
  from ids
)
insert into public.templates (id, name, category, category_key, subcategory_key, fields, quality, credits_cost,
  is_active, visible_in, sort_order, series_id, series_sort_order, description, translations)
select id, 'LT template ' || n, 'lt-r' || (1 + n % 6), 'lt-r' || (1 + n % 6),
  case when kind = 'series' then 'lt-r' || (1 + n % 6) || '-c' || (1 + n % (3 * :scale)) end,
  '{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}',
  case when kind = 'series' then 'high' else 'medium' end,
  case kind when 'series' then '{"1k":120,"2k":240,"3k":360}' when 'cheap' then '{"1k":1,"2k":2,"3k":3}'
    else '{"1k":80,"2k":160,"3k":240}' end::jsonb,
  -- About 56% active, like the live catalogue.
  kind = 'series' or n % 4 <> 0,
  case kind when 'partner' then '{partner}' else '{web,partner}' end::text[],
  n,
  case when kind = 'series' then ('22222222-0000-4000-8000-' || lpad((1 + (n - 1) / 5)::text, 12, '0'))::uuid end,
  (n - 1) % 5,
  'Synthetic load-test template ' || n,
  jsonb_build_object('zh', jsonb_build_object('name', '压测模板' || n))
from named
on conflict (id) do nothing;

insert into public.template_prompts (template_id, body, provider_id)
select t.id, 'Synthetic prompt',
  case when t.quality = 'high' or t.id like 'lt-tpl-%' then '11111111-0000-4000-8000-000000000001'::uuid end
from public.templates t where t.id like 'lt-%' or t.id in (select id from admin.template_tariffs_v2)
on conflict (template_id) do nothing;
insert into public.template_sale_approvals (template_id, enabled, unpriced_resolutions)
select t.id, true, case when t.quality = 'medium' then '{3k}'::text[] else '{}' end
from public.templates t where t.id like 'lt-%' or t.id in (select id from admin.template_tariffs_v2)
on conflict (template_id) do nothing;

-- One applied price batch covering the medium templates.
insert into admin.template_price_batches default values;
insert into admin.template_price_snapshots (batch_id, template_id, previous, applied, provider_id, provider_endpoint_hash)
select (select max(id) from admin.template_price_batches), t.id, '{}', '{}',
  '11111111-0000-4000-8000-000000000001', md5('https://api.openai.com/v1')
from public.templates t where t.quality = 'medium' and t.id not like 'lt-tpl-%' and t.id <> 'edit'
on conflict do nothing;

-- 30-day job history on the active model.
insert into public.generation_jobs (id, user_id, module, template_id, inputs, provider, source, status,
  visibility, credits_cost, credit_pool, created_at, finished_at, cost_usd, output_key, moderation_status)
select gen_random_uuid(), u.id, 'image', t.id,
  jsonb_build_object('resolution', (array['1k','1k','1k','2k','3k'])[1 + j % 5], 'quality', t.quality,
    'pricing_catalog_version', 'v2'),
  '11111111-0000-4000-8000-000000000001/gpt-image-2.6-sunburst', 'web',
  case when j % 20 = 0 then 'failed' else 'succeeded' end, 'private', 120, 'paid',
  now() - (j % 720) * interval '1 hour', now() - (j % 720) * interval '1 hour' + interval '40 seconds',
  0.05 + (j % 7) * 0.01, 'lt/' || j || '.webp', 'approved'
from generate_series(1, :jobs) j
cross join lateral (select id, quality from public.templates where id like 'lt-tpl-%' order by id offset (j % (15 * :scale)) limit 1) t
cross join lateral (select id from auth.users where email like 'loadtest-%@example.test' order by email offset (j % :users) limit 1) u;
commit;
analyze public.templates, public.template_categories, public.template_series, public.template_prompts, public.template_sale_approvals, public.ai_providers, public.generation_jobs, public.profiles, admin.template_price_snapshots, admin.template_price_batches;
