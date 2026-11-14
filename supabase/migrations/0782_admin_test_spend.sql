-- T85: what admin test runs spent, one row per run (ARCHITECTURE §10.b 「费用」). Kept apart from
-- admin_test_runs on purpose: the records are trimmed (newest 50 per template, 30 days) and go
-- with their template, but money already spent must still count against today's budget and
-- still show on /admin/costs. So no foreign keys here; the panel's cleanup only drops rows older
-- than 100 days (/admin/costs reads at most 90).
--   estimate_usd  what the run holds against the budget while it runs (0784)
--   cost_usd      the real cost when it ended (§10.0), null when it could not be priced
--   counted_usd   what the budget counts once it ended (0785): the real cost; else the estimate
--                 when the image model was called (it bills even when we cannot price it);
--                 else 0 (refused or failed before the image model answered). null while running.
-- Private: RLS on with no policy, read and written through the service role only.

create table public.admin_test_spend (
  run_id uuid primary key,
  template_id text not null,
  started_at timestamptz not null default now(),
  estimate_usd numeric(10, 6) not null check (estimate_usd >= 0),
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  counted_usd numeric(10, 6) check (counted_usd >= 0),
  finished_at timestamptz
);

-- Today's budget (Beijing day), per-day costs (UTC days) and the 100-day prune.
create index admin_test_spend_started_at_idx on public.admin_test_spend (started_at);

alter table public.admin_test_spend enable row level security;

revoke all on public.admin_test_spend from anon, authenticated;
grant select, insert, update, delete on public.admin_test_spend to service_role;
