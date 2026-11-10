-- Do not let a catalogue pointer advance while the wallet still uses legacy units.
create function admin.require_catalog_v2() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.published_revision is not distinct from old.published_revision then return new; end if;
  elsif new.published_revision is null then
    return new;
  end if;
  perform 1 from public.system_settings
    where key = 'pricing_catalog_version' and value = '"v2"'::jsonb for share;
  if not found then raise exception 'PRODUCT_PUBLISH_REQUIRES_V2'; end if;
  return new;
end
$$;
revoke all on function admin.require_catalog_v2() from public, anon, authenticated, service_role;

create trigger catalog_publish_requires_v2 before insert or update of published_revision
  on admin.catalog_products for each row execute function admin.require_catalog_v2();

create index catalog_products_published_version_idx on admin.catalog_products(product_id, published_revision);

create or replace function public.read_product_catalog(p_version text)
returns table(product_id text, tier text, kind text, revision integer, usd_cents integer,
              credits integer, paid_days integer, listed boolean, name_en text, name_zh text)
language sql stable security definer set search_path = '' as $$
  select p.product_id, p.tier, p.kind, v.revision, v.usd_cents, v.credits, v.paid_days,
         v.listed, v.name_en, v.name_zh
    from admin.catalog_products p
    join admin.catalog_product_versions v on v.product_id = p.product_id
     and v.revision = case p_version when 'v1' then 1 when 'v2' then p.published_revision end
   where p_version <> 'v1' or exists
     (select 1 from admin.product_terms_v2 b where b.product_id = p.product_id)
   order by v.sort_order, p.product_id
$$;
