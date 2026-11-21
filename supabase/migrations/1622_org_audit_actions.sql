-- Widen only: every existing action (as of 1600) plus the four enterprise admin actions
-- (ARCHITECTURE §6.5).
alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members','template_delete','provider_declare_tiers',
  'series_delete','series_sync_delete',
  'experiment_save','experiment_start','experiment_pause','experiment_resume','experiment_end',
  'experiment_archive_variant','experiment_delete',
  'blog_save','blog_publish','blog_unpublish',
  'org_create','org_update','org_grant','org_package_save'));
