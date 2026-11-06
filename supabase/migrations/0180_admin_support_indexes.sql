-- T25: indexes for the support tools (ARCHITECTURE §10「客服与付款补救」). Each serves one query:

-- /admin/users/[id] payments block: a user's last 10 payments, newest first.
create index payments_user_id_created_at_idx on public.payments (user_id, created_at desc);

-- Same-IP accounts on the user detail, and the same-IP check in grant_credits (0184).
create index profiles_signup_ip_created_at_idx on public.profiles (signup_ip, created_at);

-- Stuck jobs (/admin/jobs) and the overview to-do count: only running rows, so it stays tiny;
-- without it the query walks the whole time index.
create index generation_jobs_running_created_at_idx on public.generation_jobs (created_at) where status = 'running';
