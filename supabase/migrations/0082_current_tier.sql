-- T9: the account's current membership tier (ARCHITECTURE §6.2 "会员档位权益"). The one place
-- that decides it; code and other SQL functions (T12 vote weights) call this, never their own
-- rule. Returns 'starter' / 'pro' / 'max', or null when there is no tier: membership expired
-- or never bought, or only packs bought. Callers treat null like Starter for limits.
--
-- Tier = the most recent membership purchase while paid_until > now(). Every membership
-- payment (first payment, wallet period, renewal) is a paid-pool ledger row carrying its
-- product id, so the ledger is the purchase history; packs and admin adjustments never decide
-- the tier. Membership product ids are '<tier>_monthly' / '<tier>_yearly' (products_id_check).
--
-- plpgsql, not sql: the body is only resolved when it runs, so functions in other migrations
-- can call current_tier() whatever order the files were created in.
create function public.current_tier(p_user_id uuid)
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

  select product_id into v_product_id
    from public.credit_ledger
   where user_id = p_user_id
     and pool = 'paid'
     and delta > 0
     and product_id is not null
     and product_id not like 'pack_%'
   order by created_at desc, id desc
   limit 1;

  if v_product_id is null then
    return null;
  end if;
  return split_part(v_product_id, '_', 1);
end;
$$;

revoke execute on function public.current_tier(uuid) from public, anon, authenticated;
grant execute on function public.current_tier(uuid) to service_role;
