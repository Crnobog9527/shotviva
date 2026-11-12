-- templates:apply (1260) audits publishing, unpublishing (with the reason) and cover changes like an
-- admin action: 'template_apply_active' and 'template_apply_cover', reason "templates:apply: …".
-- Builds on 1273 (T93 sync actions) and widens the list only; every value accepted before is still
-- accepted. Numbered after 1273 so a fresh database applies 1273 first.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover'));
