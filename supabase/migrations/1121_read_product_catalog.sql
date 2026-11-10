-- Price display uses the build's unit system; checkout also verifies the
-- independent active-wallet marker before it creates a hosted session.
create function public.read_product_catalog(p_version text)
returns table(product_id text, tier text, kind text, revision integer, usd_cents integer,
              credits integer, paid_days integer, listed boolean, name_en text, name_zh text)
language sql stable security definer set search_path = '' as $$
  select p.product_id, p.tier, p.kind, v.revision, v.usd_cents, v.credits, v.paid_days,
         v.listed, v.name_en, v.name_zh
    from admin.catalog_products p
    join admin.catalog_product_versions v on v.product_id = p.product_id
     and v.revision = case p_version when 'v1' then 1 when 'v2' then p.published_revision end
   order by v.sort_order, p.product_id
$$;
revoke all on function public.read_product_catalog(text) from public, anon, authenticated;
grant execute on function public.read_product_catalog(text) to service_role;
