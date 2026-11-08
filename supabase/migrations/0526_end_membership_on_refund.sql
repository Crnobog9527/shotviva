-- T71 (ARCHITECTURE §6.2 「会员退款」): a refunded membership ends at once. paid_until moves to
-- the refund time, but never before what the user's other still-valid membership payments cover.
--
-- Those are replayed in order from the ledger, the same way they were granted: a purchase adds
-- its days from greatest(the running end, its own time); a renewal is aligned to its period end,
-- which its paid_until_after holds (capped at its own time + days + 3, so days an earlier, now
-- refunded purchase stacked on top are not carried over). A grant whose payment row is refunded,
-- partially refunded or disputed no longer counts; grants older than the payments table (T10)
-- have no row and still count. The result never moves paid_until later, so replays and a refund
-- after a newer purchase are harmless. Internal: called by the refund functions only.
create or replace function public._end_membership_after_refund(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_end timestamptz;
  r record;
begin
  select paid_until into v_current from public.profiles where id = p_user_id for update;
  if v_current is null or v_current <= now() then
    return v_current;
  end if;

  for r in
    select l.idempotency_key, l.created_at, l.paid_until_after, pr.days
      from public.credit_ledger l
      join public.products pr on pr.id = l.product_id
     where l.user_id = p_user_id
       and l.pool = 'paid'
       and l.kind = 'purchase'
       and l.delta > 0
       and pr.days is not null
       and not exists (
         select 1 from public.payments p
          where p.user_id = p_user_id
            and p.status <> 'paid'
            and l.idempotency_key in ('purchase:' || p.stripe_session_id, 'renewal:' || p.stripe_invoice_id, 'purchase:' || p.waffo_payment_id)
       )
     order by l.created_at, l.id
  loop
    if r.idempotency_key like 'renewal:%' then
      v_end := greatest(v_end, least(r.paid_until_after, r.created_at + make_interval(days => r.days + 3)));
    else
      v_end := greatest(v_end, r.created_at) + make_interval(days => r.days);
    end if;
  end loop;

  v_end := least(v_current, greatest(now(), coalesce(v_end, now())));
  if v_end < v_current then
    update public.profiles set paid_until = v_end where id = p_user_id;
  end if;
  return v_end;
end;
$$;

revoke execute on function public._end_membership_after_refund(uuid) from public, anon, authenticated, service_role;
