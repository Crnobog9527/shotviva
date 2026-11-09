-- Only a redemption can authorize a discount. Gift-only redemptions share the pending
-- index, so explicitly require an applicable coupon when joining the catalog.
create function public.checkout_discount(p_user uuid, p_product_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  return (
    select jsonb_build_object('code_id', c.id, 'code', c.code, 'stripe_coupon_id', c.stripe_coupon_id,
                              'percent', c.discount_percent, 'redemption_id', r.id)
      from public.code_redemptions r
      join public.codes c on c.id = r.code_id
     where r.user_id = p_user and r.status = 'ok'
       and r.discount_used_payment_id is null and r.discount_void_at is null
       and (r.discount_expires_at is null or r.discount_expires_at > v_now)
       and c.active and (c.starts_at is null or c.starts_at <= v_now)
       and (c.expires_at is null or c.expires_at > v_now)
       and c.stripe_coupon_id is not null and p_product_id = any(c.discount_products)
  );
end;
$$;

revoke all on function public.checkout_discount(uuid, text) from public, anon, authenticated;
grant execute on function public.checkout_discount(uuid, text) to service_role;
