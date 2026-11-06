-- T27: the Owner's refund decision on a refund ticket (ARCHITECTURE §10 「站内工单」). It records
-- the decision, the reply and an audit row in one transaction. It never moves money: the Owner
-- refunds in the Stripe / Waffo dashboard, and record_payment_issue (T10) picks the refund up.
--
-- The audit log's allowed actions are written as the full set the admin cards need, so T25
-- (view_work, replay_checkout) and T27 (decide_refund) give the same constraint whichever
-- migration runs last (control 2026-11-06).

alter table public.admin_audit_log
  drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (
    action in ('ban_user', 'unban_user', 'view_work', 'replay_checkout', 'decide_refund')
  );

-- approved needs an amount from 1 cent up to what is still unrefunded on the payment; rejected
-- takes none. A second decision replaces the first and is audited again, so a typo can be fixed.
-- The ticket stays open for the reply (replied); the Owner closes it once the refund is through.
create function public.admin_decide_refund(
  p_ticket_id uuid,
  p_decision text,
  p_amount_cents integer,
  p_body text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets;
  v_left integer;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_INPUT' using detail = 'decision must be approved or rejected';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'a decision needs a reply of 1 to 2000 characters';
  end if;

  select * into v_ticket from public.support_tickets t where t.id = p_ticket_id for update;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  if v_ticket.type <> 'refund' then
    raise exception 'INVALID_INPUT' using detail = 'not a refund ticket';
  end if;

  select p.amount_total - p.amount_refunded into v_left from public.payments p where p.id = v_ticket.payment_id;
  if p_decision = 'approved' and (p_amount_cents is null or p_amount_cents not between 1 and v_left) then
    raise exception 'INVALID_INPUT' using detail = 'amount must be between 1 and the unrefunded total';
  end if;
  if p_decision = 'rejected' and p_amount_cents is not null then
    raise exception 'INVALID_INPUT' using detail = 'a rejection takes no amount';
  end if;

  update public.support_tickets
     set refund_decision = p_decision,
         refund_amount_cents = p_amount_cents,
         status = 'replied',
         closed_at = null,
         last_message_at = now()
   where id = p_ticket_id
  returning * into v_ticket;

  insert into public.support_ticket_messages (ticket_id, author, body) values (p_ticket_id, 'admin', v_body);

  insert into public.admin_audit_log (action, user_id, reason)
  values (
    'decide_refund',
    v_ticket.user_id,
    format('ticket %s payment %s: %s%s', p_ticket_id, v_ticket.payment_id, p_decision,
           case when p_amount_cents is null then '' else ' ' || p_amount_cents || ' cents' end)
  );
  return v_ticket;
end;
$$;

revoke execute on function public.admin_decide_refund(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_decide_refund(uuid, text, integer, text) to service_role;
