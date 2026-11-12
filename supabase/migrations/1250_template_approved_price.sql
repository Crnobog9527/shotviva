-- One template's approved price on one provider, the same entry template_approved_prices()
-- keys by template id. The sale checks read a single template; aggregating every snapshot
-- of the batch for each one made a catalogue read quadratic in the number of templates.
-- At most one batch is unreverted (template_price_one_batch) and a batch holds a template
-- once, so this returns that row's object, or null where the aggregate has no key.
create function admin.template_approved_price(p_provider uuid, p_template text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('quality',c.quality,'costs',c.costs)
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers p on p.id=s.provider_id
  where b.reverted_at is null and admin.is_template_catalog_v2() and p.id=p_provider and s.template_id=p_template
    and p.module='image' and p.adapter='openai_images' and p.model='gpt-image-2.6-sunburst'
    and md5(p.base_url) is not distinct from s.provider_endpoint_hash
    and (p.capabilities->'resolutions') ?& array['1k','2k','3k']
$$;
revoke all on function admin.template_approved_price(uuid,text) from public,anon,authenticated;
grant execute on function admin.template_approved_price(uuid,text) to service_role;

-- Same checks as 1172, reading the single entry instead of the whole batch.
create or replace function admin.reservation_route_allowed(t public.templates, route text, tier text,
  price integer, fallback boolean, v2 boolean) returns boolean
language plpgsql stable set search_path='' as $$
begin
  if fallback or exists (
    select from public.template_prompts tp join public.ai_providers p on p.id=tp.provider_id
    where tp.template_id=t.id and route is distinct from p.id::text||'/'||p.model
  ) then
    if not coalesce(price>=admin.fallback_route_floor(route,tier,t.quality),false) then return false; end if;
  end if;
  if v2 and exists (
    select from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
    join admin.template_tariffs_v2 c on c.id=s.template_id
    where b.reverted_at is null and s.template_id=t.id and c.quality=t.quality
      and c.costs->tier=t.credits_cost->tier and
      (route is distinct from s.provider_id::text||'/gpt-image-2.6-sunburst'
        or admin.template_approved_price(s.provider_id,t.id) is null)
  ) then return admin.alternate_route_meets_floor(route,tier,t.quality,price); end if;
  return true;
end $$;

create or replace function admin.job_route_allowed(t public.templates, route text, tier text,
  price integer, v2 boolean) returns boolean language plpgsql stable set search_path='' as $$
declare sale public.template_sale_approvals; p public.ai_providers; approved jsonb;
begin
  select * into sale from public.template_sale_approvals where template_id=t.id;
  if tier=any(sale.unpriced_resolutions) then return false; end if;
  if not v2 then return true; end if;
  if not coalesce(sale.enabled,false) then return false; end if;
  if route like 'env/_%' then
    return coalesce(price>=admin.fallback_route_floor(route,tier,t.quality),false);
  end if;
  select * into p from public.ai_providers
    where module='image' and id::text=split_part(route,'/',1) and id::text||'/'||model=route;
  if not found or not (tier=any(admin.sale_route_resolutions(p))) then return false; end if;
  approved:=admin.template_approved_price(p.id,t.id);
  if approved->>'quality'=t.quality and (approved->'costs'->>tier)::int=price then return true; end if;
  return admin.alternate_route_meets_floor(route,tier,t.quality,price);
end $$;
