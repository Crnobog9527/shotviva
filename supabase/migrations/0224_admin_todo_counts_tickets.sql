-- T27: the overview 「待处理」 strip counts open support tickets too (ARCHITECTURE §10 「站内工单」).
-- T26's admin_todo_counts (0189) landed first, so T27 merges second and adds the key (control
-- 2026-11-06). The body is 0189's unchanged plus one key; the return shape only grows.
--   open_tickets      support_tickets_open_last_message_idx (0220): the partial index on
--                     status = 'open', the same count as the 工单 nav badge

create or replace function public.admin_todo_counts()
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
        from public.ai_providers where module = 'image' and is_active),
    'open_tickets', (
      select count(*) from public.support_tickets where status = 'open')
  )
$$;

revoke execute on function public.admin_todo_counts() from public, anon, authenticated;
grant execute on function public.admin_todo_counts() to service_role;
