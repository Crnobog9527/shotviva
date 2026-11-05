-- T23: global time indexes for the admin (ARCHITECTURE §10 「后台数据访问补充」). The existing
-- (user_id, created_at) indexes only serve per-user reads; the overview counts and the jobs list
-- range over all users by time.

-- /admin/jobs keyset pagination ((created_at, id) desc) and admin_dashboard_stats.
create index generation_jobs_created_at_id_idx on public.generation_jobs (created_at desc, id desc);

-- admin_dashboard_stats: credits consumed and first purchases in the window.
create index credit_ledger_created_at_idx on public.credit_ledger (created_at);

-- admin_dashboard_stats: signups in the window.
create index profiles_created_at_idx on public.profiles (created_at);
