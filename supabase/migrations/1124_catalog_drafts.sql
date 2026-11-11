-- Checkout takes the shared economics lock before the marker and the SKU.
create function admin.catalog_lock_publication() returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.catalog.economics',0));
  perform 1 from public.system_settings where key='pricing_catalog_version' and value='"v2"'::jsonb for share;
  if not found then raise exception 'PRODUCT_PUBLISH_REQUIRES_V2'; end if;
end $$;
revoke all on function admin.catalog_lock_publication() from public,anon,authenticated,service_role;

create function public.admin_catalog_save(p_actor uuid,p_product text,p_base integer,p_previous uuid,p_terms jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  identity admin.catalog_products; pending admin.catalog_publications; draft admin.catalog_publications;
  item admin.catalog_product_versions; next_rev integer; new_tier text; new_kind text;
begin
  perform admin.catalog_require_actor(p_actor);
  perform admin.catalog_lock_publication();
  perform pg_advisory_xact_lock(hashtextextended('catalog_identity:'||p_product,0));
  item := jsonb_populate_record(null::admin.catalog_product_versions,p_terms);
  if length(trim(item.name_en)) not between 1 and 120 or length(trim(item.name_zh)) not between 1 and 120
    or length(item.benefit_en)>1000 or length(item.benefit_zh)>1000 or item.sort_order not between 0 and 99999
    or length(trim(p_reason)) not between 1 and 500 then raise exception 'INVALID_INPUT'; end if;
  select * into identity from admin.catalog_products where product_id=p_product for update;
  if not found then
    if p_base is not null or p_previous is not null then raise exception 'CATALOG_STALE'; end if;
    if p_product ~ '^pack_[a-z][a-z0-9]{0,47}$' then
      new_tier := 'pack'; new_kind := 'pack';
    elsif p_product ~ '^[a-z][a-z0-9]{0,47}_(monthly|yearly)$' then
      new_tier := p_terms->>'tier';
      if new_tier is null or new_tier not in ('starter','pro','max') then raise exception 'INVALID_INPUT'; end if;
      new_kind := substring(p_product from '(monthly|yearly)$');
    else raise exception 'INVALID_INPUT'; end if;
    insert into public.products(id,credits,price_usd,active,days)
      values(p_product,item.credits,item.usd_cents/100.0,false,case new_kind when 'monthly' then 30 when 'yearly' then 365 end);
    insert into admin.catalog_products(product_id,tier,kind) values(p_product,new_tier,new_kind) returning * into identity;
  end if;
  if p_terms ? 'tier' and p_terms->>'tier' is distinct from identity.tier then raise exception 'INVALID_INPUT'; end if;
  if identity.published_revision is distinct from p_base then raise exception 'CATALOG_STALE'; end if;
  select * into pending from admin.catalog_publications where product_id=p_product and status in ('draft','prepared') for update;
  if pending.id is distinct from p_previous or pending.status='prepared' then raise exception 'CATALOG_STALE'; end if;
  perform admin.validate_catalog_terms(p_product,item.usd_cents,item.credits,item.listed);
  select greatest(coalesce(max(revision),2),2)+1 into next_rev from admin.catalog_product_versions where product_id=p_product;
  insert into admin.catalog_product_versions(product_id,revision,usd_cents,credits,paid_days,listed,sort_order,name_en,name_zh,benefit_en,benefit_zh)
    values(p_product,next_rev,item.usd_cents,item.credits,case identity.kind when 'yearly' then 365 when 'monthly' then 30 end,
      item.listed,item.sort_order,trim(item.name_en),trim(item.name_zh),trim(item.benefit_en),trim(item.benefit_zh));
  update admin.catalog_publications set status='superseded' where id=p_previous;
  insert into admin.catalog_publications(product_id,revision,base_revision,actor_id,reason)
    values(p_product,next_rev,p_base,p_actor,trim(p_reason)) returning * into draft;
  perform admin.catalog_audit(p_actor,'catalog_save',draft,p_terms);
  return draft.id;
end $$;

-- Page through product identities, including unpublished drafts. The detail and
-- publication history are scoped to one indexed product rather than loading all revisions.
create function public.admin_catalog_page(p_actor uuid,p_after text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform admin.catalog_require_actor(p_actor);
  return coalesce((select jsonb_agg(to_jsonb(rows) order by product_id) from
    (select p.product_id,p.tier,p.kind,p.published_revision,v.name_en,v.name_zh,v.usd_cents,v.credits,v.listed,
     (select status from admin.catalog_publications r where r.product_id=p.product_id and r.status in ('draft','prepared')) as pending
     from admin.catalog_products p left join admin.catalog_product_versions v on v.product_id=p.product_id and v.revision=p.published_revision
     where p.product_id>p_after order by p.product_id limit 31) rows),'[]');
end $$;

create function public.admin_catalog_editor(p_actor uuid,p_product text,p_before timestamptz default 'infinity',p_before_id uuid default 'ffffffff-ffff-ffff-ffff-ffffffffffff')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform admin.catalog_require_actor(p_actor);
  select jsonb_build_object('product_id',p.product_id,'tier',p.tier,'kind',p.kind,'current',to_jsonb(v),'draft',to_jsonb(d),
    'request',to_jsonb(r),'waffo',(select jsonb_build_object('one_time_id',w.one_time_id,'recurring_id',w.recurring_id)
      from admin.catalog_waffo_bindings w where w.product_id=p.product_id
        and w.revision=case when r.status='prepared' then r.revision else p.published_revision end),
    'budget',admin.catalog_budget(),'fees',admin.catalog_fee_components(p.kind),'discounts',
    coalesce((select jsonb_agg(jsonb_build_object('code',c.code,'percent',c.discount_percent) order by c.code)
      from public.codes c where c.kind='campaign' and p.product_id=any(c.discount_products) and c.discount_percent is not null
      and ((c.active and (c.expires_at is null or c.expires_at>now())) or exists(select from public.code_redemptions x
        where x.code_id=c.id and x.status='ok' and x.discount_used_payment_id is null and x.discount_void_at is null
        and (x.discount_expires_at is null or x.discount_expires_at>now())))),'[]'),'bindings',coalesce((select jsonb_object_agg(s.lookup_key,s.price_id) from admin.catalog_stripe_prices s
    where s.product_id=p.product_id and s.revision=p.published_revision),'{}'),'history',
    coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc) from
      (select id,revision,base_revision,reason,status,created_at,actor_id,last_error from admin.catalog_publications where product_id=p_product
       and (created_at,id)<(p_before,p_before_id) order by created_at desc,id desc limit 21) h),'[]')) into result
  from admin.catalog_products p left join admin.catalog_product_versions v on v.product_id=p.product_id and v.revision=p.published_revision
  left join admin.catalog_publications r on r.product_id=p.product_id and r.status in ('draft','prepared')
  left join admin.catalog_product_versions d on d.product_id=p.product_id and d.revision=r.revision where p.product_id=p_product;
  return result;
end $$;
revoke all on function public.admin_catalog_save(uuid,text,integer,uuid,jsonb,text),public.admin_catalog_page(uuid,text),public.admin_catalog_editor(uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.admin_catalog_save(uuid,text,integer,uuid,jsonb,text),public.admin_catalog_page(uuid,text),public.admin_catalog_editor(uuid,text,timestamptz,uuid) to service_role;
