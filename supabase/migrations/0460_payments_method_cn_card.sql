-- T64 (ARCHITECTURE §6.1 payments, §6.3): zh pages sell through 中国银行卡, a plain Stripe card
-- route, beside the Managed Payments card. payments.method records which one charged:
-- `card` = Managed Payments card (海外银行卡), `cn_card` = plain Stripe card (中国银行卡),
-- `alipay` unchanged. Widening only: every existing row still passes, and settle_checkout /
-- apply_subscription_renewal / settle_waffo_order already take p_method as text.
alter table public.payments
  drop constraint payments_method_check,
  add constraint payments_method_check check (method in ('card', 'alipay', 'cn_card'));
