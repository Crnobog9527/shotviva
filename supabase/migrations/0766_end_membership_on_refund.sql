-- T71 (ARCHITECTURE §6.2 「会员退款」): a refunded membership ends at once. paid_until moves to
-- the refund time, but never before what the user's other still-valid membership payments cover.
--
-- _membership_end_without_refunded(user): those payments replayed in order from the ledger, the
-- way apply_purchase / apply_subscription_renewal granted them:
--   - a renewal is aligned to its period end, which its paid_until_after holds (capped at its own
--     time + days + 3, so days an earlier, now refunded purchase stacked on top are not carried);
--   - an upgrade (T66: a higher rank bought while a lower one still runs) ends at greatest(the
--     running end, its own time + days), not stacked;
--   - any other purchase adds its days from greatest(the running end, its own time).
-- A grant whose payment row is refunded, partially refunded or disputed no longer counts; grants
-- older than the payments table (T10) have no row and still count.
--
-- _end_membership_after_refund(user, payment): applies it, never moving paid_until later, and
-- answers whether the membership ended for this refund: paid_until moved back, or the refunded
-- payment itself covers now (its own period, as above, has not run out; true again on a
-- redelivery, so the subscription cancel is retried). Refunding an old renewal
-- whose period is over changes nothing and ends nothing, so the subscription keeps renewing.
-- Internal: called by the refund functions only.
create or replace function public._membership_end_without_refunded(p_user_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ranks constant text[] := array['starter_monthly', 'starter_yearly', 'pro_monthly', 'pro_yearly', 'max_monthly', 'max_yearly'];
  v_end timestamptz;
  v_held text;
  r record;
begin
  for r in
    select l.idempotency_key, l.created_at, l.paid_until_after, l.product_id, pr.days
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
    elsif v_end > r.created_at
          and coalesce(array_position(v_ranks, r.product_id), 0) > coalesce(array_position(v_ranks, v_held), 0) then
      v_end := greatest(v_end, r.created_at + make_interval(days => r.days));
    else
      v_end := greatest(v_end, r.created_at) + make_interval(days => r.days);
    end if;
    v_held := r.product_id;
  end loop;
  return v_end;
end;
$$;

revoke execute on function public._membership_end_without_refunded(uuid) from public, anon, authenticated, service_role;

create or replace function public._end_membership_after_refund(p_user_id uuid, p_payment public.payments)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_end timestamptz;
  v_moved boolean := false;
  v_own record;
begin
  select paid_until into v_current from public.profiles where id = p_user_id for update;
  if v_current > now() then
    v_end := least(v_current, greatest(now(), coalesce(public._membership_end_without_refunded(p_user_id), now())));
    if v_end < v_current then
      update public.profiles set paid_until = v_end where id = p_user_id;
      v_moved := true;
    end if;
  end if;
  if v_moved then
    return true;
  end if;

  -- Not moved back (or already moved by an earlier delivery): still ended if this payment's own
  -- period is the one running now, so a redelivery retries the subscription cancel.
  select l.idempotency_key, l.created_at, l.paid_until_after, pr.days into v_own
    from public.credit_ledger l
    join public.products pr on pr.id = l.product_id
   where l.user_id = p_user_id
     and l.kind = 'purchase'
     and l.idempotency_key in ('purchase:' || p_payment.stripe_session_id, 'renewal:' || p_payment.stripe_invoice_id, 'purchase:' || p_payment.waffo_payment_id);
  if not found or v_own.days is null then
    return false;
  end if;
  return now() < case
    when v_own.idempotency_key like 'renewal:%' then least(v_own.paid_until_after, v_own.created_at + make_interval(days => v_own.days + 3))
    else v_own.created_at + make_interval(days => v_own.days)
  end;
end;
$$;

revoke execute on function public._end_membership_after_refund(uuid, public.payments) from public, anon, authenticated, service_role;
