-- T10: one row per successful payment (ARCHITECTURE §6.1 "付款记录与续费函数"), so the admin
-- orders page shows what was actually charged instead of list prices. Written in the same
-- transaction as the grant: settle_checkout (first payment, one-time) and
-- apply_subscription_renewal (renewals). Amounts, tax and method come from Stripe, retrieved by
-- the webhook; nothing here is ever taken from the client.
-- Refunds and disputes only change status / amount_refunded (record_payment_issue); credits are
-- never clawed back (ARCHITECTURE §6.2: the Owner adjusts by hand).
create table public.payments (
  id bigint generated always as identity primary key,
  -- Follows credit_ledger: deleting an account deletes its money history with it.
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null references public.products (id),
  channel text not null check (channel in ('stripe', 'waffo')),
  -- Stripe ids. A first payment / one-time purchase has the Checkout Session (and, for a
  -- subscription, its first invoice); a renewal has only the invoice. The charge is what
  -- refunds and disputes point at; card charges are ch_, Alipay ones py_.
  stripe_session_id text unique check (stripe_session_id like 'cs\_%'),
  stripe_invoice_id text unique check (stripe_invoice_id like 'in\_%'),
  stripe_charge_id text unique check (stripe_charge_id ~ '^(ch|py)_'),
  -- Waffo one-time payments (T13 writes these rows).
  waffo_order_id text unique check (length(waffo_order_id) > 0),
  -- Smallest currency unit (cents). amount_total includes tax (Managed Payments adds it on top).
  amount_total integer not null check (amount_total >= 0),
  amount_tax integer not null default 0 check (amount_tax >= 0 and amount_tax <= amount_total),
  amount_refunded integer not null default 0 check (amount_refunded >= 0 and amount_refunded <= amount_total),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  method text not null check (method in ('card', 'alipay')),
  status text not null default 'paid' check (status in ('paid', 'refunded', 'partially_refunded', 'disputed')),
  created_at timestamptz not null default now(),
  constraint payments_stripe_ids_check check (
    channel <> 'stripe' or stripe_session_id is not null or stripe_invoice_id is not null
  ),
  constraint payments_waffo_ids_check check (channel <> 'waffo' or waffo_order_id is not null)
);

-- The profiles cascade (account deletion) finds a user's rows through this index. Lookups by
-- session / invoice / charge / Waffo order id use the unique constraints' indexes.
create index payments_user_id_idx on public.payments (user_id);

-- Private like orders (AGENTS §5): no client role reads or writes it. The server reads it with
-- the service role; only the SQL functions above write it.
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
revoke all on public.payments from service_role;
grant select on public.payments to service_role;
