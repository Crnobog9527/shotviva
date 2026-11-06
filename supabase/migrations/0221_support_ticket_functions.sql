-- T27: what users do with support tickets (ARCHITECTURE §10 「站内工单」). Service role only: the
-- server actions call these after the session check. Each is one round trip (AGENTS §5.1 rule 1).

-- A new ticket with its first message. The payment (billing, refund) and the work (image issue)
-- must be the author's own; a refund request must name a payment. Per-account limit: at most 5
-- tickets per 24 hours, counted on support_tickets_user_id_created_at_idx under a profile lock so
-- parallel submits cannot slip past it. Banned accounts can still write (an appeal is a ticket).
create function public.create_support_ticket(
  p_user_id uuid,
  p_type text,
  p_body text,
  p_payment_id bigint,
  p_job_id uuid
)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if p_type is null or p_type not in ('feedback', 'image_issue', 'billing', 'refund', 'account', 'other') then
    raise exception 'INVALID_INPUT' using detail = 'unknown ticket type';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be 1 to 2000 characters';
  end if;
  if p_type = 'refund' and p_payment_id is null then
    raise exception 'INVALID_INPUT' using detail = 'a refund request needs a payment';
  end if;
  if p_payment_id is not null and p_type not in ('billing', 'refund') then
    raise exception 'INVALID_INPUT' using detail = 'only billing and refund tickets take a payment';
  end if;
  if p_job_id is not null and p_type <> 'image_issue' then
    raise exception 'INVALID_INPUT' using detail = 'only image issues take a work';
  end if;

  -- Someone else's id reads the same as a missing one, so nothing leaks about other accounts.
  if p_payment_id is not null and not exists (
    select 1 from public.payments p where p.id = p_payment_id and p.user_id = p_user_id
  ) then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if p_job_id is not null and not exists (
    select 1 from public.generation_jobs j where j.id = p_job_id and j.user_id = p_user_id
  ) then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if (select count(*) from public.support_tickets t
       where t.user_id = p_user_id and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.support_tickets (user_id, type, payment_id, job_id)
  values (p_user_id, p_type, p_payment_id, p_job_id)
  returning * into v_ticket;

  insert into public.support_ticket_messages (ticket_id, author, body)
  values (v_ticket.id, 'user', btrim(p_body));
  return v_ticket;
end;
$$;

revoke execute on function public.create_support_ticket(uuid, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.create_support_ticket(uuid, text, text, bigint, uuid) to service_role;

-- The author adds to their ticket. Any ticket goes back to open, a closed one included, so the
-- Owner sees it again. Writing counts as having seen the thread.
create function public.add_ticket_message(p_ticket_id uuid, p_user_id uuid, p_body text)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.support_ticket_messages;
begin
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be 1 to 2000 characters';
  end if;

  update public.support_tickets
     set status = 'open', closed_at = null, last_message_at = now(), user_seen_at = now()
   where id = p_ticket_id and user_id = p_user_id;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  insert into public.support_ticket_messages (ticket_id, author, body)
  values (p_ticket_id, 'user', btrim(p_body))
  returning * into v_message;
  return v_message;
end;
$$;

revoke execute on function public.add_ticket_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.add_ticket_message(uuid, uuid, text) to service_role;

-- Opening a ticket clears its "new reply" dot. Only writes when there is something unread, so a
-- page view of a read ticket costs no row update.
create function public.mark_ticket_seen(p_ticket_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.support_tickets
     set user_seen_at = now()
   where id = p_ticket_id and user_id = p_user_id and last_message_at > user_seen_at;
$$;

revoke execute on function public.mark_ticket_seen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_ticket_seen(uuid, uuid) to service_role;
