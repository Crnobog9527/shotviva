-- The editor and sync write the template before its private model binding. Check the
-- committed combination, including writes that bypass the editor's quoted floors.
create function admin.check_template_publish_floor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  template_key text;
  t public.templates;
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
  if tg_table_name='templates' then
    if tg_op='UPDATE' and old.is_active and old.credits_cost=new.credits_cost
        and old.quality=new.quality then return null; end if;
    template_key := new.id;
  elsif tg_op='DELETE' then
    template_key := old.template_id;
  else
    if tg_op='UPDATE' and old.provider_id is not distinct from new.provider_id then return null; end if;
    template_key := new.template_id;
  end if;
  select * into t from public.templates where id=template_key for share;
  if not found or not t.is_active then return null; end if;
  if t.id<>'edit' then
    select provider_id into bound from public.template_prompts where template_id=t.id for share;
  end if;
  -- Keep model selection and its configured estimate stable through this commit.
  select id, id::text||'/'||model, resolutions into bound,route_tag,supported from public.ai_providers
    where module='image' and (id=bound or (bound is null and is_active)) for share;
  approved := admin.template_approved_prices(bound)->t.id;

  -- With no database provider the server uses its OpenAI environment model. SQL cannot
  -- see that setting. Take the highest eligible model p95 per tier in that case.
  if bound is null then
    budget := admin.lowest_credit_price()*0.761*0.4;
    select jsonb_object_agg(r, cost) into env_p95 from (
      select r, max(p95) cost from (
        select provider, coalesce(inputs->>'resolution','1k') r,
          percentile_cont(0.95) within group (order by cost_usd) p95
        from public.generation_jobs where provider like 'env/%' and status='succeeded'
          and cost_usd is not null and created_at >= now()-interval '30 days'
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
    if approved->>'quality'=t.quality and approved->'costs'->tier=t.credits_cost->tier then continue; end if;
    -- T96 never sells unsupported resolutions on this model. Those fields keep
    -- their existing positive placeholder; fallback reservations have their own check.
    if bound is not null then
      if not (tier=any(supported)) or admin.alternate_route_meets_floor(route_tag,tier,t.quality,(t.credits_cost->>tier)::int)
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
  return null;
end;
$$;
revoke all on function admin.check_template_publish_floor() from public,anon,authenticated,service_role;

create constraint trigger template_publish_floor after insert or update of is_active,credits_cost,quality on public.templates
deferrable initially deferred for each row when (new.is_active) execute function admin.check_template_publish_floor();
create constraint trigger prompt_publish_floor after insert or update of provider_id or delete on public.template_prompts
deferrable initially deferred for each row execute function admin.check_template_publish_floor();
