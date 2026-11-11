-- Public pages only advertise versions that this deployment's Waffo store can sell.
-- Seeded terms retain the T99 environment mappings until the first manual review.
create function public.read_waffo_offers(p_version text,p_store text,p_mode text)
returns table(product_id text,tier text,kind text,revision integer,usd_cents integer,credits integer,
              paid_days integer,listed boolean,name_en text,name_zh text,benefit_en text,benefit_zh text)
language sql stable security definer set search_path='' as $$
  select r.* from public.read_catalog_offers(p_version) r
    join admin.catalog_product_versions v on (v.product_id,v.revision)=(r.product_id,r.revision)
    left join admin.catalog_waffo_bindings b on (b.product_id,b.revision)=(r.product_id,r.revision)
   where (b.store_id=p_store and b.mode=p_mode)
      or (b.product_id is null and r.revision in (1,2) and exists(
        select from admin.product_terms_v2 s where s.product_id=r.product_id))
   order by v.sort_order,r.product_id
$$;
revoke all on function public.read_waffo_offers(text,text,text) from public,anon,authenticated;
grant execute on function public.read_waffo_offers(text,text,text) to service_role;
