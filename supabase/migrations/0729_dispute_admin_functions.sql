-- T82 (ARCHITECTURE §6.3 「后台拒付页」): the functions around payment_disputes (0725) besides
-- opening one. All service-role only; the admin page re-checks the role before calling.
--
--   mark_dispute_drafted       the webhook staged the evidence on Stripe (submit = false).
--   admin_list_disputes        the list, newest first, (created_at, id) cursor, at most 50.
--   admin_get_dispute          one row for the detail page.
--   admin_mark_dispute_submitted  after Stripe accepted submit = true: once only (DISPUTE_ALREADY_SUBMITTED
--                              the second time), only for disputes we answer, audit row submit_dispute.
--   claim_dispute_reminders    the 「截止前 3 天」 reminder, claimed atomically so two admin page
--                              loads send it once. The page passes the ids Stripe still says need
--                              a response (a dispute answered in the Stripe Dashboard is skipped).

create function public.mark_dispute_drafted(p_dispute_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.payment_disputes
     set evidence_drafted_at = coalesce(evidence_drafted_at, now())
   where stripe_dispute_id = p_dispute_id
  returning true;
$$;

create function public.admin_list_disputes(p_cursor_at timestamptz, p_cursor_id text, p_limit integer)
returns table (
  stripe_dispute_id text, stripe_charge_id text, payment_id bigint, user_id uuid, email text,
  product_id text, amount integer, currency text, reason text, responder text, due_by timestamptz,
  auto_banned_at timestamptz, evidence_drafted_at timestamptz, submitted_at timestamptz,
  reminded_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.stripe_dispute_id, d.stripe_charge_id, d.payment_id, d.user_id, coalesce(nullif(u.email::text, ''), nullif(u.phone::text, '')),
         p.product_id, d.amount, d.currency, d.reason, d.responder, d.due_by,
         d.auto_banned_at, d.evidence_drafted_at, d.submitted_at, d.reminded_at, d.created_at
    from public.payment_disputes d
    left join auth.users u on u.id = d.user_id
    left join public.payments p on p.id = d.payment_id
   where p_cursor_at is null or (d.created_at, d.stripe_dispute_id) < (p_cursor_at, p_cursor_id)
   order by d.created_at desc, d.stripe_dispute_id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

create function public.admin_get_dispute(p_dispute_id text)
returns table (
  stripe_dispute_id text, stripe_charge_id text, payment_id bigint, user_id uuid, email text,
  product_id text, amount integer, currency text, reason text, responder text, due_by timestamptz,
  auto_banned_at timestamptz, evidence_drafted_at timestamptz, submitted_at timestamptz,
  reminded_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.stripe_dispute_id, d.stripe_charge_id, d.payment_id, d.user_id, coalesce(nullif(u.email::text, ''), nullif(u.phone::text, '')),
         p.product_id, d.amount, d.currency, d.reason, d.responder, d.due_by,
         d.auto_banned_at, d.evidence_drafted_at, d.submitted_at, d.reminded_at, d.created_at
    from public.payment_disputes d
    left join auth.users u on u.id = d.user_id
    left join public.payments p on p.id = d.payment_id
   where d.stripe_dispute_id = p_dispute_id;
$$;

create function public.admin_mark_dispute_submitted(p_dispute_id text, p_actor uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payment_disputes;
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id for update;
  if not found then
    raise exception 'DISPUTE_NOT_FOUND';
  end if;
  if v_row.responder <> 'shotviva' then
    raise exception 'DISPUTE_NOT_OURS' using detail = 'Stripe answers Managed Payments disputes';
  end if;
  if v_row.submitted_at is not null then
    raise exception 'DISPUTE_ALREADY_SUBMITTED';
  end if;

  update public.payment_disputes set submitted_at = now(), submitted_by = p_actor
   where stripe_dispute_id = p_dispute_id
  returning * into v_row;

  insert into public.admin_audit_log (action, user_id, reason, target_id)
  values ('submit_dispute', coalesce(v_row.user_id, p_actor), '提交拒付申诉证据 · 操作人 ' || p_actor::text, p_dispute_id);
  return v_row.submitted_at;
end;
$$;

create function public.claim_dispute_reminders(p_dispute_ids text[])
returns setof text
language sql
security definer
set search_path = ''
as $$
  update public.payment_disputes
     set reminded_at = now()
   where stripe_dispute_id = any(p_dispute_ids)
     and responder = 'shotviva'
     and submitted_at is null
     and reminded_at is null
     and due_by is not null
     and due_by <= now() + interval '3 days'
  returning stripe_dispute_id;
$$;

revoke execute on function public.mark_dispute_drafted(text) from public, anon, authenticated;
revoke execute on function public.admin_list_disputes(timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.admin_get_dispute(text) from public, anon, authenticated;
revoke execute on function public.admin_mark_dispute_submitted(text, uuid) from public, anon, authenticated;
revoke execute on function public.claim_dispute_reminders(text[]) from public, anon, authenticated;
grant execute on function public.mark_dispute_drafted(text) to service_role;
grant execute on function public.admin_list_disputes(timestamptz, text, integer) to service_role;
grant execute on function public.admin_get_dispute(text) to service_role;
grant execute on function public.admin_mark_dispute_submitted(text, uuid) to service_role;
grant execute on function public.claim_dispute_reminders(text[]) to service_role;
