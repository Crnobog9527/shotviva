-- 「标记已知晓」 (ARCHITECTURE §10, columns of 1881). admin_attention_payment_ids is the one
-- definition of what the overview counter 「退款和争议（60 天内）」 counts, and what the orders page
-- lists behind ?attention=1: payments not plainly 'paid', created in the last 60 days, that either
-- have no mark for their current state or still have an open dispute. An open dispute keeps
-- counting even when marked: it needs evidence before its due date, so a mark must not hide it;
-- the orders page shows the mark next to it and it leaves the counter when the dispute closes.
--
-- admin_acknowledge_payment / admin_unacknowledge_payment only write the four acknowledged_*
-- columns and an audit row. They never touch status, amounts, credits or the ledger. p_actor is
-- the signed-in admin passed by the server (service role has no auth.uid(), as 0771). A repeat of
-- the same call changes nothing and writes no second audit row.

create or replace function public.admin_attention_payment_ids()
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  -- payments_issues_created_at_idx (0188) for the window; affiliate_disputes_payment_idx for disputes.
  select coalesce(array_agg(p.id order by p.created_at desc, p.id desc), '{}')
    from public.payments p
   where p.status <> 'paid'
     and p.created_at >= now() - interval '60 days'
     and (p.acknowledged_at is null
          or p.acknowledged_status <> p.status
          or p.acknowledged_refunded <> p.amount_refunded
          or exists (select from public.payment_disputes d where d.payment_id = p.id and d.closed_at is null))
$$;

revoke execute on function public.admin_attention_payment_ids() from public, anon, authenticated;
grant execute on function public.admin_attention_payment_ids() to service_role;

create or replace function public.admin_acknowledge_payment(p_payment_id bigint, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_changed boolean := false;
begin
  perform public._org_require_admin(p_actor);
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.status = 'paid' then
    raise exception 'PAYMENT_NOT_FLAGGED';
  end if;

  if v_payment.acknowledged_at is null
     or v_payment.acknowledged_status <> v_payment.status
     or v_payment.acknowledged_refunded <> v_payment.amount_refunded then
    update public.payments
       set acknowledged_at = now(), acknowledged_by = p_actor,
           acknowledged_status = status, acknowledged_refunded = amount_refunded
     where id = p_payment_id
    returning * into v_payment;
    insert into public.admin_audit_log (action, user_id, reason, target_id)
    values ('payment_acknowledge', v_payment.user_id,
            '标记已知晓 · ' || v_payment.status || ' · 已退 ' || v_payment.amount_refunded || ' · 操作人 ' || p_actor::text,
            p_payment_id::text);
    v_changed := true;
  end if;

  return jsonb_build_object('changed', v_changed, 'acknowledged_at', v_payment.acknowledged_at);
end;
$$;

revoke execute on function public.admin_acknowledge_payment(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_acknowledge_payment(bigint, uuid) to service_role;

create or replace function public.admin_unacknowledge_payment(p_payment_id bigint, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_changed boolean := false;
begin
  perform public._org_require_admin(p_actor);
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.acknowledged_at is not null then
    update public.payments
       set acknowledged_at = null, acknowledged_by = null, acknowledged_status = null, acknowledged_refunded = null
     where id = p_payment_id
    returning * into v_payment;
    insert into public.admin_audit_log (action, user_id, reason, target_id)
    values ('payment_unacknowledge', v_payment.user_id, '撤销已知晓 · 操作人 ' || p_actor::text, p_payment_id::text);
    v_changed := true;
  end if;

  return jsonb_build_object('changed', v_changed, 'acknowledged_at', v_payment.acknowledged_at);
end;
$$;

revoke execute on function public.admin_unacknowledge_payment(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_unacknowledge_payment(bigint, uuid) to service_role;

-- As 0914, with payment_issues now counting admin_attention_payment_ids (was: every payment not
-- 'paid' in 60 days). The key and its type are unchanged, so the overview before this deploy
-- reads it as before.
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
    'unresolved_dispute_links', (
      select count(*) from public.payment_dispute_link_errors where resolved_at is null),
    'payment_issues', cardinality(public.admin_attention_payment_ids()),
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
