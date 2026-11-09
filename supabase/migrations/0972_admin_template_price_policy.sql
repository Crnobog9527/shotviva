-- Return only precise approved tariffs for the concrete routing identity captured at cutover.
create function admin.template_approved_prices(p_provider uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(s.template_id,jsonb_build_object('quality',c.quality,'costs',c.costs)), '{}')
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers p on p.id=s.provider_id
  where b.reverted_at is null and admin.is_template_catalog_v2() and p.id=p_provider
    and p.module='image' and p.adapter='openai_images' and p.model='gpt-image-2.6-sunburst'
    and md5(p.base_url) is not distinct from s.provider_endpoint_hash
    and (p.capabilities->'resolutions') ?& array['1k','2k','3k']
$$;
revoke all on function admin.template_approved_prices(uuid) from public,anon,authenticated;
grant execute on function admin.template_approved_prices(uuid) to service_role;

create function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',(select min(price_usd/credits) from public.products where active and credits>0),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id)))
       from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;
revoke all on function public.admin_image_pricing_catalog(text) from public,anon,authenticated;
grant execute on function public.admin_image_pricing_catalog(text) to service_role;

create function admin.protect_retired_template() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_active and admin.is_template_catalog_v2() and exists(
    select 1 from admin.template_price_batches where reverted_at is null
  ) and (new.category_key='art-styles' or new.id in ('bright-listing','evening-glow')
    or exists(select 1 from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
      where b.reverted_at is null and s.template_id=new.id and s.provider_id is null)) then
    raise exception 'TEMPLATE_RETIRED' using detail='此模板未加入已批准的新目录，不能上架';
  end if;
  return new;
end;
$$;
revoke all on function admin.protect_retired_template() from public,anon,authenticated,service_role;
create trigger template_retirement_check before insert or update of is_active, category_key on public.templates
for each row when (new.is_active) execute function admin.protect_retired_template();
