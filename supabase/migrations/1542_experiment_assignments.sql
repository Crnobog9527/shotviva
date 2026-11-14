-- Which variant an account is on, per experiment (1540). Written at sign-in from the visitor's
-- cookie (experiment_sign_in, 1544); the account's row wins over a cookie on any later device.
-- `first_variant_id` is the variant the person saw first and never changes: results count against
-- it. `current_variant_id` is what they see now; archiving a variant moves it and records
-- `reassigned_from` / `reassigned_at`, so results can show how many people were moved.
-- `source` = 'signup' when the row was written by the sign-up itself: only those count as sign-ups
-- the variant brought (admin_experiment_results, 1545); 'sign_in' rows are existing accounts.

create table public.experiment_assignments (
  experiment_id bigint not null references public.experiments (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_variant_id bigint not null references public.experiment_variants (id),
  current_variant_id bigint not null references public.experiment_variants (id),
  source text not null check (source in ('signup', 'sign_in')),
  assigned_at timestamptz not null default now(),
  reassigned_at timestamptz,
  reassigned_from bigint references public.experiment_variants (id),
  primary key (experiment_id, user_id),
  check ((reassigned_at is null) = (reassigned_from is null))
);

-- experiment_sign_in(): one account's rows.
create index experiment_assignments_user_idx on public.experiment_assignments (user_id);
-- admin_experiment_act('archive'): the people on the variant being archived.
create index experiment_assignments_current_idx on public.experiment_assignments (current_variant_id);

alter table public.experiment_assignments enable row level security;
revoke all on table public.experiment_assignments from public, anon, authenticated;
-- Read by the admin page (service role); written only through the functions in 1543 and 1544.
grant select on table public.experiment_assignments to service_role;
