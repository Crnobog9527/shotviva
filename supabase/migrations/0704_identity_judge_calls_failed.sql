-- T81 (ARCHITECTURE §5.1a): which decision calls never answered. Both attempts timed out or
-- failed, so the request went through unscreened (fail open); /admin/providers counts them over
-- the last 24 hours (0705). Existing rows are calls that answered or were still running: false.

alter table public.identity_judge_calls add column failed boolean not null default false;
