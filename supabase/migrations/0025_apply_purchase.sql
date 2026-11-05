-- Settles one paid purchase: credits += product credits and
-- paid_until = max(paid_until, now()) + product days (ARCHITECTURE §6.1).
-- Idempotent by the payment channel's event id, so a redelivered webhook is a no-op.
create function public.apply_purchase(p_user_id uuid, p_product_id text, p_event_id text)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'event_id is required';
  end if;

  select * into v_product from public.products where id = p_product_id and active;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  return public._apply_credit_change(
    p_user_id, 'purchase', v_product.credits, 'purchase ' || v_product.id,
    'purchase:' || p_event_id, null, v_product.id, v_product.days
  );
end;
$$;

revoke execute on function public.apply_purchase(uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_purchase(uuid, text, text) to service_role;
