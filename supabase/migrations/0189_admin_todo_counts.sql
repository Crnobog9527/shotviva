-- T26: the overview 「待处理」 strip (ARCHITECTURE §10). One call, one jsonb, every count over
-- an index. Support tickets (T27) are not on main yet: T27 adds its open count with create or
-- replace (control 2026-11-06).
--   stuck_jobs        generation_jobs_running_created_at_idx (0180): running for > 10 minutes
--   jobs_1h / jobs_24h  generation_jobs_created_at_id_idx: a short range, counted by status
--   pending_requests  template_requests_status_created_at_idx
--   payment_issues    payments_issues_created_at_idx (0188): refunded, partially refunded or
--                     disputed payments made in the last 60 days, the window in which Link
--                     support can refund without us (ARCHITECTURE §6.2) and the Owner may still
--                     need to adjust credits or answer a dispute
--   last_purchase_at  credit_ledger_purchases_created_at_id_idx: one row. Days without one after
--                     launch may mean the webhook is broken
--   provider          ai_providers_one_active_per_module: the provider and model in use

create function public.admin_todo_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'stuck_jobs', (
      select count(*) from public.generation_jobs
       where status = 'running' and created_at < now() - interval '10 minutes'),
    'jobs_1h', (
      select jsonb_build_object('total', count(*), 'failed', count(*) filter (where status = 'failed'))
        from public.generation_jobs where created_at >= now() - interval '1 hour'),
    'jobs_24h', (
      select jsonb_build_object('total', count(*), 'failed', count(*) filter (where status = 'failed'))
        from public.generation_jobs where created_at >= now() - interval '24 hours'),
    'pending_requests', (
      select count(*) from public.template_requests where status = 'pending'),
    'payment_issues', (
      select count(*) from public.payments
       where status <> 'paid' and created_at >= now() - interval '60 days'),
    'last_purchase_at', (
      select created_at from public.credit_ledger
       where kind = 'purchase' order by created_at desc, id desc limit 1),
    'provider', (
      select jsonb_build_object('label', label, 'model', model)
        from public.ai_providers where module = 'image' and is_active)
  )
$$;

revoke execute on function public.admin_todo_counts() from public, anon, authenticated;
grant execute on function public.admin_todo_counts() to service_role;
