-- Dense-text posters (ARCHITECTURE §5.3 自动核对): after a poster is made, a vision model reads its
-- text back and the server compares it line by line with what the user confirmed. One row per
-- poster job: the outcome, the lines that differ (expected text and the closest text read), and
-- the call's tokens and cost. Owners read their own; only the server writes.
create table public.poster_checks (
  job_id uuid primary key references public.generation_jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('match', 'mismatch', 'unchecked')),
  diffs jsonb not null default '[]' check (jsonb_typeof(diffs) = 'array' and pg_column_size(diffs) <= 32768),
  provider text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index poster_checks_user on public.poster_checks (user_id, created_at desc);

alter table public.poster_checks enable row level security;

create policy poster_checks_read_own on public.poster_checks
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.poster_checks from anon, authenticated;
grant select on public.poster_checks to authenticated;
grant select, insert, update on public.poster_checks to service_role;
