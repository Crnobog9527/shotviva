-- Reject a partial set even if the server only received one of several Stripe variants.
create function admin.catalog_price_forms(p_product text,p_revision integer)
returns table(lookup_key text,usd_cents integer,stripe_product text) language sql stable set search_path='' as $$
  select p.product_id||f.suffix,round(v.usd_cents::numeric*f.percentage/100)::integer,
    'shotviva_'||case when p.tier='pack' then p.product_id else p.tier end
    from admin.catalog_products p join admin.catalog_product_versions v using(product_id)
    cross join lateral (
      select '_v2',100 union all select '_recurring_v2',100 where p.kind<>'pack'
      union all select '_v2_starter',95 where p.product_id in ('pack_m','pack_l')
      union all select '_v2_pro',90 where p.product_id in ('pack_m','pack_l')
      union all select '_v2_max',85 where p.product_id in ('pack_m','pack_l')
    ) f(suffix,percentage) where p.product_id=p_product and v.revision=p_revision
$$;

create function admin.catalog_bind_prices(p_product text,p_revision integer,p_account text,p_live boolean,p_prices jsonb)
returns void language plpgsql set search_path='' as $$
declare form record; expected integer; linked text;
begin
  if p_revision is null then return; end if;
  select count(*) into expected from admin.catalog_price_forms(p_product,p_revision);
  if jsonb_typeof(p_prices) is distinct from 'object' or expected=0 then raise exception 'CATALOG_INVALID_BINDINGS'; end if;
  if (select count(*) from jsonb_object_keys(p_prices))<>expected or
    (select count(distinct value) from jsonb_each_text(p_prices))<>expected then raise exception 'CATALOG_INVALID_BINDINGS'; end if;
  for form in select * from admin.catalog_price_forms(p_product,p_revision) loop
    linked := p_prices->>form.lookup_key;
    if linked is null or linked !~ '^price_[A-Za-z0-9]+$' then raise exception 'CATALOG_INVALID_BINDINGS'; end if;
    if exists(select from admin.catalog_stripe_prices s where s.price_id=linked and
      (s.product_id<>p_product or s.lookup_key<>form.lookup_key or s.usd_cents<>form.usd_cents or
       s.stripe_account<>p_account or s.livemode<>p_live or s.archived_at is not null))
      then raise exception 'CATALOG_BINDING_CONFLICT'; end if;
    insert into admin.catalog_stripe_prices(product_id,revision,lookup_key,price_id,stripe_account,livemode,stripe_product,usd_cents)
      values(p_product,p_revision,form.lookup_key,linked,p_account,p_live,form.stripe_product,form.usd_cents)
      on conflict (product_id,revision,lookup_key) do nothing;
    if not exists(select from admin.catalog_stripe_prices s where s.product_id=p_product and s.revision=p_revision
      and s.lookup_key=form.lookup_key and s.stripe_account=p_account and s.livemode=p_live and s.price_id=linked and s.archived_at is null)
      then raise exception 'CATALOG_BINDING_CONFLICT'; end if;
  end loop;
end $$;

-- Identity row first, then request, in the same order as saving a draft.
create function admin.catalog_locked_request(p_id uuid) returns admin.catalog_publications language plpgsql set search_path='' as $$
declare r admin.catalog_publications; current_rev integer; sku text;
begin
  select product_id into strict sku from admin.catalog_publications where id=p_id;
  select published_revision into strict current_rev from admin.catalog_products where product_id=sku for update;
  select * into strict r from admin.catalog_publications where id=p_id for update;
  if r.status<>'published' and current_rev is distinct from r.base_revision then raise exception 'CATALOG_STALE'; end if;
  return r;
end $$;

