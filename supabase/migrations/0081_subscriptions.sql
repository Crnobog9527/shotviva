-- T9: mirror of Stripe subscriptions (ARCHITECTURE §6.2). Stripe holds the only truth; the
-- webhook copies its current state here (first payment in T9, renewals and cancellation in
-- T10) and the account page only reads it. One row per Stripe subscription.
-- Private like orders (AGENTS §5): no client role can read or write it; the server reads it
-- with the service role.
create table public.subscriptions (
  stripe_subscription_id text primary key check (stripe_subscription_id like 'sub_%'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Only memberships are sold as subscriptions; packs are always one-time.
  product_id text not null references public.products (id) check (product_id not like 'pack_%'),
  -- Stripe's subscription statuses, copied verbatim.
  status text not null check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  )),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

revoke all on public.subscriptions from anon, authenticated;
-- The webhook upserts by stripe_subscription_id; nothing deletes (a cancelled subscription
-- keeps its row with status 'canceled').
grant select, insert, update on public.subscriptions to service_role;
