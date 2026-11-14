-- T71: Waffo refunds, one row per refund.succeeded. Waffo's event gives this refund's amount only
-- (docs.waffo.ai Webhooks: "The payload does not report how much of the payment has been refunded
-- in total"), so payments.amount_refunded is summed from here, and a redelivered event (same
-- refund_ref, the event id) adds nothing. Stripe needs no such table: charge.amount_refunded is
-- already the running total.
create table public.payment_refunds (
  refund_ref text primary key check (length(refund_ref) between 1 and 160),
  payment_id bigint not null references public.payments (id) on delete cascade,
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.payment_refunds enable row level security;
-- Private (AGENTS §5): only record_waffo_refund (0770) writes it.
revoke all on public.payment_refunds from public, anon, authenticated, service_role;
