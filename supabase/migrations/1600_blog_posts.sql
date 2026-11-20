-- Blog CMS v1 (ARCHITECTURE §12.6): one row per post per language, edited in /admin/blog and
-- read by the public /blog pages. Expand-only: a new table, and the admin audit action list is
-- widened (every value accepted before still is, through 1543's experiment_delete).
--
-- Access: RLS on. The public (anon and signed-in) may read published rows, and every column
-- but created_by. Nobody writes through the API; writes go through admin_blog_save and
-- admin_blog_set_status (1601), service role only.

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  locale text not null check (locale in ('en', 'zh')),
  -- The address part: /blog/<slug> or /zh/blog/<slug>. Unique per language, so a post and its
  -- translation may share one slug.
  slug text not null check (char_length(slug) <= 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  -- The meta description.
  description text not null check (char_length(description) between 1 and 320),
  -- Markdown source; the site renders it without raw HTML. 200k characters is far above a
  -- long article and keeps one row from carrying a file.
  body_md text not null default '' check (char_length(body_md) <= 200000),
  -- https only (the public assets bucket); the alt text is required with it.
  cover_url text check (cover_url is null or (char_length(cover_url) <= 500 and cover_url ~ '^https://[^\s/?#@]+/\S*$')),
  cover_alt text check (cover_alt is null or char_length(cover_alt) between 1 and 200),
  author_name text not null check (char_length(author_name) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- Set on the first publish and kept when a post is taken down and published again.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint blog_posts_locale_slug_key unique (locale, slug),
  constraint blog_posts_cover_alt_required check (cover_url is null or cover_alt is not null),
  constraint blog_posts_published_has_date check (status <> 'published' or published_at is not null)
);

-- The public list and the sitemap: published posts of one language, newest first, keyset on
-- (published_at, id).
create index blog_posts_published_idx on public.blog_posts (locale, published_at desc, id desc) where status = 'published';
-- The admin list: newest first, keyset on (created_at, id) like every admin list.
create index blog_posts_created_idx on public.blog_posts (created_at desc, id desc);

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

alter table public.blog_posts enable row level security;

revoke all on public.blog_posts from anon, authenticated;
grant select (id, locale, slug, title, description, body_md, cover_url, cover_alt, author_name, status, published_at, created_at, updated_at)
  on public.blog_posts to anon, authenticated;
grant select, insert, update on public.blog_posts to service_role;

create policy blog_posts_read_published on public.blog_posts for select to anon, authenticated using (status = 'published');

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members','template_delete','provider_declare_tiers',
  'series_delete','series_sync_delete',
  'experiment_save','experiment_start','experiment_pause','experiment_resume','experiment_end',
  'experiment_archive_variant','experiment_delete',
  'blog_save','blog_publish','blog_unpublish'));
