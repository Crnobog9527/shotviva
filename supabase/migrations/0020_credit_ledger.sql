-- Every change to profiles.credits / profiles.paid_until is recorded here (ARCHITECTURE §6.1).
-- The unique idempotency key is what makes grants, reserves, refunds and purchases
-- settle at most once. Private: no client role can read or write it (AGENTS §5).
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('grant', 'reserve', 'refund', 'purchase', 'admin_adjust')),
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  paid_until_after timestamptz,
  reason text not null check (length(reason) > 0),
  idempotency_key text not null unique,
  job_id uuid,
  product_id text,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_id_created_at_idx on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

revoke all on public.credit_ledger from anon, authenticated;
-- Server-side reads only (support, debugging); writes go through SQL functions.
grant select on public.credit_ledger to service_role;
