-- T71 (ARCHITECTURE §6.1 档位, §6.2 「会员退款」): a refunded membership no longer sets the tier.
-- Same rule as 0082 otherwise: while paid_until is ahead, the tier is the newest paid-pool
-- membership grant; now a grant whose payment is refunded or partially refunded is skipped, so
-- refunding a Pro upgrade while an older Starter still runs leaves the user on Starter. (A
-- disputed payment's buyer is banned, so its grant is not looked at here.) Lookups by the
-- payments unique keys on session, invoice and PAY_ ids.
create or replace function public.current_tier(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_paid_until timestamptz;
  v_product_id text;
begin
  select paid_until into v_paid_until from public.profiles where id = p_user_id;
  if v_paid_until is null or v_paid_until <= now() then
    return null;
  end if;

  select l.product_id into v_product_id
    from public.credit_ledger l
   where l.user_id = p_user_id
     and l.pool = 'paid'
     and l.delta > 0
     and l.product_id is not null
     and l.product_id not like 'pack_%'
     and not exists (
       select 1 from public.payments p
        where p.user_id = p_user_id
          and p.status in ('refunded', 'partially_refunded')
          and l.idempotency_key in ('purchase:' || p.stripe_session_id, 'renewal:' || p.stripe_invoice_id, 'purchase:' || p.waffo_payment_id)
     )
   order by l.created_at desc, l.id desc
   limit 1;

  if v_product_id is null then
    return null;
  end if;
  return split_part(v_product_id, '_', 1);
end;
$$;
