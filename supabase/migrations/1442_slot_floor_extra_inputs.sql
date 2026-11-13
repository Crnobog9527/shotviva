-- The floor of a template with named image slots (§5.1e), replacing 1310's "single-image floor ×
-- slots": a slot job still outputs ONE image; what it adds is input images. Per route, resolution
-- and the template's quality, for a template with n slots (n >= 2), the first that applies:
--   1. at least ten succeeded slot jobs in 30 days that filled all n slots: their cost p95
--      (never below the single-image floor);
--   2. the route's extra_input_image_usd (1440, set by the admin per model): the single-image floor
--      + ceil((n-1) × extra × 1.10 / credit budget);
--   3. neither (or a route with no model row, such as the environment model): single floor × n, as
--      before, so missing data never makes a template cheaper.
-- A template with 0 or 1 slots keeps the single-image floor. The same four checks as 1310 call it
-- (reservation, job, save, the hidden-template report), and the editor's pricing read
-- (admin_image_pricing_catalog) carries what it needs per route (slot_costs), so the admin shows
-- and checks the same number. Route p95s still leave slot jobs out (1310).

create function admin.slot_route_floor(p_tag text, p_resolution text, p_quality text, p_slots integer, p_single integer)
returns integer language sql stable set search_path='' as $$
  with budget as (select admin.lowest_credit_price()*0.761*0.4 as usd),
  full_slots as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs->>'resolution'=p_resolution
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
        and jsonb_typeof(g.inputs->'input_slots')='array' and jsonb_array_length(g.inputs->'input_slots')=p_slots
      having count(*)>=10
  ), extra as (
    select p.extra_input_image_usd as usd from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag
  )
  select case
    when p_single is null then null
    when coalesce(p_slots,0)<=1 then p_single
    when b.usd is null or b.usd<=0 then p_single*p_slots
    when (select usd from full_slots) is not null then greatest(p_single, ceil((select usd from full_slots)*1.10/b.usd)::int)
    when (select usd from extra) is not null then p_single+ceil((p_slots-1)*(select usd from extra)*1.10/b.usd)::int
    else p_single*p_slots end
  from budget b
$$;
revoke all on function admin.slot_route_floor(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function admin.slot_route_floor(text,text,text,integer,integer) to service_role;

-- The floor a template's price must cover on a route, given that route's single-image floor.
create function admin.slot_floor_credits(t public.templates, p_tag text, p_resolution text, p_single integer)
returns integer language sql stable set search_path='' as $$
  select admin.slot_route_floor(p_tag, p_resolution, t.quality,
    case when jsonb_typeof(t.fields->'images'->'slots')='array' then jsonb_array_length(t.fields->'images'->'slots') else 0 end,
    p_single)
$$;
revoke all on function admin.slot_floor_credits(public.templates,text,text,integer) from public,anon,authenticated;
grant execute on function admin.slot_floor_credits(public.templates,text,text,integer) to service_role;

-- What the editor needs to compute the same slot floor: the model's extra input cost and, per
-- quality, resolution and number of filled slots (2–4), the p95 of at least ten full-slot jobs.
create function admin.route_slot_costs(p_tag text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'extra_input_usd', (select p.extra_input_image_usd from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1) and p.id::text||'/'||p.model=p_tag),
    'p95_full', coalesce((select jsonb_object_agg(quality,tiers) from (
      select quality, jsonb_object_agg(res,slots) tiers from (
        select quality, res, jsonb_object_agg(n::text,cost) slots from (
          select g.inputs->>'quality' quality, g.inputs->>'resolution' res, jsonb_array_length(g.inputs->'input_slots') n,
            percentile_cont(0.95) within group (order by g.cost_usd) cost
          from public.generation_jobs g
          where g.provider=p_tag and g.inputs->>'quality' in ('medium','high') and g.inputs->>'resolution' in ('1k','2k','3k')
            and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
            and jsonb_typeof(g.inputs->'input_slots')='array' and jsonb_array_length(g.inputs->'input_slots') between 2 and 4
          group by 1,2,3 having count(*)>=10
        ) per_n group by quality, res
      ) per_res group by quality
    ) per_quality),'{}'::jsonb))
$$;
revoke all on function admin.route_slot_costs(text) from public,anon,authenticated;
grant execute on function admin.route_slot_costs(text) to service_role;