create function public.admin_catalog_prepare(p_actor uuid,p_id uuid,p_account text,p_live boolean,p_prices jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r admin.catalog_publications; v admin.catalog_product_versions;
begin
  perform admin.catalog_require_actor(p_actor);
  perform admin.catalog_lock_publication();
  perform admin.require_catalog_policy();
  r := admin.catalog_locked_request(p_id);
  if r.status='prepared' and r.stripe_account=p_account and r.livemode=p_live then return r.id; end if;
  if r.status<>'draft' then raise exception 'CATALOG_STALE'; end if;
  select * into strict v from admin.catalog_product_versions where product_id=r.product_id and revision=r.revision;
  perform admin.validate_catalog_terms(r.product_id,v.usd_cents,v.credits,v.listed);
  insert into admin.catalog_stripe_environment(stripe_account,livemode) values(p_account,p_live) on conflict(singleton) do nothing;
  if not exists(select from admin.catalog_stripe_environment where stripe_account=p_account and livemode=p_live) then raise exception 'CATALOG_ENVIRONMENT'; end if;
  perform admin.catalog_bind_prices(r.product_id,r.base_revision,p_account,p_live,p_prices);
  update admin.catalog_publications set status='prepared',stripe_account=p_account,livemode=p_live,prepared_at=now(),last_error=null,retry_at=null where id=p_id;
  perform admin.catalog_audit(p_actor,'catalog_prepare',r,p_prices);
  return r.id;
end $$;

create function public.admin_catalog_publish(p_actor uuid,p_id uuid,p_account text,p_live boolean,p_prices jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r admin.catalog_publications; v admin.catalog_product_versions;
begin
  perform admin.catalog_require_actor(p_actor);
  perform admin.catalog_lock_publication();
  perform admin.require_catalog_policy();
  r := admin.catalog_locked_request(p_id);
  if r.stripe_account is distinct from p_account or r.livemode is distinct from p_live then raise exception 'CATALOG_ENVIRONMENT'; end if;
  if r.status='published' then return r.id; end if;
  if r.status<>'prepared' then raise exception 'CATALOG_STALE'; end if;
  select * into strict v from admin.catalog_product_versions where product_id=r.product_id and revision=r.revision;
  perform admin.validate_catalog_terms(r.product_id,v.usd_cents,v.credits,v.listed);
  perform admin.catalog_bind_prices(r.product_id,r.revision,p_account,p_live,p_prices);
  update admin.catalog_products set published_revision=r.revision where product_id=r.product_id;
  update admin.catalog_publications set status='published',published_at=now(),last_error=null,retry_at=null where id=p_id;
  perform admin.catalog_audit(p_actor,'catalog_publish',r,p_prices);
  return r.id;
end $$;

create function public.admin_catalog_retry(p_actor uuid,p_id uuid,p_step text,p_error text)
returns void language plpgsql security definer set search_path='' as $$
declare r admin.catalog_publications;
begin
  perform admin.catalog_require_actor(p_actor);
  if p_step not in ('prepare','publish','archive','waffo') or p_error !~ '^[a-zA-Z0-9_.:-]{1,140}$' then raise exception 'INVALID_INPUT'; end if;
  update admin.catalog_publications set last_error=p_step||':'||p_error,retry_at=now() where id=p_id
    and (p_step in ('archive','waffo') or status in ('draft','prepared')) returning * into r;
  if found then perform admin.catalog_audit(p_actor,'catalog_retry',r,jsonb_build_object('step',p_step,'error',p_error)); end if;
end $$;

revoke all on function admin.catalog_price_forms(text,integer),admin.catalog_bind_prices(text,integer,text,boolean,jsonb),
  admin.catalog_locked_request(uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_catalog_prepare(uuid,uuid,text,boolean,jsonb),public.admin_catalog_publish(uuid,uuid,text,boolean,jsonb),
  public.admin_catalog_retry(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_catalog_prepare(uuid,uuid,text,boolean,jsonb),public.admin_catalog_publish(uuid,uuid,text,boolean,jsonb),
  public.admin_catalog_retry(uuid,uuid,text,text) to service_role;
