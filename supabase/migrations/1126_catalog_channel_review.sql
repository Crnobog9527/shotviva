-- Stripe Checkout sessions created by the phase-one binary have no local attempt row.
-- Wait out their maximum 24 hour lifetime after the cutover as well.
create function public.admin_catalog_archivable(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r admin.catalog_publications;
begin
  perform admin.catalog_require_actor(p_actor);
  select * into strict r from admin.catalog_publications where id=p_id and status='published';
  if r.published_at+interval '24 hours'>now() then return '[]'; end if;
  return coalesce((select jsonb_agg(distinct old.price_id) from admin.catalog_stripe_prices old
    where old.product_id=r.product_id and old.revision=r.base_revision and old.archived_at is null
    and not exists(select from admin.catalog_stripe_prices s join admin.catalog_products p on p.product_id=s.product_id and p.published_revision=s.revision where s.price_id=old.price_id)
    and not exists(select from admin.catalog_checkout_attempts a where a.price_id=old.price_id and a.expires_at>now() and a.settled_at is null)
    ),'[]');
end $$;
create function public.admin_catalog_archive(p_actor uuid,p_id uuid,p_price text) returns void
language plpgsql security definer set search_path='' as $$
declare r admin.catalog_publications;
begin
  perform admin.catalog_require_actor(p_actor);
  r:=admin.catalog_locked_request(p_id);
  if not (public.admin_catalog_archivable(p_actor,p_id) ? p_price) then raise exception 'CATALOG_STILL_IN_USE'; end if;
  update admin.catalog_stripe_prices set archived_at=now() where price_id=p_price;
  perform admin.catalog_audit(p_actor,'catalog_archive',r,jsonb_build_object('price',p_price));
end $$;

create function public.admin_catalog_waffo(p_actor uuid,p_id uuid,p_store text,p_mode text,p_once text,p_recurring text,p_baseline_recurring text)
returns void language plpgsql security definer set search_path='' as $$
declare r admin.catalog_publications; v admin.catalog_product_versions; base admin.catalog_product_versions;
begin
  perform admin.catalog_require_actor(p_actor);
  r:=admin.catalog_locked_request(p_id);
  if r.status not in ('prepared','published') then raise exception 'CATALOG_STALE'; end if;
  select * into strict v from admin.catalog_product_versions where product_id=r.product_id and revision=r.revision;
  select * into base from admin.catalog_product_versions where product_id=r.product_id and revision=2;
  if p_store !~ '^STO_[A-Za-z0-9]+$' or p_once !~ '^PROD_[A-Za-z0-9]+$' or (v.paid_days is null)<>(p_recurring is null)
    or p_recurring !~ '^PROD_[A-Za-z0-9]+$' then raise exception 'INVALID_INPUT'; end if;
  if p_recurring is not null and ((base.usd_cents<>v.usd_cents and p_recurring=p_baseline_recurring)
    or exists(select from admin.catalog_waffo_bindings b where b.recurring_id=p_recurring and
      (b.usd_cents<>v.usd_cents or b.product_id<>r.product_id) and b.store_id=p_store and b.mode=p_mode)) then
    raise exception 'CATALOG_WAFFO_LEGACY_CONTRACT'; end if;
  insert into admin.catalog_waffo_bindings(product_id,revision,store_id,mode,one_time_id,recurring_id,usd_cents)
   values(r.product_id,r.revision,p_store,p_mode,p_once,p_recurring,v.usd_cents) on conflict do nothing;
  if not exists(select from admin.catalog_waffo_bindings b where b.product_id=r.product_id and b.revision=r.revision
    and b.store_id=p_store and b.mode=p_mode and b.one_time_id=p_once and b.recurring_id is not distinct from p_recurring)
    then raise exception 'CATALOG_BINDING_CONFLICT'; end if;
  perform admin.catalog_audit(p_actor,'catalog_waffo',r,jsonb_build_object('mode',p_mode,'one',p_once,'recurring',p_recurring));
end $$;
revoke all on function public.admin_catalog_archivable(uuid,uuid),public.admin_catalog_archive(uuid,uuid,text),public.admin_catalog_waffo(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_catalog_archivable(uuid,uuid),public.admin_catalog_archive(uuid,uuid,text),public.admin_catalog_waffo(uuid,uuid,text,text,text,text,text) to service_role;

create function public.admin_catalog_account(p_actor uuid,p_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  perform admin.catalog_require_actor(p_actor);
  return (select stripe_account from admin.catalog_publications where id=p_id);
end $$;
revoke all on function public.admin_catalog_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_catalog_account(uuid,uuid) to service_role;

-- History pagination must not limit which old publication can finish its archive.
create function public.admin_catalog_release(p_actor uuid,p_product text,p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform admin.catalog_require_actor(p_actor);
  return (select jsonb_build_object('id',r.id,'revision',r.revision)
    from admin.catalog_publications r join admin.catalog_products p using(product_id)
    where r.product_id=p_product and r.status='published' and
      (r.id=p_id or (p_id is null and r.revision=p.published_revision)));
end $$;
revoke all on function public.admin_catalog_release(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_catalog_release(uuid,text,uuid) to service_role;
