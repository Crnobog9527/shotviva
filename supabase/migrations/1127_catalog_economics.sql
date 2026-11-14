-- Compare integer cross-products: rounding a unit price before comparing would move the floor.
-- The approved policy is an operational setting, private to each database.
create function admin.catalog_policy() returns jsonb language sql stable set search_path='' as $$
  select s.value from public.system_settings s where s.key='catalog_economics_policy'
    and not exists(select from unnest(array['payment_bp','refund_bp','yearly_commission_bp','other_commission_bp','margin_bp']) k
      where (s.value->>k) is null or (s.value->>k) !~ '^[0-9]{1,4}$')
    and (s.value->>'payment_bp')::int+(s.value->>'refund_bp')::int+
      greatest((s.value->>'yearly_commission_bp')::int,(s.value->>'other_commission_bp')::int)<10000
$$;
create function admin.require_catalog_policy() returns void language plpgsql stable set search_path='' as $$
begin
  if admin.catalog_policy() is null then raise exception 'CATALOG_POLICY_REQUIRED'; end if;
end $$;
create function admin.catalog_fee_components(p_kind text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('payment_bp',(policy->>'payment_bp')::int,'refund_bp',(policy->>'refund_bp')::int,
    'commission_bp',greatest((policy->>case when p_kind='yearly' then 'yearly_commission_bp' else 'other_commission_bp' end)::int,
      (select r.l1_bp+r.l2_bp from public.affiliate_rates r where product_kind=p_kind),
      (select max(coalesce(o.l1_bp,r.l1_bp) +
          case when parent.status='active' and parent.team_enabled then coalesce(po.l2_bp,r.l2_bp) else 0 end)
        from public.affiliates a join public.affiliate_rates r on r.product_kind=p_kind
        left join public.affiliate_rate_overrides o on (o.user_id,o.product_kind)=(a.user_id,p_kind)
        left join public.affiliates parent on parent.user_id=a.parent_user_id
        left join public.affiliate_rate_overrides po on (po.user_id,po.product_kind)=(parent.user_id,p_kind)
        where a.status='active'))) from (select admin.catalog_policy() policy) x where policy is not null
$$;
create function admin.catalog_fee_bp(p_kind text) returns integer language sql stable set search_path='' as $$
  select (f->>'payment_bp')::int+(f->>'refund_bp')::int+(f->>'commission_bp')::int from admin.catalog_fee_components(p_kind) f
$$;
create function admin.catalog_baseline_kept_bp() returns integer language sql stable set search_path='' as $$
  select 10000-(p->>'payment_bp')::int-(p->>'refund_bp')::int-(p->>'yearly_commission_bp')::int from admin.catalog_policy() p
$$;
create function admin.catalog_budget() returns numeric language sql stable set search_path='' as $$
  select t.usd_cents::numeric/(100*t.credits::numeric) * admin.catalog_baseline_kept_bp()/10000 *
    (10000-(admin.catalog_policy()->>'margin_bp')::int)/10000
    from admin.product_terms_v2 t where product_id='max_yearly'
$$;
create function admin.catalog_cost_ok(p_kind text,p_cents numeric,p_credits integer) returns boolean
language sql stable set search_path='' as $$
  select p_cents>0 and p_credits>0 and p_cents*t.credits*(10000-admin.catalog_fee_bp(p_kind))
    >= p_credits::numeric*t.usd_cents*admin.catalog_baseline_kept_bp()
    from admin.product_terms_v2 t where product_id='max_yearly'
$$;
revoke all on function admin.catalog_policy(),admin.require_catalog_policy(),admin.catalog_fee_components(text),
  admin.catalog_baseline_kept_bp(),admin.catalog_budget() from public,anon,authenticated,service_role;

-- The optional candidate substitutes one draft into the set used for this decision.
create function admin.catalog_candidate(p_product text,p_cents integer,p_credits integer,p_listed boolean)
returns table(id text,kind text,cents numeric,credits integer) language sql stable set search_path='' as $$
  select p.product_id,p.kind,v.usd_cents::numeric,v.credits
    from admin.catalog_products p join admin.catalog_product_versions v
      on (v.product_id,v.revision)=(p.product_id,p.published_revision)
    where v.listed and p.product_id is distinct from p_product
  union all select p_product, coalesce((select p.kind from admin.catalog_products p where p.product_id=p_product),'pack'),
    p_cents::numeric,p_credits where p_listed is true
$$;

create function admin.catalog_code_conflict(p_targets text[],p_pct integer,
    p_product text,p_cents integer,p_credits integer,p_listed boolean)
returns text language sql stable set search_path='' as $$
  with items as materialized (select * from admin.catalog_candidate(p_product,p_cents,p_credits,p_listed)),
  floor_rate as (select s.* from items s where s.kind<>'pack'
    and not exists(select from items other where other.kind<>'pack' and other.cents*s.credits<s.cents*other.credits)
    limit 1)
  select sku from unnest(p_targets) sku left join items i on i.id=sku left join floor_rate f on true
   where i.id is null or f.id is null
      or not admin.catalog_cost_ok(i.kind,i.cents-round(i.cents*p_pct/100),i.credits)
      or least(i.cents*(100-p_pct)/100,i.cents-round(i.cents*p_pct/100))*f.credits<f.cents*i.credits
   order by sku limit 1
$$;

create function admin.validate_catalog_terms(p_product text,p_cents integer,p_credits integer,p_listed boolean)
returns void language plpgsql set search_path='' as $$
declare old_cents integer; old_credits integer; was_listed boolean; kind_ text; campaign record; conflict text;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.catalog.economics',0));
  select p.kind,v.usd_cents,v.credits,v.listed into kind_,old_cents,old_credits,was_listed
    from admin.catalog_products p left join admin.catalog_product_versions v
    on (v.product_id,v.revision)=(p.product_id,p.published_revision) where p.product_id=p_product;
  if p_cents is null or p_credits is null or p_cents<=0 or p_credits<=0 or p_listed is null then raise exception 'INVALID_INPUT'; end if;
  if (p_cents,p_credits,p_listed) is not distinct from (old_cents,old_credits,was_listed) then return; end if;
  perform admin.require_catalog_policy();
  if ((p_cents,p_credits) is distinct from (old_cents,old_credits) or p_listed)
     and not admin.catalog_cost_ok(coalesce(kind_,'pack'),
       case when p_product in ('pack_m','pack_l') then round(p_cents::numeric*0.85) else p_cents end,p_credits)
    then raise exception 'CATALOG_COST_FLOOR: %',p_product; end if;
  for campaign in select c.code,c.discount_percent,c.discount_products from public.codes c
    where c.kind='campaign' and c.discount_percent is not null and
      ((c.active and (c.expires_at is null or c.expires_at>now())) or exists
        (select from public.code_redemptions r where r.code_id=c.id and r.status='ok' and r.discount_used_payment_id is null and r.discount_void_at is null
          and (r.discount_expires_at is null or r.discount_expires_at>now())))
  loop
    conflict := admin.catalog_code_conflict(campaign.discount_products,campaign.discount_percent,p_product,p_cents,p_credits,p_listed);
    if conflict is not null then raise exception 'CATALOG_CODE_FLOOR: % %',conflict,campaign.code; end if;
  end loop;
end $$;

create function admin.assert_catalog_checkout(p_product text,p_revision integer,p_net_cents integer,p_code_percent integer default null)
returns void language plpgsql set search_path='' as $$
declare v admin.catalog_product_versions; k text;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.catalog.economics',0));
  select v0.* into strict v from admin.catalog_product_versions v0 where (product_id,revision)=(p_product,p_revision);
  select kind into strict k from admin.catalog_products where product_id=p_product and published_revision=p_revision;
  if not v.listed or p_net_cents is null or p_net_cents<=0 then raise exception 'CATALOG_OFFER_CHANGED'; end if;
  if p_code_percent is not null and (p_code_percent not between 1 and 90 or
      admin.catalog_code_conflict(array[p_product],p_code_percent,null,null,null,false) is not null)
    then raise exception 'CATALOG_CODE_FLOOR: %',p_product; end if;
  if (p_revision>2 or not exists(select from admin.product_terms_v2 where product_id=p_product))
      and admin.catalog_cost_ok(k,p_net_cents,v.credits) is not true then raise exception 'CATALOG_COST_FLOOR: %',p_product; end if;
end $$;

-- Initial v2 baseline was approved as a batch. New codes and reactivation always use the current floor.
create function admin.catalog_validate_code_write() returns trigger language plpgsql set search_path='' as $$
declare conflict text;
begin
  if not new.active or new.discount_percent is null or not admin.is_template_catalog_v2() then return new; end if;
  if tg_op='UPDATE' and old.active and (new.discount_percent,new.discount_products,new.expires_at)
       is not distinct from (old.discount_percent,old.discount_products,old.expires_at) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('shotviva.catalog.economics',0));
  conflict := admin.catalog_code_conflict(new.discount_products,new.discount_percent,null,null,null,false);
  if conflict is not null then raise exception 'CODE_DISCOUNT_PRODUCTS' using detail=to_json(array[conflict])::text; end if;
  return new;
