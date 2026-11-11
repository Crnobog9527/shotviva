-- T108 (ARCHITECTURE §9.1): the gallery switches and moderation decisions are audited. Widens
-- the list only; every value accepted before is still accepted.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute','clawback_payment',
  'save_code','set_code_active','affiliate_create','affiliate_decide','affiliate_set','affiliate_rebind',
  'affiliate_adjust','affiliate_commission_release','affiliate_payout_decide','affiliate_settings','affiliate_recompute',
  'waffo_renewal_settled','waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry','catalog_archive','catalog_waffo',
  'gallery_setting','moderate_work'));
