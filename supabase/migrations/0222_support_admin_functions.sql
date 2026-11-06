-- T27: the Owner's side of support tickets (ARCHITECTURE §10 「站内工单」). Service role only; the
-- admin pages call these after requireAdmin(). The refund decision itself is in 0223.

-- The Owner answers, and may close in the same step. Closing needs no message; answering does.
-- A reply moves last_message_at past the author's user_seen_at, which is their "new reply" dot.
create function public.admin_reply_ticket(p_ticket_id uuid, p_body text, p_close boolean)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_ticket public.support_tickets;
begin
  if v_body is null and not coalesce(p_close, false) then
    raise exception 'INVALID_INPUT' using detail = 'a reply needs a message';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be at most 2000 characters';
  end if;

  update public.support_tickets
     set status = case when p_close then 'closed' else 'replied' end,
         closed_at = case when p_close then coalesce(closed_at, now()) end,
         last_message_at = case when v_body is null then last_message_at else now() end
   where id = p_ticket_id
  returning * into v_ticket;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  if v_body is not null then
    insert into public.support_ticket_messages (ticket_id, author, body) values (p_ticket_id, 'admin', v_body);
  end if;
  return v_ticket;
end;
$$;

revoke execute on function public.admin_reply_ticket(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_reply_ticket(uuid, text, boolean) to service_role;

-- The admin list, most recently active first, keyset on (last_message_at, id), with the author's
-- email and the start of the first message. Open tickets (the default view) read
-- support_tickets_open_last_message_idx; the branch keeps the literal status = 'open' in the
-- statement so a cached generic plan can still use the partial index. Replied / closed / all are
-- the Owner's occasional look-backs over a small table and scan it.
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
  preview text
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
      select t.id, t.user_id, u.email::text, t.type, t.status, t.payment_id, t.job_id, t.refund_decision,
             t.created_at, t.last_message_at, f.preview
        from public.support_tickets t
        left join auth.users u on u.id = t.user_id
        left join lateral (
          select left(m.body, 140) as preview from public.support_ticket_messages m
           where m.ticket_id = t.id order by m.created_at limit 1
        ) f on true
       where t.status = 'open'
         and (p_type is null or t.type = p_type)
         and (p_cursor_at is null or (t.last_message_at, t.id) < (p_cursor_at, p_cursor_id))
       order by t.last_message_at desc, t.id desc
       limit p_limit;
  else
    return query
      select t.id, t.user_id, u.email::text, t.type, t.status, t.payment_id, t.job_id, t.refund_decision,
             t.created_at, t.last_message_at, f.preview
        from public.support_tickets t
        left join auth.users u on u.id = t.user_id
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

-- The refund policy's three checks, as hints for the Owner (they decide; nothing is automatic),
-- and the suggested amount: price before tax less the 6% fee, plus all of the tax, never more
-- than what is still unrefunded.
--   first_purchase   no earlier payment by this account for the same kind of product
--                    (membership plans vs credit packs); renewals are therefore never first.
--   within_7_days    asked (the ticket's created_at) within 7 days of the payment.
--   no_credits_used  no reserve of any pool, free credits included, since the payment, up to
--                    now: credits used after asking count as well.
-- Indexes: payments primary key and payments_user_id_idx; credit_ledger_user_id_created_at_idx.
create function public.refund_eligibility(p_payment_id bigint, p_asked_at timestamptz)
returns table (first_purchase boolean, within_7_days boolean, no_credits_used boolean, suggested_cents integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  first_purchase := not exists (
    select 1 from public.payments q
     where q.user_id = v_payment.user_id
       and q.id < v_payment.id
       and (q.product_id like 'pack\_%') = (v_payment.product_id like 'pack\_%')
  );
  within_7_days := coalesce(p_asked_at, now()) - v_payment.created_at <= interval '7 days';
  no_credits_used := not exists (
    select 1 from public.credit_ledger l
     where l.user_id = v_payment.user_id and l.kind = 'reserve' and l.created_at > v_payment.created_at
  );
  suggested_cents := greatest(0, least(
    round((v_payment.amount_total - v_payment.amount_tax) * 0.94)::integer + v_payment.amount_tax,
    v_payment.amount_total - v_payment.amount_refunded
  ));
  return next;
end;
$$;

revoke execute on function public.refund_eligibility(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.refund_eligibility(bigint, timestamptz) to service_role;
