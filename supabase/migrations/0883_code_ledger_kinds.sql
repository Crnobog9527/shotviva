-- Keep every legacy value, including both T71 clawback kinds.
alter table public.credit_ledger
  drop constraint credit_ledger_kind_check,
  add constraint credit_ledger_kind_check check (kind in
    ('grant','reserve','refund','purchase','admin_adjust','clawback','clawback_restore','code_grant','invite_reward'));

-- Counting the inviter's own ledger survives deletion of the invited account.
create index credit_ledger_invite_rewards_idx on public.credit_ledger(user_id, created_at)
  where kind = 'invite_reward';
