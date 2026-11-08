-- T87: 「生成其他语言版本」 of a cover runs as an admin test run (ARCHITECTURE §8.3, §10.b): same
-- records, real cost, spend ledger and daily budget. Its kind is 'translate' (no parent run, no
-- test photo; the source cover and target language are in inputs). Widens the kind check only:
-- every existing row still passes, and code deployed before this migration never writes it.

alter table public.admin_test_runs drop constraint admin_test_runs_kind_check;
alter table public.admin_test_runs
  add constraint admin_test_runs_kind_check check (kind in ('generate', 'edit', 'translate'));
