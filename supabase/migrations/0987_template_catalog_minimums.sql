-- Explicit catalogue purpose, controlled by a reviewed migration. No existing tariff approves style sales.
create or replace view admin.template_tariffs_v2 (id, quality, costs, style_sale_approved) as
select id, 'medium'::text, case
  when id = 'edit' then '{"1k":20,"2k":37,"3k":58}'::jsonb
  when id in ('promo-poster','pet-studio','freeform') then '{"1k":45,"2k":120,"3k":190}'::jsonb
  else '{"1k":74,"2k":150,"3k":225}'::jsonb end, false
from unnest(array['dark-dining','delivery-menu','white-background','lifestyle-table','spa-podium',
  'promo-poster','pet-studio','freeform','edit']) id;

-- The sales minimum belongs to the template, independent of its selected route.
-- Only the exact route/quality captured at cutover can waive the separate cost floor.
create or replace function admin.template_catalog_minimums() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(c.id,jsonb_build_object('quality',c.quality,'costs',c.costs,'style_sale_approved',c.style_sale_approved)), '{}')
    from admin.template_tariffs_v2 c
    join admin.template_price_snapshots s on s.template_id=c.id and s.provider_id is not null
    join admin.template_price_batches b on b.id=s.batch_id
    where b.reverted_at is null and admin.is_template_catalog_v2()
$$;
revoke all on function admin.template_catalog_minimums() from public,anon,authenticated;
grant execute on function admin.template_catalog_minimums() to service_role;

create or replace function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id)))
       from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;

-- Keep the cutover's explicit retirements. The final category/route check below
-- runs after legacy category names have resolved and private bindings have been saved.
create or replace function admin.protect_retired_template() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.is_active and admin.is_template_catalog_v2() and exists(
    select 1 from admin.template_price_batches where reverted_at is null
  ) and (new.id in ('bright-listing','evening-glow')
    or exists(select 1 from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
      where b.reverted_at is null and s.template_id=new.id and s.provider_id is null)) then
    raise exception 'TEMPLATE_RETIRED' using detail='此模板未加入已批准的新目录，不能上架';
  end if;
  return new;
end;
$$;

-- Approval comes only from the existing cutover receipt: exact template, route
-- identity, quality and every currently sold tier. A future partial-tier tariff
-- requires its own published tier list; this three-tier catalogue will not infer it.
create or replace function admin.assert_style_sale_route(t public.templates, actual_route text default null)
returns void language plpgsql security definer set search_path='' as $$
declare bound uuid; selected public.ai_providers; quote jsonb; style_authorized boolean;
begin
  if not t.is_active or not admin.is_template_catalog_v2()
      or not exists(select 1 from admin.template_price_batches where reverted_at is null) then return; end if;
  select c.style_sale_approved into style_authorized from admin.template_tariffs_v2 c where c.id=t.id;
  if t.category_key<>'art-styles' and not coalesce(style_authorized,false) then return; end if;
  select tp.provider_id into bound from public.template_prompts tp where tp.template_id=t.id;
  select p.id,p.model,p.is_active into selected.id,selected.model,selected.is_active
    from public.ai_providers p where p.module='image' and (p.id=bound or (bound is null and p.is_active))
    for share;
  quote := admin.template_approved_prices(selected.id)->t.id;
  if not coalesce(style_authorized,false)
      or quote->>'quality' is distinct from t.quality
      or not coalesce((quote->'costs') ?& array['1k','2k','3k'],false)
      or ('partner'=any(t.visible_in) and not selected.is_active)
      or (actual_route is not null and actual_route is distinct from selected.id::text||'/'||selected.model) then
    raise exception 'TEMPLATE_RETIRED' using detail='此画风模板当前模型、质量或销售档位未获批准';
  end if;
end;
$$;
revoke all on function admin.assert_style_sale_route(public.templates,text) from public,anon,authenticated,service_role;

create or replace function admin.check_style_sale_binding() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.templates; template_key text;
begin
  if tg_table_name='templates' then template_key:=new.id; else template_key:=new.template_id; end if;
  select * into t from public.templates where id=template_key and is_active and
    (category_key='art-styles' or exists(select 1 from admin.template_tariffs_v2 c where c.id=template_key and c.style_sale_approved)) for share;
  if found then perform admin.assert_style_sale_route(t); end if;
  return null;
end;
$$;
revoke all on function admin.check_style_sale_binding() from public,anon,authenticated,service_role;
-- An upsert writes templates before its prompt. Validate the final combination,
-- including changes through the older two-argument writer and the bulk editor.
create constraint trigger style_sale_binding after insert or update of category,category_key,quality,is_active,visible_in on public.templates
deferrable initially deferred for each row when (new.is_active)
execute function admin.check_style_sale_binding();
create trigger style_sale_prompt after insert or update of provider_id on public.template_prompts
for each row execute function admin.check_style_sale_binding();

-- Covers ordinary saves, imports and the single-statement bulk writer. Reverting a batch
-- makes its minimums inactive before restoring the old-unit rows.
create or replace function admin.check_catalog_minimums() returns trigger
language plpgsql security definer set search_path='' as $$
declare tariff jsonb; tier text;
begin
  if not admin.is_template_catalog_v2() then return new; end if;
  tariff := admin.template_catalog_minimums()->new.id;
  if tariff is null and new.category_key='art-styles' and exists(select 1 from admin.template_price_batches where reverted_at is null) then
    -- A legacy import may supply the category name only. Its BEFORE trigger fills the key.
    if new.is_active then raise exception 'TEMPLATE_RETIRED' using detail='画风模板尚未开放销售'; end if;
    -- The original cutover retires style rows without rewriting their historic prices.
    if (new.credits_cost->>'1k')::int is distinct from 20 and
        (tg_op='INSERT' or not (old.is_active and not new.is_active and old.credits_cost=new.credits_cost)) then
      raise exception 'MODEL_CREDIT_FLOOR' using detail='画风草稿 Standard 规划收费为 20 积分';
    end if;
  end if;
  if tariff->>'quality'=new.quality then
    foreach tier in array array['1k','2k','3k'] loop
      if (new.credits_cost->>tier)::int < (tariff->'costs'->>tier)::int then
        raise exception 'MODEL_CREDIT_FLOOR' using detail=format('%s %s 不能低于目录收费 %s 积分',new.name,tier,tariff->'costs'->>tier);
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function admin.check_catalog_minimums() from public,anon,authenticated,service_role;
create or replace trigger template_catalog_minimum after insert or update of quality,credits_cost,category,category_key,is_active on public.templates
for each row execute function admin.check_catalog_minimums();

-- Reservation, debit and job insertion are one transaction. Validate the routed model
-- on new v2 jobs only; a rejection rolls every change back (including the ledger).
create or replace function admin.check_style_job_route() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.templates;
begin
  select * into t from public.templates where id=new.template_id and
    (category_key='art-styles' or exists(select 1 from admin.template_tariffs_v2 c where c.id=new.template_id and c.style_sale_approved)) for share;
  if found then perform admin.assert_style_sale_route(t,coalesce(new.provider,'')); end if;
  return new;
end;
$$;
revoke all on function admin.check_style_job_route() from public,anon,authenticated,service_role;
create trigger style_sale_job before insert on public.generation_jobs
for each row when (new.inputs->>'pricing_catalog_version'='v2') execute function admin.check_style_job_route();
