-- F4 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费 · 对账): the reconciliation job (/api/cron/payment-fees)
-- turns each payment's estimated fees into the providers' final figures. Fee lines are still only
-- written by payment_fee_record (1703); this migration adds what the job remembers between runs
-- and the reads it needs, all service-role only and inert while payment_fee_settings.record_from
-- is unset.
--
--   * payment_fee_reconcile_state: per payment, when it was last looked at, when to look again,
--     the last error, and which Owner alerts were already sent (each one once).
--   * payment_fee_stripe_batches / _items: Stripe's unattributed `stripe_fee` balance
--     transactions (Managed Payments 3.5%, Billing 0.7%, Radar), each matched once to the
--     payments it covers; a payment belongs to at most one batch per fee kind.

create table public.payment_fee_reconcile_state (
  payment_id bigint primary key references public.payments(id) on delete cascade,
  attempts integer not null default 0 check (attempts >= 0),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 300),
  -- Alert keys already sent for this payment ('unreconciled', 'mismatch:charge', 'mismatch:REF_…').
  alerted text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index payment_fee_reconcile_state_next_idx on public.payment_fee_reconcile_state (next_check_at);
alter table public.payment_fee_reconcile_state enable row level security;
revoke all on public.payment_fee_reconcile_state from public,anon,authenticated,service_role;
grant select on public.payment_fee_reconcile_state to service_role;

create table public.payment_fee_stripe_batches (
  txn_id text primary key check (txn_id ~ '^txn_[A-Za-z0-9]+$'),
  -- other: a stripe_fee entry that is none of the three (shown to the Owner once, never allocated).
  kind text not null check (kind in ('mp','billing','radar','other')),
  amount_cents integer not null check (amount_cents >= 0),
  booked_at timestamptz not null,
  -- The UTC day in the description (`Managed Payments Transaction Fee (2026-11-10)`), else booked_at's.
  label_date date not null,
  description text check (description is null or length(description) <= 300),
  -- allocated: shared out to its items; mismatch: no set of payments explains it (alerted, the
  -- payments keep their estimate); ignored: not a per-order fee (or an unknown one, alerted).
  status text not null check (status in ('allocated','mismatch','ignored')),
  formula_cents integer check (formula_cents >= 0),
  payment_count integer not null default 0 check (payment_count >= 0),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.payment_fee_stripe_batches enable row level security;
revoke all on public.payment_fee_stripe_batches from public,anon,authenticated,service_role;
grant select on public.payment_fee_stripe_batches to service_role;

create table public.payment_fee_stripe_batch_items (
  txn_id text not null references public.payment_fee_stripe_batches(txn_id) on delete cascade,
  payment_id bigint not null references public.payments(id) on delete cascade,
  kind text not null check (kind in ('mp','billing','radar')),
  basis_cents integer not null check (basis_cents >= 0),
  share_cents integer not null check (share_cents >= 0),
  primary key (txn_id, payment_id),
  constraint payment_fee_stripe_batch_items_once unique (payment_id, kind)
);
alter table public.payment_fee_stripe_batch_items enable row level security;
revoke all on public.payment_fee_stripe_batch_items from public,anon,authenticated,service_role;
grant select on public.payment_fee_stripe_batch_items to service_role;

-- What the job needs to know about one payment: its references, its current fee lines grouped by
-- scope (charge = refund_id null, then one per refund), its Waffo refunds, and what was alerted.
create function public._payment_fee_reconcile_view(p public.payments) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'payment_id', p.id, 'channel', p.channel, 'method', p.method, 'currency', p.currency,
    'product_id', p.product_id, 'amount_total', p.amount_total, 'created_at', p.created_at,
    'fee_status', p.fee_status, 'fee_cents', p.fee_cents,
    'stripe_session_id', p.stripe_session_id, 'stripe_invoice_id', p.stripe_invoice_id,
    'stripe_charge_id', p.stripe_charge_id, 'waffo_payment_id', p.waffo_payment_id,
    'scopes', coalesce((
      select jsonb_agg(jsonb_build_object('refund_id', s.refund_id, 'revision', s.revision, 'lines', s.lines)
                       order by s.refund_id nulls first)
        from (select l.refund_id, max(l.revision) as revision,
                     jsonb_agg(jsonb_build_object('kind', l.kind, 'source', l.source, 'status', l.status,
                       'amount_cents', l.amount_cents, 'schedule_id', l.schedule_id, 'source_ref', l.source_ref,
                       'note', l.note) order by l.line_no) as lines
                from public.payment_fee_lines_current(p.id) l
               group by l.refund_id) s), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object('refund_ref', r.refund_ref, 'amount', r.amount, 'created_at', r.created_at)
                       order by r.created_at, r.refund_ref)
        from public.payment_refunds r where r.payment_id = p.id), '[]'::jsonb),
    'alerted', coalesce((select to_jsonb(s.alerted) from public.payment_fee_reconcile_state s where s.payment_id = p.id), '[]'::jsonb));
$$;
revoke all on function public._payment_fee_reconcile_view(public.payments) from public,anon,authenticated,service_role;

