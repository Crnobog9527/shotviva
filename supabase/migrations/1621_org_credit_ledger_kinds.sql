-- Widen only: keep every existing kind and add the three org transfers (ARCHITECTURE §6.5).
-- org_allocate / org_reclaim move credits between an org pool and a member's paid pool;
-- org_deposit is the owner putting their own paid credits into the pool.
alter table public.credit_ledger
  drop constraint credit_ledger_kind_check,
  add constraint credit_ledger_kind_check check (kind in
    ('grant','reserve','refund','purchase','admin_adjust','clawback','clawback_restore','code_grant','invite_reward',
     'org_allocate','org_reclaim','org_deposit'));