-- 1295, plus slot_costs per route.
create or replace function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id))
      || jsonb_build_object('p95_by_quality',admin.route_p95_by_quality(coalesce(p.provider_id::text,'env')||'/'||p.model))
      || jsonb_build_object('slot_costs',admin.route_slot_costs(coalesce(p.provider_id::text,'env')||'/'||p.model))
      || case when p.is_active then jsonb_build_object('fallback_floors',(
        select jsonb_object_agg(quality,tiers) from (
          select quality,jsonb_object_agg(res,admin.fallback_route_floor(coalesce(p.provider_id::text,'env')||'/'||p.model,res,quality)) tiers
          from unnest(array['medium','high']) quality cross join unnest(array['1k','2k','3k']) res group by quality
        ) grouped)) else '{}'::jsonb end)
      from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;

create or replace function admin.reservation_route_allowed(t public.templates, route text, tier text,
  price integer, fallback boolean, v2 boolean) returns boolean
language plpgsql stable set search_path='' as $$
begin
  if fallback or exists (
    select from public.template_prompts tp join public.ai_providers p on p.id=tp.provider_id
    where tp.template_id=t.id and route is distinct from p.id::text||'/'||p.model
  ) then
    if not coalesce(price>=admin.slot_floor_credits(t,route,tier,admin.fallback_route_floor(route,tier,t.quality)::int),false) then return false; end if;
  end if;
  if v2 and exists (
    select from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
    join admin.template_tariffs_v2 c on c.id=s.template_id
    where b.reverted_at is null and s.template_id=t.id and c.quality=t.quality
      and c.costs->tier=t.credits_cost->tier and
      (route is distinct from s.provider_id::text||'/gpt-image-2.6-sunburst'
        or not (admin.template_approved_prices(s.provider_id) ? t.id))
  ) then return coalesce(price>=admin.slot_floor_credits(t,route,tier,(admin.alternate_route_floor(route,tier,t.quality)->>'credits')::int),false); end if;
  return true;
end $$;

-- 1310 with the slot floor below. An approved price for this template still stands.
create or replace function admin.job_route_allowed(t public.templates, route text, tier text,
  price integer, v2 boolean) returns boolean language plpgsql stable set search_path='' as $$
declare sale public.template_sale_approvals; p public.ai_providers; approved jsonb;
begin
  select * into sale from public.template_sale_approvals where template_id=t.id;
  if tier=any(sale.unpriced_resolutions) then return false; end if;
  if not v2 then return true; end if;
  if not coalesce(sale.enabled,false) then return false; end if;
  if route like 'env/_%' then
    return coalesce(price>=admin.slot_floor_credits(t,route,tier,admin.fallback_route_floor(route,tier,t.quality)::int),false);
  end if;
  select * into p from public.ai_providers
    where module='image' and id::text=split_part(route,'/',1) and id::text||'/'||model=route;
  if not found or not (tier=any(admin.sale_route_resolutions(p))) then return false; end if;
  approved:=admin.template_approved_price(p.id,t.id);
  if approved->>'quality'=t.quality and (approved->'costs'->>tier)::int=price then return true; end if;
  return coalesce(price>=admin.slot_floor_credits(t,route,tier,(admin.alternate_route_floor(route,tier,t.quality)->>'credits')::int),false);
end $$;

-- 1310 with the slot floor below (single-image samples at save).
create or replace function admin.assert_template_sale_floor(t public.templates) returns void
language plpgsql security definer set search_path='' as $$
declare
  bound uuid;
  route_tag text;
  supported text[];
  approved jsonb;
  tier text;
  budget numeric;
  usd numeric;
  openai_min jsonb;
  openai_usd jsonb;
  env_p95 jsonb;
