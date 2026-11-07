-- T82 (ARCHITECTURE §6.3 「拒付申诉证据」): what a Stripe payment row keeps to answer a dispute.
-- purchase_ip / purchase_user_agent: the request that opened the Checkout Session, carried in
-- the session's own metadata and copied here when it settles (record_payment_context, 0721).
-- terms_accepted_at: when the payment settled with Checkout's required Terms consent ticked
-- (Stripe gives no consent timestamp; the box must be ticked before paying, so acceptance is at
-- or before this time). managed_payments: whether the session went through Managed Payments,
-- where Stripe answers disputes itself (null on rows older than T82 and on renewals).
-- All nullable: rows before T82, Waffo rows and renewals have none of it. Purpose disclosed in
-- the privacy policy (fraud prevention and disputes).
alter table public.payments
  add column purchase_ip inet,
  add column purchase_user_agent text,
  add column terms_accepted_at timestamptz,
  add column managed_payments boolean,
  add constraint payments_purchase_user_agent_check check (length(purchase_user_agent) between 1 and 500);
