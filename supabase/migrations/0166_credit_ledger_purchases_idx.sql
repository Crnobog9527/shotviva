-- T23 PR B: the orders page lists purchases newest first, keyset on (created_at, id). Most
-- ledger rows are generation reserves and refunds, so a partial index keeps the walk to
-- purchases only (approved by control, 2026-11-06). admin_revenue_stats reads it too.
create index credit_ledger_purchases_created_at_id_idx
  on public.credit_ledger (created_at desc, id desc)
  where kind = 'purchase';
