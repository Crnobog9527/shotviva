-- T26: the overview to-do count of refunded / disputed payments (admin_todo_counts, 0189).
-- Partial, so it only holds the few payments that are not plainly 'paid'.

create index payments_issues_created_at_idx on public.payments (created_at) where status <> 'paid';
