-- The four template paths (save, publish, alternate and fallback routes) all derive their
-- budget from this function. Freeze the approved v2 inputs; retain legacy behavior until cutover.
create or replace function admin.lowest_credit_price() returns numeric
language sql stable security definer set search_path='' as $$
  select case when admin.is_template_catalog_v2() then (select usd_cents::numeric/(100*credits::numeric) from admin.product_terms_v2 where product_id='max_yearly')
    else (select min(price_usd/credits) from public.products where active and credits>0) end
$$;
