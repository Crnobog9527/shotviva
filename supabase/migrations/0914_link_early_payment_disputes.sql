-- Pair an early Stripe dispute with the purchase that grants the credits (T82/T71).
create index payment_disputes_unlinked_charge_idx on public.payment_disputes (stripe_charge_id)
  where payment_id is null;

create table public.payment_dispute_link_errors (
  payment_id bigint primary key references public.payments(id) on delete cascade,
  error_code text not null,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index payment_dispute_link_errors_open_idx on public.payment_dispute_link_errors(payment_id)
  where resolved_at is null;
alter table public.payment_dispute_link_errors enable row level security;
revoke all on public.payment_dispute_link_errors from public, anon, authenticated, service_role;
grant select on public.payment_dispute_link_errors to service_role;

-- If the two transactions overlap, neither might have seen the other's insert.
-- Take the same transaction lock on both sides and re-read after the winner commits.
-- A match here flows through open_payment_dispute's original INSERT RETURNING path.
create function public._match_dispute_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.stripe_charge_id, 914));
  select p.id, p.user_id into new.payment_id, new.user_id from public.payments p
   where p.stripe_charge_id = new.stripe_charge_id for update;
  return new;
end;
$$;
create trigger match_unlinked_dispute before insert on public.payment_disputes
  for each row when (new.payment_id is null) execute function public._match_dispute_before_insert();

-- The existing T95 update trigger watches the close fields. A newly linked dispute
-- also needs its existing calculation when payment.status was already 'disputed'.
create trigger affiliate_dispute_link after update of payment_id on public.payment_disputes
  for each row when (old.payment_id is null and new.payment_id is not null and old.closed_at is not distinct from new.closed_at)
  execute function public._affiliate_payment_event();

create function public._link_early_payment_disputes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d public.payment_disputes;
  claw jsonb;
  closed_rows public.payment_disputes[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtextextended(new.stripe_charge_id, 914));
  for d in select * from public.payment_disputes
            where stripe_charge_id = new.stripe_charge_id and payment_id is null
            order by created_at, stripe_dispute_id for update
  loop
    -- Replay the open and (if present) close within this subtransaction. T71
    -- applies closing effects only on the first transition from an open row.
    update public.payment_disputes set payment_id = new.id, user_id = new.user_id,
                                      closed_at = null, closed_status = null
     where stripe_dispute_id = d.stripe_dispute_id;
    update public.payments set status = 'disputed' where id = new.id and status <> 'disputed';
    claw := public.clawback_payment_credits(new.id, 'dispute:' || d.stripe_dispute_id, '拒付扣回 ' || d.stripe_dispute_id);
    update public.payment_disputes set credits_clawed_back = (claw ->> 'taken')::integer,
                                      clawback_shortfall = (claw ->> 'written_off')::integer
     where stripe_dispute_id = d.stripe_dispute_id;
    if d.closed_at is not null then
      closed_rows := array_append(closed_rows, d);
    end if;
  end loop;
  -- An unrelated charge or a payment with no early dispute resolves nothing.
  if not found then return null; end if;
  -- Attach every case before closing any: T71 transfers the held share to a
  -- sibling open case and restores it only when the last eligible case closes.
  for d in select * from unnest(closed_rows) order by closed_at, stripe_dispute_id loop
    perform public.close_payment_dispute(d.stripe_dispute_id, d.closed_status);
    update public.payment_disputes set closed_at = d.closed_at where stripe_dispute_id = d.stripe_dispute_id;
  end loop;
  update public.payment_dispute_link_errors set resolved_at = now()
   where payment_id = new.id and resolved_at is null;
  return null;
exception when others or query_canceled or assert_failure then
  -- The subtransaction rolls back the link, debit and related commission changes together.
  begin
    insert into public.payment_dispute_link_errors(payment_id, error_code) values (new.id, sqlstate)
      on conflict (payment_id) do update set error_code = excluded.error_code, occurred_at = now(), resolved_at = null;
  exception when others or query_canceled or assert_failure then
    return null;
  end;
  return null;
end;
$$;
create trigger link_disputes_payment_insert after insert on public.payments
  for each row when (new.stripe_charge_id is not null) execute function public._link_early_payment_disputes();