begin
  if exists(select from public.template_sale_approvals s where s.template_id=t.id and s.unpriced_resolutions @> array['1k','2k','3k']) then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='请先为至少一个可售档位定价'; end if;
  if t.id<>'edit' then
    select provider_id into bound from public.template_prompts where template_id=t.id for share;
  end if;
  -- Keep model selection and its configured estimate stable through this commit.
  select p.id,p.id::text||'/'||p.model,admin.sale_route_resolutions(p) into bound,route_tag,supported
    from public.ai_providers p where p.module='image' and (p.id=bound or (bound is null and p.is_active)) for share;
  if bound is not null and cardinality(supported)=0 then
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail='所选模型的可用档位尚未确认'; end if;
  approved := admin.template_approved_prices(bound)->t.id;

  -- With no database provider the server uses its OpenAI environment model. SQL cannot
  -- see that setting. Take the highest eligible model p95 per tier in that case, at the
  -- template's own quality (1295).
  if bound is null then
    budget := admin.lowest_credit_price()*0.761*0.4;
    select jsonb_object_agg(r, cost) into env_p95 from (
      select r, max(p95) cost from (
        select provider, coalesce(inputs->>'resolution','1k') r,
          percentile_cont(0.95) within group (order by cost_usd) p95
        from public.generation_jobs where provider like 'env/%' and status='succeeded'
          and cost_usd is not null and created_at >= now()-interval '30 days'
          and inputs ? 'quality' and inputs->>'quality'=t.quality and not (inputs ? 'input_slots')
        group by 1,2 having count(*)>=10
      ) per_model group by r
    ) per_tier;
  end if;
  if t.quality='medium' then
    openai_min := '{"1k":1,"2k":2,"3k":3}'; openai_usd := '{"1k":0.055,"2k":0.095,"3k":0.135}';
  else
    openai_min := '{"1k":2,"2k":4,"3k":6}'; openai_usd := '{"1k":0.081,"2k":0.135,"3k":0.206}';
  end if;
  foreach tier in array array['1k','2k','3k'] loop
    if exists(select from public.template_sale_approvals s where s.template_id=t.id and tier=any(s.unpriced_resolutions)) then continue; end if;
    if approved->>'quality'=t.quality and approved->'costs'->tier=t.credits_cost->tier then continue; end if;
    -- T96 never sells unsupported resolutions on this model. Those fields keep
    -- their existing positive placeholder; fallback reservations have their own check.
    if bound is not null then
      if not (tier=any(supported)) or coalesce((t.credits_cost->>tier)::int>=admin.slot_floor_credits(t,route_tag,tier,(admin.alternate_route_floor(route_tag,tier,t.quality)->>'credits')::int),false)
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= admin.slot_floor_credits(t,'env/unknown',tier,greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)::int)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
end;
$$;

-- 1295; the alert and admin list show the floor a slot template is held to.
create or replace function admin.sale_floor_hidden() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  m record; t public.templates; sale public.template_sale_approvals; p public.ai_providers;
  route text; reason text; floor jsonb; result jsonb:='[]'::jsonb;
begin
  for m in select pm.id from admin.published_web_members pm order by pm.id loop
    if admin.web_standard_sale_allowed(m.id) then continue; end if;
    select * into t from public.templates where id=m.id;
    select * into sale from public.template_sale_approvals where template_id=m.id;
    route:=null; floor:=null; p:=null;
    select a.id::text||'/'||a.model into route from public.ai_providers a where a.module='image' and
      a.id=coalesce((select tp.provider_id from public.template_prompts tp where tp.template_id=t.id and t.id<>'edit'),
                    (select b.id from public.ai_providers b where b.module='image' and b.is_active));
    if not coalesce(sale.enabled,false) then reason:='sale_closed';
    elsif '1k'=any(sale.unpriced_resolutions) then reason:='unpriced';
    elsif route is null then reason:='no_route';
    else
      select * into p from public.ai_providers a where a.module='image' and a.id::text||'/'||a.model=route;
      if not ('1k'=any(admin.sale_route_resolutions(p))) then reason:='route_unsupported';
      else reason:='below_floor'; floor:=admin.alternate_route_floor(route,'1k',t.quality);
        -- A slot template's floor (slot_floor_credits); report the floor its price is held to.
        if admin.slot_floor_factor(t)>1 then
          floor:=floor||jsonb_build_object('slots',admin.slot_floor_factor(t),'credits',admin.slot_floor_credits(t,route,'1k',(floor->>'credits')::int));
        end if;
      end if;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('template_id',t.id,'quality',t.quality,
      'price',(t.credits_cost->>'1k')::int,'route',route,'reason',reason,'floor',floor));
  end loop;
  return result;
end $$;
