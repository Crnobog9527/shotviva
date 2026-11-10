create table public.prompt_lab_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.prompt_lab_sessions(id) on delete cascade,
  batch_id uuid not null,
  ordinal integer not null check(ordinal between 1 and 12),
  photo_id uuid not null references public.admin_test_photos(id),
  version_id uuid not null,
  model text not null check(length(model) between 1 and 300),
  resolution text not null check(resolution in ('1k','2k','3k')),
  quality text not null check(quality in ('medium','high')),
  use_style_reference boolean not null,
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),
  estimate_usd numeric(10,6) not null check(estimate_usd>0),
  cost_usd numeric(10,6) check(cost_usd>=0),
  output_key text check(output_key='prompt-lab/outputs/'||id::text||'.png'),
  error_code text,
  starred boolean not null default false,
  is_best boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  foreign key (session_id,version_id) references public.prompt_lab_versions(session_id,id) on delete cascade,
  unique(batch_id,photo_id,version_id),
  unique(batch_id,ordinal),
  check ((status='succeeded')=(output_key is not null)),
  check ((status in ('succeeded','failed'))=(finished_at is not null)),
  check (not is_best or status='succeeded')
);
create unique index prompt_lab_one_best on public.prompt_lab_runs(session_id) where is_best;
create index prompt_lab_runs_session_page on public.prompt_lab_runs(session_id,started_at desc,id desc);
create index prompt_lab_runs_photo on public.prompt_lab_runs(photo_id);
create index prompt_lab_runs_version on public.prompt_lab_runs(version_id);
create index prompt_lab_runs_creator on public.prompt_lab_runs(created_by) where created_by is not null;
create index prompt_lab_runs_unfinished on public.prompt_lab_runs(started_at) where status in ('queued','running');
alter table public.prompt_lab_runs enable row level security;
revoke all on public.prompt_lab_runs from public,anon,authenticated;
grant select,insert,update,delete on public.prompt_lab_runs to service_role;
