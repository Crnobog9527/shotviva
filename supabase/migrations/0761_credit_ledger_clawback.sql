-- T71: clawbacks are ledger rows of their own. 'clawback' (negative, paid pool) takes credits
-- back for a refunded or disputed payment; 'clawback_restore' (positive) gives a won dispute's
-- share back. Neither carries a product_id, so current_tier, apply_purchase's upgrade check and
-- the admin plan columns (which read positive rows with a membership product_id) never see them.
-- payment_id names the payment a clawback row belongs to (§6.2: 「关联 payment_id 和退款号」; the
-- refund or dispute id is in the idempotency key). Widening only; older rows keep null.
alter table public.credit_ledger
  drop constraint credit_ledger_kind_check,
  add constraint credit_ledger_kind_check
    check (kind in ('grant', 'reserve', 'refund', 'purchase', 'admin_adjust', 'clawback', 'clawback_restore')),
  add column payment_id bigint references public.payments (id) on delete set null;
