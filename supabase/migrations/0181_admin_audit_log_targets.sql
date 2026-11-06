-- T25 (ARCHITECTURE §10): the audit log also records admin views of a work (view_work), Stripe
-- replays (replay_checkout, T26) and refund decisions on support tickets (decide_refund, T27).
-- target_id names what was acted on: a job id, a cs_… / sub_… id, a ticket id. Text, because a
-- Stripe id is not a uuid. Ban and unban leave it null: their target is the user itself.
--
-- T27 writes this same block (control 2026-11-06), so it is idempotent and whichever card
-- merges first applies it; the other is a no-op.

alter table public.admin_audit_log
  add column if not exists target_id text check (length(target_id) > 0);

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check,
  add constraint admin_audit_log_action_check
    check (action in ('ban_user', 'unban_user', 'view_work', 'replay_checkout', 'decide_refund'));
