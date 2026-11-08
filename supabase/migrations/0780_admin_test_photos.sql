-- T85: the photos the Owner tests templates with in the admin (ARCHITECTURE §10.b 后台模板试跑).
-- Kept apart from users' uploads: the private bucket's admin-tests/photos/ prefix, a row here, and
-- no link to any account's works. "最近用过的测试照片" reads the newest last_used_at rows; every
-- test run bumps it. Rows unused for 30 days that no cover run points at are cleaned up when the
-- panel opens (admin_cleanup_test_runs, 0785), not by a scheduled job.
-- Private: RLS on with no policy, read and written through the service role only.

create table public.admin_test_photos (
  id uuid primary key,
  object_key text not null unique check (object_key ~ '^admin-tests/photos/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

-- "最近用过" (newest first, 12 rows) and the 30-day cleanup.
create index admin_test_photos_last_used_at_idx on public.admin_test_photos (last_used_at desc);

alter table public.admin_test_photos enable row level security;

revoke all on public.admin_test_photos from anon, authenticated;
grant select, insert, update, delete on public.admin_test_photos to service_role;
