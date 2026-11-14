-- The variants of an experiment (1540). `option_id` names one of the code's options for the
-- experiment's surface; the code refuses an unknown one before saving and serves the control for
-- one it no longer knows. A variant anyone was assigned to is never deleted: it is archived, and the
-- people on it move to `fallback_variant_id` (the control unless the admin picked another), which
-- admin_experiment_act records on their assignments (1542).

create table public.experiment_variants (
  id bigint generated always as identity primary key,
  experiment_id bigint not null references public.experiments (id) on delete cascade,
  option_id text not null check (option_id ~ '^[a-z0-9-]{1,40}$'),
  label text not null check (length(label) between 1 and 40),
  weight integer not null check (weight between 0 and 100),
  is_control boolean not null default false,
  archived_at timestamptz,
  fallback_variant_id bigint references public.experiment_variants (id),
  created_at timestamptz not null default now(),
  unique (experiment_id, option_id),
  -- The control can never be archived: it is where everyone else falls back to.
  check (not (is_control and archived_at is not null)),
  check ((archived_at is null) = (fallback_variant_id is null))
);

-- One control per experiment.
create unique index experiment_variants_control_idx on public.experiment_variants (experiment_id) where is_control;

alter table public.experiments add constraint experiments_winner_variant_id_fkey
  foreign key (winner_variant_id) references public.experiment_variants (id);

alter table public.experiment_variants enable row level security;
revoke all on table public.experiment_variants from public, anon, authenticated;
-- Read by the admin page (service role); written only through the functions in 1543 and 1544.
grant select on table public.experiment_variants to service_role;