-- Payments of the fee era (created at/after record_from, at most 60 days ago) whose fees are not
-- final yet, or that have a Waffo refund without a final fee, and are due for a look; those never
-- looked at first, then the longest unseen. {live: false} while record_from is unset.
create function public.payment_fee_reconcile_due(p_now timestamptz, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_from timestamptz;
begin
  if p_now is null or p_limit is null or p_limit not between 1 and 200 then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_reconcile_due: now and a limit of 1-200';
  end if;
  select record_from into v_from from public.payment_fee_settings where singleton;
  if v_from is null then return jsonb_build_object('live', false, 'payments', '[]'::jsonb); end if;
  return jsonb_build_object('live', true, 'record_from', v_from, 'payments', coalesce((
    select jsonb_agg(public._payment_fee_reconcile_view(d.p) order by d.seen nulls first, (d.p).created_at, (d.p).id)
      from (select p, s.last_checked_at as seen
              from public.payments p
              left join public.payment_fee_reconcile_state s on s.payment_id = p.id
             where p.created_at >= v_from and p.created_at >= p_now - interval '60 days'
               and (s.next_check_at is null or s.next_check_at <= p_now)
               and (p.fee_status is distinct from 'final'
                    or (p.channel = 'waffo' and exists(
                          select from public.payment_refunds r
                           where r.payment_id = p.id
                             and not exists(select from public.payment_fee_lines_current(p.id) l
                                             where l.refund_id = r.refund_ref and l.status = 'final'))))
             order by s.last_checked_at nulls first, p.created_at, p.id
             limit p_limit) d), '[]'::jsonb));
end;
$$;
revoke all on function public.payment_fee_reconcile_due(timestamptz,integer) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_reconcile_due(timestamptz,integer) to service_role;

-- One payment, same shape: the job rereads it after a PAYMENT_FEE_REVISION_CONFLICT.
create function public.payment_fee_reconcile_payment(p_payment_id bigint) returns jsonb
language sql stable security definer set search_path='' as $$
  select public._payment_fee_reconcile_view(p) from public.payments p where p.id = p_payment_id;
$$;
revoke all on function public.payment_fee_reconcile_payment(bigint) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_reconcile_payment(bigint) to service_role;

-- After a look: when to look again, the error (ids and codes only), and the alert keys this look
-- raised. Returns the keys that had not been alerted before, so each alert is sent once.
create function public.payment_fee_reconcile_mark(p_payment_id bigint, p_next timestamptz, p_error text, p_alerts text[])
returns text[] language plpgsql security definer set search_path='' as $$
declare
  v_old text[];
  v_new text[];
begin
  if p_payment_id is null or p_next is null then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_reconcile_mark: payment and next check';
  end if;
  insert into public.payment_fee_reconcile_state (payment_id) values (p_payment_id) on conflict do nothing;
  select alerted into v_old from public.payment_fee_reconcile_state where payment_id = p_payment_id for update;
  select coalesce(array_agg(distinct a order by a), '{}') into v_new
    from unnest(coalesce(p_alerts, '{}')) a where a is not null and length(a) <= 200 and not (a = any(v_old));
  update public.payment_fee_reconcile_state
     set attempts = attempts + 1, last_checked_at = now(), next_check_at = p_next,
         last_error = left(nullif(p_error, ''), 300), alerted = v_old || v_new, updated_at = now()
   where payment_id = p_payment_id;
  return v_new;
end;
$$;
revoke all on function public.payment_fee_reconcile_mark(bigint,timestamptz,text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_reconcile_mark(bigint,timestamptz,text,text[]) to service_role;

-- Which of these Stripe balance transactions were already recorded.
create function public.payment_fee_stripe_batches_known(p_ids text[]) returns text[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(b.txn_id order by b.txn_id), '{}') from public.payment_fee_stripe_batches b
   where b.txn_id = any(coalesce(p_ids, '{}'));
$$;
revoke all on function public.payment_fee_stripe_batches_known(text[]) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_stripe_batches_known(text[]) to service_role;

-- The Stripe payments a batch of p_kind booked at p_before for UTC day p_day may cover, oldest
-- first: created that day, no later than the batch, not in another batch of that kind, and of
-- that kind — a Managed Payments card (mp), a subscription invoice (billing) or a non-MP charge
-- (radar), judged by its fee lines when it has some, else by method / product. Payments from
-- before record_from are included (they are in Stripe's total too) and marked not recordable.
create function public.payment_fee_stripe_batch_candidates(p_kind text, p_day date, p_before timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_from timestamptz;
begin
  if p_kind is null or p_kind not in ('mp','billing','radar') or p_day is null or p_before is null then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_stripe_batch_candidates';
  end if;
  select record_from into v_from from public.payment_fee_settings where singleton;
  return coalesce((
    select jsonb_agg(jsonb_build_object('payment_id', p.id, 'created_at', p.created_at, 'amount_total', p.amount_total,
        'currency', p.currency, 'recordable', v_from is not null and p.created_at >= v_from) order by p.created_at, p.id)
      from public.payments p
     where p.channel = 'stripe'
       and p.created_at >= p_day::timestamp at time zone 'UTC' and p.created_at < (p_day + 1)::timestamp at time zone 'UTC'
       and p.created_at <= p_before
       and not exists(select from public.payment_fee_stripe_batch_items i where i.payment_id = p.id and i.kind = p_kind)
       and case when exists(select from public.payment_fee_lines l where l.payment_id = p.id and l.refund_id is null)
                then exists(select from public.payment_fee_lines_current(p.id) l where l.refund_id is null and l.kind = p_kind)
                else case p_kind when 'mp' then p.method = 'card'
                                 when 'radar' then p.method <> 'card'
                                 else p.product_id not like 'pack\_%' end
           end), '[]'::jsonb);
end;
$$;
revoke all on function public.payment_fee_stripe_batch_candidates(text,date,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_stripe_batch_candidates(text,date,timestamptz) to service_role;

-- Records one Stripe batch and, when allocated, the share each payment carries. Once per txn
-- ({applied:false, reason:'replayed'}); a payment already in another batch of the kind is refused
-- (PAYMENT_FEE_BATCH_TAKEN) so nothing is charged twice. Managed Payments and Billing shares add
-- up to the batch exactly; Radar shares (5¢ per screened order) may be less — the rest is failed
-- attempts, which the platform bears.
create function public.payment_fee_stripe_batch_record(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_txn text := p_input->>'txn_id';
  v_kind text := p_input->>'kind';
  v_status text := p_input->>'status';
  v_amount bigint := (p_input->>'amount_cents')::bigint;
  v_items jsonb := coalesce(p_input->'items', '[]'::jsonb);
  v_sum bigint;
  v_count integer;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or v_txn is null or v_kind is null or v_status is null
     or v_amount is null or v_amount < 0 or jsonb_typeof(v_items) <> 'array'
     or (v_status = 'allocated') <> (jsonb_array_length(v_items) > 0)
     or (v_kind = 'other' and v_status <> 'ignored') then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_stripe_batch_record: bad input';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payment_fee_stripe_batch', 0));
  if exists(select from public.payment_fee_stripe_batches where txn_id = v_txn) then
    return jsonb_build_object('applied', false, 'reason', 'replayed');
  end if;
  select coalesce(sum((e->>'share_cents')::bigint), 0), count(*) into v_sum, v_count from jsonb_array_elements(v_items) e;
  if v_status = 'allocated' and ((v_kind in ('mp','billing') and v_sum <> v_amount) or v_sum > v_amount) then
    raise exception 'INVALID_INPUT' using detail = 'payment_fee_stripe_batch_record: shares do not add up';
  end if;
  insert into public.payment_fee_stripe_batches (txn_id, kind, amount_cents, booked_at, label_date, description, status,
      formula_cents, payment_count, note)
    values (v_txn, v_kind, v_amount, (p_input->>'booked_at')::timestamptz, (p_input->>'label_date')::date,
      left(p_input->>'description', 300), v_status, (p_input->>'formula_cents')::integer, v_count, left(p_input->>'note', 300));
  begin
    insert into public.payment_fee_stripe_batch_items (txn_id, payment_id, kind, basis_cents, share_cents)
      select v_txn, (e->>'payment_id')::bigint, v_kind, (e->>'basis_cents')::integer, (e->>'share_cents')::integer
        from jsonb_array_elements(v_items) e;
  exception when unique_violation then
    raise exception 'PAYMENT_FEE_BATCH_TAKEN' using detail = v_txn;
  end;
  return jsonb_build_object('applied', true);
end;
$$;
revoke all on function public.payment_fee_stripe_batch_record(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_stripe_batch_record(jsonb) to service_role;

-- Allocated shares not yet carried by their payment's current fee lines (written in a later step,
-- or undone by a late webhook write): each with the payment's view, so the job writes the share.
create function public.payment_fee_stripe_batch_pending(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_from timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'INVALID_INPUT'; end if;
  select record_from into v_from from public.payment_fee_settings where singleton;
  if v_from is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('txn_id', x.txn_id, 'kind', x.kind, 'share_cents', x.share_cents,
        'payment', public._payment_fee_reconcile_view(x.p)))
      from (select i.txn_id, i.kind, i.share_cents, p
              from public.payment_fee_stripe_batch_items i
              join public.payment_fee_stripe_batches b on b.txn_id = i.txn_id and b.status = 'allocated'
              join public.payments p on p.id = i.payment_id
             where p.created_at >= v_from
               and exists(select from public.payment_fee_lines l where l.payment_id = p.id and l.refund_id is null)
               and not exists(select from public.payment_fee_lines_current(p.id) l
                               where l.refund_id is null and l.kind = i.kind and l.status = 'final' and l.source_ref = i.txn_id)
             order by b.booked_at, i.payment_id
             limit p_limit) x), '[]'::jsonb);
end;
$$;
revoke all on function public.payment_fee_stripe_batch_pending(integer) from public,anon,authenticated,service_role;
grant execute on function public.payment_fee_stripe_batch_pending(integer) to service_role;
