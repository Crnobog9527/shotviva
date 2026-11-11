-- T108 (ARCHITECTURE §9 第 8 条, §9.1): visitors' reports on public works. Private: RLS on and no
-- policy, written only by report_work and read only by the admin review page (service role).
create table public.work_reports (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'other')),
  note text check (note is null or (length(note) between 1 and 500)),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint work_reports_once_per_reporter unique (job_id, reporter_id)
);

-- Open reports per work (the review page's "reported" tab and its counts).
create index work_reports_open_idx on public.work_reports (job_id) where resolved_at is null;
-- A reporter's reports today (the daily cap).
create index work_reports_reporter_idx on public.work_reports (reporter_id, created_at);

alter table public.work_reports enable row level security;
revoke all on public.work_reports from public, anon, authenticated;
grant select on public.work_reports to service_role;
