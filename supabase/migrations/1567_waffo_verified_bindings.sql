-- The Waffo channel sells a version only after this store's products were checked against
-- that version's quote (ARCHITECTURE §6.3). Until now seeded revisions 1 and 2 skipped the
-- check, both on the paywall (read_waffo_offers) and at checkout (catalog_channel_price), and
-- Waffo renews at its dashboard price, so a drifted dashboard price surfaced a year later.
-- Stripe is unchanged. Seeded versions have no publication request for the per-product review,
-- so admin_catalog_waffo_seeded records their reviewed binding instead.

create or replace function public.read_waffo_offers(p_version text,p_store text,p_mode text)
returns table(product_id text,tier text,kind text,revision integer,usd_cents integer,credits integer,
              paid_days integer,listed boolean,name_en text,name_zh text,benefit_en text,benefit_zh text)
language sql stable security definer set search_path='' as $$
  select r.* from public.read_catalog_offers(p_version) r
    join admin.catalog_product_versions v on (v.product_id,v.revision)=(r.product_id,r.revision)
    join admin.catalog_waffo_bindings b on (b.product_id,b.revision)=(r.product_id,r.revision)
   where b.store_id=p_store and b.mode=p_mode and b.usd_cents=r.usd_cents
   order by v.sort_order,r.product_id
$$;
revoke all on function public.read_waffo_offers(text,text,text) from public,anon,authenticated;
grant execute on function public.read_waffo_offers(text,text,text) to service_role;

create or replace function public.catalog_channel_price(p_product text,p_revision int,p_channel text,p_key text,p_recurring boolean,
  p_store text default null,p_mode text default null) returns text language plpgsql stable security definer set search_path='' as $$
declare
  v_id text;
begin
  if p_channel='stripe' then
    select price_id into v_id from admin.catalog_stripe_prices
      where product_id=p_product and revision=p_revision and lookup_key=p_key;
    if v_id is null and (p_revision<>2 or not exists(select from admin.product_terms_v2 where product_id=p_product)
        or exists(select from admin.catalog_stripe_prices where product_id=p_product and revision=p_revision)) then
      raise exception 'CATALOG_CHANNEL_UNVERIFIED';
    end if;
  elsif p_channel='waffo' then
    select case when p_recurring then b.recurring_id else b.one_time_id end into v_id
      from admin.catalog_waffo_bindings b join admin.catalog_product_versions v using(product_id,revision)
      where b.product_id=p_product and b.revision=p_revision and b.store_id=p_store and b.mode=p_mode
        and b.usd_cents=v.usd_cents;
    if v_id is null then raise exception 'CATALOG_CHANNEL_UNVERIFIED'; end if;
  else raise exception 'INVALID_INPUT';
  end if;
  return v_id;
end
$$;
revoke all on function public.catalog_channel_price(text,int,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.catalog_channel_price(text,int,text,text,boolean,text,text) to service_role;

-- The server compared these Waffo products with the version's quote just before the call.
create function public.admin_catalog_waffo_seeded(p_actor uuid,p_product text,p_revision int,p_store text,p_mode text,
  p_once text,p_recurring text) returns void language plpgsql security definer set search_path='' as $$
declare v admin.catalog_product_versions;
begin
  perform admin.catalog_require_actor(p_actor);
  perform 1 from admin.catalog_products where product_id=p_product for update;
  if not found or p_revision not in (1,2)
    or not exists(select from admin.product_terms_v2 s where s.product_id=p_product)
    or exists(select from admin.catalog_publications r where r.product_id=p_product and r.revision=p_revision) then
    raise exception 'CATALOG_STALE';
  end if;
  select * into strict v from admin.catalog_product_versions where product_id=p_product and revision=p_revision;
  if p_store !~ '^STO_[A-Za-z0-9]+$' or p_mode not in ('prod','test') or p_once !~ '^PROD_[A-Za-z0-9]+$'
    or (v.paid_days is null)<>(p_recurring is null) or p_recurring !~ '^PROD_[A-Za-z0-9]+$' then
    raise exception 'INVALID_INPUT';
  end if;
  if p_recurring is not null and exists(select from admin.catalog_waffo_bindings b where b.recurring_id=p_recurring
      and (b.usd_cents<>v.usd_cents or b.product_id<>p_product) and b.store_id=p_store and b.mode=p_mode) then
    raise exception 'CATALOG_WAFFO_LEGACY_CONTRACT';
  end if;
  insert into admin.catalog_waffo_bindings(product_id,revision,store_id,mode,one_time_id,recurring_id,usd_cents)
    values(p_product,p_revision,p_store,p_mode,p_once,p_recurring,v.usd_cents) on conflict do nothing;
  if not exists(select from admin.catalog_waffo_bindings b where b.product_id=p_product and b.revision=p_revision
      and b.store_id=p_store and b.mode=p_mode and b.one_time_id=p_once and b.recurring_id is not distinct from p_recurring) then
    raise exception 'CATALOG_BINDING_CONFLICT';
  end if;
  insert into public.admin_audit_log(action,user_id,target_id,reason) values('catalog_waffo',p_actor,p_product,
    jsonb_build_object('revision',p_revision,'seeded',true,'details',
      jsonb_build_object('mode',p_mode,'one',p_once,'recurring',p_recurring,'usd_cents',v.usd_cents))::text);
end $$;
revoke all on function public.admin_catalog_waffo_seeded(uuid,text,int,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_catalog_waffo_seeded(uuid,text,int,text,text,text,text) to service_role;

-- pnpm pricing:waffo checks the Waffo products checkout actually uses: a version's binding when it
-- has one for this store and mode, the environment mapping only for unbound seeded versions.
create function public.read_waffo_bindings(p_store text,p_mode text)
returns table(product_id text,revision integer,one_time_id text,recurring_id text,usd_cents integer)
language sql stable security definer set search_path='' as $$
  select b.product_id,b.revision,b.one_time_id,b.recurring_id,b.usd_cents from admin.catalog_waffo_bindings b
   where b.store_id=p_store and b.mode=p_mode order by b.product_id,b.revision
$$;
revoke all on function public.read_waffo_bindings(text,text) from public,anon,authenticated;
grant execute on function public.read_waffo_bindings(text,text) to service_role;
