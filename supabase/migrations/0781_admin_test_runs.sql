-- T85: one admin test run (ARCHITECTURE §10.b). The same pipeline as a user's generation or photo
-- edit, but nobody is charged and nothing lands in generation_jobs: works, the gallery, rate
-- limits, the overview, the jobs list, failure alerts and PostHog never see these rows. An edit
-- points at the run it edited (parent_id), so the runs of one template form a tree; photo_id is
-- the test photo at the root of that branch (an edit inherits it), the "before" cover if the run
-- is set as the cover. Cost is the provider's real usage, as on generation_jobs (§10.0), and
-- /admin/costs shows it as 后台试跑 (0788). estimate_usd is what the daily budget holds while the
-- run is still going (0782).
-- Private: RLS on with no policy, read and written through the service role only.

create table public.admin_test_runs (
  id uuid primary key,
  template_id text not null references public.templates (id) on delete cascade,
  kind text not null check (kind in ('generate', 'edit')),
  parent_id uuid references public.admin_test_runs (id) on delete set null,
  photo_id uuid references public.admin_test_photos (id) on delete set null,
  batch_id uuid not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  resolution text not null check (resolution in ('1k', '2k', '3k')),
  inputs jsonb not null default '{}'::jsonb,
  prompt_version integer,
  provider text,
  provider_usage jsonb,
  cost_usd numeric(10, 6) check (cost_usd >= 0),
  estimate_usd numeric(10, 6) not null check (estimate_usd >= 0),
  output_key text check (output_key ~ '^admin-tests/outputs/[0-9a-f-]{36}\.png$'),
  error_code text,
  duration_ms integer check (duration_ms >= 0),
  cover_set_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Only an edit has a parent; an edit whose parent was cleaned up keeps parent_id null.
  check (kind = 'edit' or parent_id is null)
);

-- The panel's list: a template's last 50 runs, newest first.
create index admin_test_runs_template_created_idx on public.admin_test_runs (template_id, created_at desc);
-- Today's budget, the 30-day cleanup and the per-day costs.
create index admin_test_runs_created_at_idx on public.admin_test_runs (created_at);
-- The parent_id and photo_id set-null cascades.
create index admin_test_runs_parent_id_idx on public.admin_test_runs (parent_id) where parent_id is not null;
create index admin_test_runs_photo_id_idx on public.admin_test_runs (photo_id) where photo_id is not null;

alter table public.admin_test_runs enable row level security;

revoke all on public.admin_test_runs from anon, authenticated;
grant select, insert, update, delete on public.admin_test_runs to service_role;
