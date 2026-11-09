-- The sales minimum belongs to the template, independent of its selected route.
-- Only the exact route/quality captured at cutover can waive the separate cost floor.
create or replace function admin.template_catalog_minimums() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(c.id,jsonb_build_object('quality',c.quality,'costs',c.costs)), '{}')
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

-- Covers ordinary saves, imports and the single-statement bulk writer. Reverting a batch
-- makes its minimums inactive before restoring the old-unit rows.
create or replace function admin.check_catalog_minimums() returns trigger
language plpgsql security definer set search_path='' as $$
declare tariff jsonb; tier text;
begin
  if not admin.is_template_catalog_v2() then return new; end if;
  if new.category_key='art-styles' and exists(select 1 from admin.template_price_batches where reverted_at is null)
      and (new.credits_cost->>'1k')::int is distinct from 20 then
    -- The original cutover retires style rows without rewriting their historic prices.
    if tg_op='INSERT' or not (old.is_active and not new.is_active and old.credits_cost=new.credits_cost) then
      raise exception 'MODEL_CREDIT_FLOOR' using detail='画风草稿 Standard 规划收费为 20 积分';
    end if;
  end if;
  tariff := admin.template_catalog_minimums()->new.id;
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
create or replace trigger template_catalog_minimum after insert or update of quality,credits_cost,category_key on public.templates
for each row execute function admin.check_catalog_minimums();
