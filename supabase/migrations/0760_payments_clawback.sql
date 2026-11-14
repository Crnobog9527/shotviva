-- T71 (ARCHITECTURE §6.2 「退款自动扣回积分」): what a payment's refunds and disputes took back.
-- credits_clawed_back: paid credits taken back for this payment so far, by refund callbacks, a
-- dispute, or the admin's 「扣回这笔付款的剩余积分」; a won dispute gives its share back.
-- clawback_shortfall: credits that were due back but already spent (the paid balance never goes
-- negative). Written off: never taken from a later top-up, no ban; the admin shows 「欠扣 N 积分」.
-- clawed_back + shortfall is what the payment has settled; each callback takes only the rest of
-- 「发放 × 累计退款比例」, so replays and the admin's earlier clawback are never taken twice.
alter table public.payments
  add column credits_clawed_back integer not null default 0 check (credits_clawed_back >= 0),
  add column clawback_shortfall integer not null default 0 check (clawback_shortfall >= 0);
