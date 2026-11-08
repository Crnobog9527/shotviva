-- T71: the audit log also records the admin's 「扣回这笔付款的剩余积分」 (admin_clawback_payment,
-- 0531); target_id is the payment id. Widening only.
alter table public.admin_audit_log
  drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check
    check (action in ('ban_user', 'unban_user', 'view_work', 'replay_checkout', 'decide_refund', 'submit_dispute', 'clawback_payment'));
