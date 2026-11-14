-- T27b: admin_list_tickets returns the author's current tier and the ticket's due time, and the
-- open view (the default) is ordered by it, soonest first (ARCHITECTURE §6.2, §10 「站内工单」).
--   due_at = the author's last message + support_reply_hours(current_tier), so a follow-up
--   restarts the clock and an upgrade shortens it at once.
-- The result columns change, which create or replace cannot do, so the function is dropped and
-- created again with the same arguments (AGENTS §5: a signature change is the one exception).
-- Indexes: the open view reads support_tickets_open_last_message_idx (every open ticket, then
-- sorted by due_at: the open set is small and due_at depends on today's tier, so it is not
-- stored); the last user message is support_ticket_messages_ticket_id_created_at_idx; the tier
-- is current_tier (profiles primary key, credit_ledger_user_id_created_at_idx).
-- Keyset: (due_at, id) ascending for open, (last_message_at, id) descending for the rest.

drop function public.admin_list_tickets(text, text, timestamptz, uuid, integer);

create function public.admin_list_tickets(
  p_status text,
  p_type text,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  type text,
  status text,
  payment_id bigint,
  job_id uuid,
  refund_decision text,
  created_at timestamptz,
  last_message_at timestamptz,
  preview text,
  tier text,
  due_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_status is not null and p_status not in ('open', 'replied', 'closed') then
    raise exception 'INVALID_INPUT' using detail = 'unknown status';
  end if;
  if p_type is not null and p_type not in ('feedback', 'image_issue', 'billing', 'refund', 'account', 'other') then
    raise exception 'INVALID_INPUT' using detail = 'unknown ticket type';
  end if;
  if p_limit is null or p_limit not between 1 and 101 then
    raise exception 'INVALID_INPUT' using detail = 'p_limit must be between 1 and 101';
  end if;

  if p_status = 'open' then
    return query
      with open_rows as (
        select t.id, t.user_id, t.type, t.status, t.payment_id, t.job_id, t.refund_decision,
               t.created_at, t.last_message_at, d.tier,
               coalesce(d.last_user_at, t.created_at) + make_interval(hours => public.support_reply_hours(d.tier)) as due_at
          from public.support_tickets t
          cross join lateral (
            select public.current_tier(t.user_id) as tier,
                   (select max(m.created_at) from public.support_ticket_messages m
                     where m.ticket_id = t.id and m.author = 'user') as last_user_at
          ) d
         where t.status = 'open'
           and (p_type is null or t.type = p_type)
      )
      select r.id, r.user_id, u.email::text, r.type, r.status, r.payment_id, r.job_id, r.refund_decision,
             r.created_at, r.last_message_at, f.preview, r.tier, r.due_at
        from open_rows r
        left join auth.users u on u.id = r.user_id
        left join lateral (
          select left(m.body, 140) as preview from public.support_ticket_messages m
           where m.ticket_id = r.id order by m.created_at limit 1
        ) f on true
       where p_cursor_at is null or (r.due_at, r.id) > (p_cursor_at, p_cursor_id)
       order by r.due_at, r.id
       limit p_limit;
  else
    return query
      select t.id, t.user_id, u.email::text, t.type, t.status, t.payment_id, t.job_id, t.refund_decision,
             t.created_at, t.last_message_at, f.preview, d.tier,
             coalesce(d.last_user_at, t.created_at) + make_interval(hours => public.support_reply_hours(d.tier))
        from public.support_tickets t
        left join auth.users u on u.id = t.user_id
        cross join lateral (
          select public.current_tier(t.user_id) as tier,
                 (select max(m.created_at) from public.support_ticket_messages m
                   where m.ticket_id = t.id and m.author = 'user') as last_user_at
        ) d
        left join lateral (
          select left(m.body, 140) as preview from public.support_ticket_messages m
           where m.ticket_id = t.id order by m.created_at limit 1
        ) f on true
       where (p_status is null or t.status = p_status)
         and (p_type is null or t.type = p_type)
         and (p_cursor_at is null or (t.last_message_at, t.id) < (p_cursor_at, p_cursor_id))
       order by t.last_message_at desc, t.id desc
       limit p_limit;
  end if;
end;
$$;

revoke execute on function public.admin_list_tickets(text, text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_list_tickets(text, text, timestamptz, uuid, integer) to service_role;
