-- Extend the T94 allowlist atomically so both programs continue to audit to the same table.
alter table public.admin_audit_log
  drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
    'ban_user', 'unban_user', 'view_work', 'replay_checkout', 'decide_refund', 'submit_dispute', 'clawback_payment',
    'save_code', 'set_code_active',
    'affiliate_create', 'affiliate_decide', 'affiliate_set', 'affiliate_rebind', 'affiliate_adjust',
    'affiliate_commission_release', 'affiliate_payout_decide', 'affiliate_settings', 'affiliate_recompute'
  ));
