-- T10 follow-up: the admin orders page lists payments newest first, keyset on (created_at, id)
-- (AGENTS §5.1 rules 3 and 4). This is that query's index.
create index payments_created_at_id_idx on public.payments (created_at desc, id desc);
