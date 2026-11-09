-- Keep all operations accepted by T71 and audit code changes in the same transaction.
alter table public.admin_audit_log
  drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in
    ('ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute','clawback_payment',
     'save_code','set_code_active'));