create trigger link_disputes_payment_charge after update of stripe_charge_id on public.payments
  for each row when (old.stripe_charge_id is null and new.stripe_charge_id is not null)
  execute function public._link_early_payment_disputes();

revoke all on function public._match_dispute_before_insert() from public, anon, authenticated, service_role;
revoke all on function public._link_early_payment_disputes() from public, anon, authenticated, service_role;

-- T71 0769 with one change to lock acquisition for an initially unlinked dispute.
create or replace function public.close_payment_dispute(p_dispute_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payment_disputes;
  v_open public.payment_disputes;
  v_payment public.payments;
  v_first boolean := false;
  v_superseded boolean := false;
  v_kept boolean := p_status in ('won', 'warning_closed');
  v_key text := 'clawback_restore:' || p_dispute_id;
begin
  if p_dispute_id is null or p_status is null or p_status !~ '^[a-z_]{1,40}$' then
    raise exception 'INVALID_INPUT' using detail = 'dispute id and status are required';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if not found then
    return null;
  end if;
  if v_row.payment_id is null then
    -- A purchase can now attach this orphan while close is running. Re-read
    -- after its charge lock before choosing the payment to lock and restore.
    perform pg_advisory_xact_lock(hashtextextended(v_row.stripe_charge_id, 914));
    select * into strict v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  end if;
  if v_row.payment_id is not null then
    select * into v_payment from public.payments where id = v_row.payment_id for update;
  end if;
  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id for update;

  if v_row.closed_at is null then
    v_first := true;
    update public.payment_disputes set closed_status = p_status, closed_at = now()
     where stripe_dispute_id = p_dispute_id
    returning * into v_row;

    if v_row.payment_id is not null then
      select * into v_open from public.payment_disputes
       where payment_id = v_row.payment_id and closed_at is null
       order by created_at desc, stripe_dispute_id desc
       limit 1
       for update;
      if found then
        v_superseded := true;
        if v_kept then
          update public.payment_disputes
             set credits_clawed_back = credits_clawed_back + v_row.credits_clawed_back,
                 clawback_shortfall = clawback_shortfall + v_row.clawback_shortfall
           where stripe_dispute_id = v_open.stripe_dispute_id;
          update public.payment_disputes set credits_clawed_back = 0, clawback_shortfall = 0
           where stripe_dispute_id = p_dispute_id
          returning * into v_row;
        end if;
      elsif v_kept and not exists (
        select 1 from public.payment_disputes d
         where d.payment_id = v_row.payment_id
           and d.stripe_dispute_id <> p_dispute_id
           and d.closed_status not in ('won', 'warning_closed')
      ) then
        if v_row.credits_clawed_back > 0
           and (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback_restore', v_row.credits_clawed_back,
                  '拒付胜诉还回 ' || p_dispute_id, v_key)).applied then
          update public.credit_ledger set payment_id = v_payment.id where idempotency_key = v_key;
        end if;
        update public.payments
           set credits_clawed_back = greatest(0, credits_clawed_back - v_row.credits_clawed_back),
               clawback_shortfall = greatest(0, clawback_shortfall - v_row.clawback_shortfall),
               status = case
                 when status <> 'disputed' then status
                 when amount_total > 0 and amount_refunded >= amount_total then 'refunded'
                 when amount_refunded > 0 then 'partially_refunded'
                 else 'paid'
               end
         where id = v_payment.id;
        update public.payment_disputes set credits_restored = v_row.credits_clawed_back
         where stripe_dispute_id = p_dispute_id
        returning * into v_row;
        perform public.clawback_payment_credits(v_payment.id, 'dispute_closed:' || p_dispute_id, '退款扣回 ' || p_dispute_id);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'first_close', v_first,
    -- Another dispute on the payment is still open and now decides (the Owner hears when it closes).
    'superseded', v_superseded,
    'kept', v_row.closed_status in ('won', 'warning_closed'),
    'closed_status', v_row.closed_status,
    'credits_restored', v_row.credits_restored,
    'user_id', v_row.user_id,
    'payment_id', v_row.payment_id,
    'product_id', v_payment.product_id,
    'amount', v_row.amount,
    'currency', v_row.currency
  );
end;
$$;

-- Extend the existing service-only overview RPC (0227) in the same round trip.
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
