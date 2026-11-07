-- T81 (ARCHITECTURE §5.1a): the decision calls made to screen a user's words. They happen before
-- reserve_credits, so a refused request, or one that later fails on credits or the upload,
-- leaves no job row and would escape the generation rate limit; this table bounds them per
-- account (0703) and lets the same words reuse a verdict for 10 minutes.
--
--   text_hash      sha256 hex of the words judged (never the words); null for a photo edit,
--                  whose scope call runs whatever the words
--   identity_swap  the verdict once the call answered; null while running, or if it failed
--
-- Only the last hour matters; rows older than a day go as new ones are written. Private: RLS on
-- with no policy, reached only through the 0703 functions with the service role.

create table public.identity_judge_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  text_hash text check (text_hash ~ '^[0-9a-f]{64}$'),
  identity_swap boolean,
  created_at timestamptz not null default now()
);

-- The hourly count and the 10-minute reuse per account; the sweep.
create index identity_judge_calls_user_id_created_at_idx on public.identity_judge_calls (user_id, created_at desc);
create index identity_judge_calls_created_at_idx on public.identity_judge_calls (created_at);

alter table public.identity_judge_calls enable row level security;

revoke all on public.identity_judge_calls from public, anon, authenticated;
grant select, insert, update, delete on public.identity_judge_calls to service_role;