end $$;
create trigger catalog_validate_discount before insert or update on public.codes
  for each row execute function admin.catalog_validate_code_write();
revoke all on function admin.catalog_fee_bp(text) from public,anon,authenticated,service_role;
revoke all on function admin.catalog_cost_ok(text,numeric,integer) from public,anon,authenticated,service_role;
revoke all on function admin.catalog_candidate(text,integer,integer,boolean) from public,anon,authenticated,service_role;
revoke all on function admin.catalog_code_conflict(text[],integer,text,integer,integer,boolean) from public,anon,authenticated,service_role;
revoke all on function admin.validate_catalog_terms(text,integer,integer,boolean) from public,anon,authenticated,service_role;
revoke all on function admin.assert_catalog_checkout(text,integer,integer,integer) from public,anon,authenticated,service_role;
revoke all on function admin.catalog_validate_code_write() from public,anon,authenticated,service_role;

create or replace function public._validate_code_discount(
  p_products text[], p_percent integer, p_catalog jsonb, p_floor_product_id text
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  entry record;
  cents numeric;
  credits numeric;
  active_rates jsonb := '{}';
  floor_cents numeric;
  floor_credits numeric;
  invalid_products text[];
begin
  if admin.is_template_catalog_v2() then
    -- Bind the caller's preview and minimum subscription to the same published terms.
    if jsonb_typeof(p_catalog) is distinct from 'array' or
       (select jsonb_agg(value order by value->>'id') from jsonb_array_elements(p_catalog))
       is distinct from (select jsonb_agg(jsonb_build_object('id',id,'priceCents',cents,'credits',credits,
          'subscription',kind<>'pack') order by id) from admin.catalog_candidate(null,null,null,false))
       or not exists(select from admin.catalog_candidate(null,null,null,false) f
         where f.id=p_floor_product_id and f.kind<>'pack' and not exists(
           select from admin.catalog_candidate(null,null,null,false) i
            where i.kind<>'pack' and i.cents*f.credits<f.cents*i.credits)) then
      raise exception 'INVALID_CODE_CATALOG';
    end if;
    select array_agg(t.id order by t.id) into invalid_products from unnest(p_products) t(id)
      where admin.catalog_code_conflict(array[t.id],p_percent,null,null,null,false) is not null;
    if invalid_products is not null then
      raise exception 'CODE_DISCOUNT_PRODUCTS' using detail=to_json(invalid_products)::text;
    end if;
    return;
  end if;
  if jsonb_typeof(p_catalog) is distinct from 'array' or p_floor_product_id is null then
    raise exception 'INVALID_CODE_CATALOG';
  end if;
  if jsonb_array_length(p_catalog) > (select count(*) from public.products) then
    raise exception 'INVALID_CODE_CATALOG';
  end if;

  for entry in
    select data.item, p.id, p.active, (p.days is not null) as subscription
      from jsonb_array_elements(p_catalog) as data(item)
      left join public.products p on p.id = data.item->>'id'
  loop
    if entry.id is null or active_rates ? entry.id
      or jsonb_typeof(entry.item->'priceCents') is distinct from 'number'
      or jsonb_typeof(entry.item->'credits') is distinct from 'number'
      or entry.item->'subscription' is distinct from to_jsonb(entry.subscription) then
      raise exception 'INVALID_CODE_CATALOG';
    end if;
    cents := (entry.item->>'priceCents')::numeric;
    credits := (entry.item->>'credits')::numeric;
    if cents <= 0 or cents <> trunc(cents) or cents > 9007199254740991
      or credits <= 0 or credits <> trunc(credits) or credits > 2147483647 then
      raise exception 'INVALID_CODE_CATALOG';
    end if;
    -- Keep an inactive ID as JSON null so duplicates are still rejected but the product
    -- cannot be either a floor or a discount target.
    active_rates := active_rates || jsonb_build_object(entry.id, case when entry.active then entry.item end);
  end loop;

  floor_cents := (active_rates->p_floor_product_id->>'priceCents')::numeric;
  floor_credits := (active_rates->p_floor_product_id->>'credits')::numeric;
  if active_rates->p_floor_product_id->'subscription' is distinct from 'true'::jsonb
     or exists (select 1 from public.products p where p.active and p.days is not null and
          (not (active_rates ? p.id) or
           (active_rates->p.id->>'priceCents')::numeric * floor_credits
             < floor_cents * (active_rates->p.id->>'credits')::numeric)) then
    raise exception 'INVALID_CODE_CATALOG';
  end if;

  select array_agg(t.id order by t.id) into invalid_products from unnest(p_products) t(id)
    where (active_rates->t.id->>'credits') is null
       or (active_rates->t.id->>'priceCents')::numeric * (100 - p_percent) * floor_credits
          < floor_cents * (active_rates->t.id->>'credits')::numeric * 100;
  if invalid_products is not null then
    raise exception 'CODE_DISCOUNT_PRODUCTS' using detail = to_json(invalid_products)::text;
  end if;
end;
$$;
