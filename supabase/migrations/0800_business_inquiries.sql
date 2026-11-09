-- T86: business inquiries from the pricing page's "For business" form (ARCHITECTURE §10.c,
-- DESIGN §6.9 item 8). The Owner follows each one up by hand from /admin/inquiries.
--
-- Private: RLS on with no policy. The form posts to the server, which validates the input and
-- writes through submit_business_inquiry (0801); the admin pages read and update with the
-- service role. No client ever reaches the table.
--
-- The lengths and the choice lists repeat what the server already checks (core/inquiries), so a
-- bad row cannot get in even past the app. Visitors' IP addresses are never stored: ip_hash is an
-- HMAC-SHA256 hex digest made on the server, used only for the per-IP limits.

create table public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locale text not null check (locale in ('en', 'zh')),
  page text not null check (page in ('/pricing', '/zh/pricing')),
  -- Signed in when they sent it; the inquiry outlives a deleted account.
  user_id uuid references public.profiles (id) on delete set null,
  -- Required fields.
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  company text not null check (char_length(btrim(company)) between 1 and 200),
  monthly_volume text not null check (monthly_volume in ('under_100', '100_500', '500_2000', '2000_10000', 'over_10000')),
  uses text[] not null check (
    cardinality(uses) between 1 and 6
    and uses <@ array['ecommerce', 'food_menu', 'social', 'real_estate', 'ads', 'other']
  ),
  message text not null check (char_length(btrim(message)) between 10 and 1000),
  -- Optional fields.
  job_title text check (char_length(job_title) between 1 and 100),
  website text check (char_length(website) between 1 and 300),
  wechat text check (char_length(wechat) between 1 and 64),
  phone text check (char_length(phone) between 1 and 32),
  team_size text check (team_size in ('1_5', '6_20', '21_100', 'over_100')),
  country text check (char_length(country) between 1 and 100),
  platforms text[] not null default '{}' check (
    platforms <@ array['taobao_tmall', 'jd', 'pinduoduo', 'douyin', 'xiaohongshu', 'meituan_eleme', 'amazon',
                       'shopify', 'etsy', 'ebay', 'instagram', 'tiktok', 'other']
  ),
  needs text[] not null default '{}' check (
    needs <@ array['volume_pricing', 'custom_templates', 'bulk_processing', 'api', 'brand_kit', 'invoicing']
  ),
  start_time text check (start_time in ('asap', 'within_1_month', '1_3_months', 'exploring')),
  -- The Owner's side.
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'closed')),
  admin_note text check (char_length(admin_note) <= 2000),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$')
);

-- The admin list, newest first, keyset on (created_at, id).
create index business_inquiries_created_at_idx on public.business_inquiries (created_at desc, id desc);

-- The list filtered by status, and the nav badge's count of status = 'new'.
create index business_inquiries_status_created_at_idx on public.business_inquiries (status, created_at desc, id desc);

-- The per-IP limits (3 an hour, 10 a day).
create index business_inquiries_ip_hash_created_at_idx
  on public.business_inquiries (ip_hash, created_at desc)
  where ip_hash is not null;

-- The per-email limit (3 a day), case-insensitive.
create index business_inquiries_email_created_at_idx on public.business_inquiries (lower(email), created_at desc);

-- The profiles cascade (set null) on account deletion.
create index business_inquiries_user_id_idx on public.business_inquiries (user_id) where user_id is not null;

alter table public.business_inquiries enable row level security;

revoke all on public.business_inquiries from public, anon, authenticated;
grant select, insert, update on public.business_inquiries to service_role;
