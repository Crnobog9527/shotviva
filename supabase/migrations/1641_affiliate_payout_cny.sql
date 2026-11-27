-- Enterprise payouts (ARCHITECTURE §6.5): the statement stays in USD cents; the org is paid in CNY
-- offline at that day's rate. When an admin marks an enterprise statement paid they record the
-- rate and the CNY actually sent (admin_affiliate_payout_decide requires both, 1646). Personal
-- statements leave both empty.
alter table public.affiliate_payouts
  add column paid_fx_cny_per_usd numeric(12,6) check (paid_fx_cny_per_usd > 0 and paid_fx_cny_per_usd < 1000),
  add column paid_amount_cny_fen bigint check (paid_amount_cny_fen > 0);
