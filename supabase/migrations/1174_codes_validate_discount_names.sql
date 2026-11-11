-- Fix (T105 phase 2): 1127's public._validate_code_discount declared plpgsql variables named
-- `cents` and `credits`, the same names as admin.catalog_candidate's output columns, so its v2
-- branch failed with "column reference "cents" is ambiguous" and admin_save_code could neither
-- create nor edit any campaign code. Same body; the variables are renamed v_cents / v_credits.
create or replace function public._validate_code_discount(
  p_products text[], p_percent integer, p_catalog jsonb, p_floor_product_id text
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  entry record;
  v_cents numeric;
  v_credits numeric;
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
    v_cents := (entry.item->>'priceCents')::numeric;
    v_credits := (entry.item->>'credits')::numeric;
    if v_cents <= 0 or v_cents <> trunc(v_cents) or v_cents > 9007199254740991
      or v_credits <= 0 or v_credits <> trunc(v_credits) or v_credits > 2147483647 then
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
