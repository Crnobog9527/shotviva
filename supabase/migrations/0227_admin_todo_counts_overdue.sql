-- T27b: the overview 「待处理」 strip also counts overdue tickets (ARCHITECTURE §6.2 「会员档位权益」,
-- §10): open tickets whose due time, the author's last message + support_reply_hours of their
-- current tier, has passed. Same rule as admin_list_tickets' due_at (0226). The body is 0224's
-- unchanged plus one key; the return shape only grows.
--   overdue_tickets   support_tickets_open_last_message_idx (every open ticket), then per ticket
--                     support_ticket_messages_ticket_id_created_at_idx and current_tier

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
      select count(*) from public.support_tickets where status = 'open'),
    'overdue_tickets', (
      select count(*) from public.support_tickets t
       where t.status = 'open'
         and coalesce(
               (select max(m.created_at) from public.support_ticket_messages m
                 where m.ticket_id = t.id and m.author = 'user'),
               t.created_at)
             + make_interval(hours => public.support_reply_hours(public.current_tier(t.user_id))) < now())
  )
$$;

revoke execute on function public.admin_todo_counts() from public, anon, authenticated;
grant execute on function public.admin_todo_counts() to service_role;
