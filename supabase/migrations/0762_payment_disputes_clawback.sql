-- T71: a dispute's own share of the clawback, so a won dispute gives back exactly what it took
-- (charge.dispute.closed, close_payment_dispute 0769). credits_clawed_back / clawback_shortfall:
-- what open_payment_dispute took and wrote off for it; closed_status: Stripe's final status
-- (won, lost, warning_closed …); credits_restored: what the win gave back.
alter table public.payment_disputes
  add column credits_clawed_back integer not null default 0 check (credits_clawed_back >= 0),
  add column clawback_shortfall integer not null default 0 check (clawback_shortfall >= 0),
  add column closed_status text check (closed_status ~ '^[a-z_]{1,40}$'),
  add column closed_at timestamptz,
  add column credits_restored integer not null default 0 check (credits_restored >= 0);
