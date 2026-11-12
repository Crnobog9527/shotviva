-- T93 sync (2026-11-12, Owner: publication and sale follow the test site): every change the sync makes
-- to a template's 上下架 or 开放售卖, or a series' 上下架, on production is audited here like an admin
-- action, with the reason "T93 sync from preview run <run id>". Widens the list only; every value
-- accepted before is still accepted.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active'));
