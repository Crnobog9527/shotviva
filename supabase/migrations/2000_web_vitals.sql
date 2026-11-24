-- 2000: anonymous real-user speed numbers (Core Web Vitals) from the signed-in app pages (Owner
-- 2026-11-24: numbers only, no personal data). POST /api/vitals writes one row per metric per page
-- load with the service role. A row names no one: no user, visitor or session id, no IP, no URL,
-- no user agent; the route is only the app root, the country only Vercel's two-letter code.
-- Never granted to clients: RLS on with no policies; only service_role inserts and reads.
-- Expand-only: a new table, nothing existing changes. The checks match
-- src/core/analytics/vitals/fields.ts one for one.
-- created_at is the server's receive time cut to the hour, and only that (the check): a p75 over a
-- window needs nothing finer, and an exact time plus country could be lined up with identified
-- analytics of the same moment. The handler never sends it.
-- Retention: rows are only useful as recent p75s. A later migration adds the p75 read path and a
-- cleanup of rows older than about 90 days (that role will need DELETE); no cron yet.
create table public.web_vitals (
  id bigserial primary key,
  created_at timestamptz not null default date_trunc('hour', now(), 'UTC') check (created_at = date_trunc('hour', created_at, 'UTC')),
  metric text not null check (metric in ('LCP','FCP','TTFB','INP','CLS')),
  value double precision not null check (value >= 0 and value <= case when metric = 'CLS' then 100 else 120000 end),
  rating text not null check (rating in ('good','needs-improvement','poor')),
  route text not null check (route in ('generate','photos','posters','account','wishlist')),
  locale text not null check (locale in ('en','zh')),
  nav_type text not null check (nav_type in ('navigate','reload','back-forward','prerender','restore')),
  standalone boolean not null,
  sw boolean not null,
  effective_type text check (effective_type in ('slow-2g','2g','3g','4g')),
  country text check (country ~ '^[A-Z]{2}$')
);
alter table public.web_vitals enable row level security;
revoke all on table public.web_vitals from public, anon, authenticated;
revoke all on sequence public.web_vitals_id_seq from public, anon, authenticated;
grant select, insert on table public.web_vitals to service_role;
grant usage on sequence public.web_vitals_id_seq to service_role;

-- The p75 per page and metric over a recent window.
create index web_vitals_route_metric_created_idx on public.web_vitals (route, metric, created_at);
