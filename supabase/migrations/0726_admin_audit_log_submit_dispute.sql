-- T82: the audit log also records an admin submitting dispute evidence to Stripe
-- (admin_mark_dispute_submitted, 0729); target_id is the dp_… id. Widening only. The automatic
-- ban on a dispute goes through admin_ban_user, so it is an ordinary 'ban_user' row (reason 拒付).
alter table public.admin_audit_log
  drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check
    check (action in ('ban_user', 'unban_user', 'view_work', 'replay_checkout', 'decide_refund', 'submit_dispute'));
