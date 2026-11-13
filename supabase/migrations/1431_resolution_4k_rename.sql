-- PR-2 of 1K / 2K / 4K, [contract] (Owner: 「做」, 2026-11-14). The database renames the stored top
-- tier from 3k to 4k: the name the site has used since #534 behind the app's fetch shim.
--
-- One transaction, so data, checks, functions and triggers switch together: a request never sees
-- 4k data with a 3k function or the other way round.
--   1. Stored tier ids and tier keys become 4k: templates.credits_cost, ai_providers.resolutions /
--      capabilities / estimated_image_costs, template_sale_approvals.unpriced_resolutions, the price
--      batch snapshots, and the admin test-run and prompt-lab history. The NUMBERS ARE UNCHANGED:
--      each value moves from key 3k to key 4k. generation_jobs.inputs (user history, hot table)
--      keeps 3k; every query over it reads 3k and 4k as one tier (public.resolution_aliases /
--      canonical_resolution).
--      User triggers on these tables are off for the rename only: it changes names, never prices,
--      so no floor check or updated_at bump should run (re-enabled at the end).
--   2. Checks and defaults name 4k.
--   3. Every SQL function and view that named 3k now names 4k; the price, floor and tariff
--      numbers are copied as they were (only the key changed). Functions that take a tier from a
--      caller read 3k as 4k at entry.
--   4. "aa_canonical_tiers" BEFORE triggers (named to run first) turn a 3k written by anyone into
--      4k, so the code deployed before this one (which still sends 3k through its shim) keeps
--      working: every write path accepts both names until the shim is removed.
-- admin_save_provider is not rewritten: it only copies tiers into ai_providers, whose trigger
-- renames them.

-- 1. The rename, with user triggers off.
alter table public.templates disable trigger user;
alter table public.ai_providers disable trigger user;
alter table public.template_sale_approvals disable trigger user;
alter table public.admin_test_runs disable trigger user;
alter table public.prompt_lab_runs disable trigger user;
alter table admin.template_price_snapshots disable trigger user;

alter table public.templates drop constraint templates_credits_cost_check;
alter table public.ai_providers drop constraint ai_providers_resolutions_check;
alter table public.ai_providers drop constraint ai_providers_estimated_image_costs_check;
alter table public.template_sale_approvals drop constraint template_sale_approvals_unpriced_resolutions_check;
alter table public.admin_test_runs drop constraint admin_test_runs_resolution_check;
alter table public.prompt_lab_runs drop constraint prompt_lab_runs_resolution_check;

update public.templates set credits_cost = public.canonical_tiers(credits_cost) where credits_cost ? '3k';
update public.ai_providers set resolutions = public.canonical_tier_array(resolutions),
    capabilities = public.canonical_tiers(capabilities), estimated_image_costs = public.canonical_tiers(estimated_image_costs)
  where '3k' = any(resolutions) or capabilities::text like '%"3k"%' or estimated_image_costs ? '3k';
update public.template_sale_approvals set unpriced_resolutions = public.canonical_tier_array(unpriced_resolutions)
  where '3k' = any(unpriced_resolutions);
update public.admin_test_runs set resolution = '4k' where resolution = '3k';
update public.prompt_lab_runs set resolution = '4k' where resolution = '3k';
update admin.template_price_snapshots set previous = public.canonical_tiers(previous), applied = public.canonical_tiers(applied)
  where previous::text like '%"3k"%' or applied::text like '%"3k"%';

-- 2. Checks and defaults (same definitions, 4k for 3k).
alter table public.templates add constraint templates_credits_cost_check check (
  jsonb_typeof(credits_cost) = 'object'
  and credits_cost ?& array['1k', '2k', '4k']
  and credits_cost - '1k' - '2k' - '4k' = '{}'::jsonb
  and jsonb_typeof(credits_cost -> '1k') = 'number' and (credits_cost ->> '1k') ~ '^[1-9][0-9]{0,2}$'
  and jsonb_typeof(credits_cost -> '2k') = 'number' and (credits_cost ->> '2k') ~ '^[1-9][0-9]{0,2}$'
  and jsonb_typeof(credits_cost -> '4k') = 'number' and (credits_cost ->> '4k') ~ '^[1-9][0-9]{0,2}$');
alter table public.templates alter column credits_cost set default '{"1k": 2, "2k": 4, "4k": 6}'::jsonb;
alter table public.ai_providers add constraint ai_providers_resolutions_check check (
  cardinality(resolutions) > 0 and array_ndims(resolutions) = 1 and resolutions <@ array['1k', '2k', '4k']);
alter table public.ai_providers alter column resolutions set default '{1k,2k,4k}'::text[];
alter table public.ai_providers add constraint ai_providers_estimated_image_costs_check check (
  jsonb_typeof(estimated_image_costs) = 'object'
  and estimated_image_costs - array['1k', '2k', '4k'] = '{}'::jsonb
  and not jsonb_path_exists(estimated_image_costs, '$.*?(@.type() != "number" || @ <= 0)'));
alter table public.template_sale_approvals add constraint template_sale_approvals_unpriced_resolutions_check check (
  unpriced_resolutions <@ array['1k', '2k', '4k'] and array_position(unpriced_resolutions, null) is null);
alter table public.admin_test_runs add constraint admin_test_runs_resolution_check check (resolution = any (array['1k', '2k', '4k']));
alter table public.prompt_lab_runs add constraint prompt_lab_runs_resolution_check check (resolution = any (array['1k', '2k', '4k']));

-- 3. Functions and the v2 tariff view: 3k became 4k, numbers as they were.
CREATE OR REPLACE VIEW "admin"."template_tariffs_v2" AS
 SELECT "id",
    'medium'::"text" AS "quality",
        CASE
            WHEN ("id" = 'edit'::"text") THEN '{"1k": 20, "2k": 37, "4k": 58}'::"jsonb"
            WHEN ("id" = ANY (ARRAY['promo-poster'::"text", 'pet-studio'::"text", 'freeform'::"text"])) THEN '{"1k": 45, "2k": 120, "4k": 190}'::"jsonb"
            ELSE '{"1k": 74, "2k": 150, "4k": 225}'::"jsonb"
        END AS "costs",
    false AS "style_sale_approved"
   FROM "unnest"(ARRAY['dark-dining'::"text", 'delivery-menu'::"text", 'white-background'::"text", 'lifestyle-table'::"text", 'spa-podium'::"text", 'promo-poster'::"text", 'pet-studio'::"text", 'freeform'::"text", 'edit'::"text"]) "id"("id");

CREATE OR REPLACE FUNCTION "admin"."sale_route_resolutions"("p" "public"."ai_providers") RETURNS "text"[]
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select array(select r from unnest(coalesce(p.resolutions,array['1k','2k','4k'])) r
    where p.adapter is distinct from 'openrouter_images' or (p.capabilities->'resolutions') ? r)
$$;

CREATE OR REPLACE FUNCTION "admin"."set_template_unpriced_resolutions"("p_id" "text", "p_unpriced" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare t public.templates; supported text[]; previous text[]; next_unpriced text[];
begin
  -- 3k from a caller still on the old name (the app's fetch shim) is read as 4k (1431).
  p_unpriced := public.canonical_tier_array(p_unpriced);
  select * into strict t from public.templates where id=p_id for update;
  select admin.sale_route_resolutions(p) into supported
    from public.templates x left join public.template_prompts tp on tp.template_id=x.id
    left join public.ai_providers p on p.id=coalesce(case when x.id<>'edit' then tp.provider_id end,
      (select a.id from public.ai_providers a where a.module='image' and a.is_active)) where x.id=p_id;
  select unpriced_resolutions into previous from public.template_sale_approvals where template_id=p_id;
  next_unpriced:=coalesce(p_unpriced, previous, array(select tier from unnest(array['1k','2k','4k']) tier where tier<>all(supported)));
  if not (next_unpriced <@ array['1k','2k','4k']) or array_position(next_unpriced,null) is not null or exists(
    select from unnest(coalesce(previous,array['1k','2k','4k'])) tier where tier<>all(next_unpriced) and tier<>all(supported))
  then raise exception 'MODEL_CHANGED'; end if;
  if next_unpriced is not distinct from previous then return; end if;
  insert into public.template_sale_approvals(template_id,unpriced_resolutions) values(p_id,next_unpriced)
    on conflict(template_id) do update set unpriced_resolutions=excluded.unpriced_resolutions;
  if previous is not null and not(previous <@ next_unpriced) then perform admin.assert_template_sale_floor(t); end if;
end;
$$;

CREATE OR REPLACE FUNCTION "admin"."fallback_route_floor"("p_tag" "text", "p_resolution" "text", "p_quality" "text") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with route as (
    select p.adapter, p.estimated_image_costs, p.capabilities
      from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1)
        and p_tag=p.id::text||'/'||p.model and public.canonical_resolution(p_resolution)=any(p.resolutions)
        and (p.adapter='openai_images' or p.capabilities<>'{}'::jsonb)
    union all
    select 'openai_images','{}'::jsonb,'{}'::jsonb where p_tag like 'env/_%'
  ), measured as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs->>'resolution' = any(public.resolution_aliases(p_resolution))
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null
        and g.created_at>=now()-interval '30 days' and not (g.inputs ? 'input_slots')
      having count(*)>=10
  ), priced as (
    select adapter, greatest(
      (select usd from measured), (estimated_image_costs->>public.canonical_resolution(p_resolution))::numeric,
      case when jsonb_typeof(capabilities->'catalogImageCosts'->public.canonical_resolution(p_resolution))='number'
        then nullif((capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric,0) end,
      case when adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"4k":0.135}'
          else '{"1k":0.081,"2k":0.135,"4k":0.206}' end)::jsonb->>public.canonical_resolution(p_resolution))::numeric end
    ) as usd from route
  ), budget as (select admin.lowest_credit_price()*0.761*0.4 as usd)
  select greatest(1,ceil(priced.usd*1.10/budget.usd),
    case when adapter='openai_images' then
      ((case when p_quality='medium' then '{"1k":1,"2k":2,"4k":3}'
        else '{"1k":2,"2k":4,"4k":6}' end)::jsonb->>public.canonical_resolution(p_resolution))::int end)
    from priced,budget where priced.usd is not null and budget.usd>0
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k') and p_quality in ('medium','high')
$$;

CREATE OR REPLACE FUNCTION "admin"."alternate_route_floor"("p_tag" "text", "p_resolution" "text", "p_quality" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with route as (
    select p.adapter, p.capabilities, p.estimated_image_costs
    from public.ai_providers p
    where p.module='image' and p.id::text||'/'||p.model=p_tag
      and p.resolutions @> array[public.canonical_resolution(p_resolution)] and p.capabilities<>'{}'::jsonb
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k')
  ), measured as (
    select count(*) as n, percentile_cont(0.95) within group (order by g.cost_usd) as p95
    from public.generation_jobs g
    where g.provider=p_tag and g.inputs->>'resolution' = any(public.resolution_aliases(p_resolution))
      and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
      and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
      and not (g.inputs ? 'input_slots')
  ), sources as (
    select r.adapter, m.n,
      -- Through jsonb as admin_image_provider_pricing returns it, so the rounding is unchanged.
      case when m.n>=10 then (to_jsonb(m.p95) #>> '{}')::numeric end as p95,
      (r.estimated_image_costs->>public.canonical_resolution(p_resolution))::numeric as estimate,
      case when r.adapter='openrouter_images' and jsonb_typeof(r.capabilities->'catalogImageCosts'->public.canonical_resolution(p_resolution))='number'
        and (r.capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric > 0
        then (r.capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric end as catalog,
      case when r.adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"4k":0.135}'
                    else '{"1k":0.081,"2k":0.135,"4k":0.206}' end)::jsonb->>public.canonical_resolution(p_resolution))::numeric end as list
    from route r cross join measured m
  ), priced as (
    select adapter, n, coalesce(p95,estimate,catalog,list) as usd,
      case when p95 is not null then 'p95' when estimate is not null then 'estimate'
           when catalog is not null then 'catalog' when list is not null then 'list' end as basis
    from sources
  ), budget as (
    select admin.lowest_credit_price()*0.761*0.4 as usd
  )
  select jsonb_build_object('usd',priced.usd,'basis',priced.basis,'samples',priced.n,
    'credits',case when priced.usd is not null and budget.usd>0 then greatest(
      ceil(priced.usd*1.10/budget.usd)::int,
      case when priced.adapter='openai_images' then (case when p_quality='medium' then
        '{"1k":1,"2k":2,"4k":3}' else '{"1k":2,"2k":4,"4k":6}' end::jsonb->>public.canonical_resolution(p_resolution))::int else 0 end) end)
  from priced, budget
$$;

CREATE OR REPLACE FUNCTION "admin"."route_p95_by_quality"("p_tag" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_object_agg(quality,tiers),'{}'::jsonb) from (
    select quality,jsonb_object_agg(res,cost) tiers from (
      -- Jobs before 1431 say 3k for the same tier as 4k: one sample set.
      select g.inputs->>'quality' quality, public.canonical_resolution(g.inputs->>'resolution') res,
        percentile_cont(0.95) within group (order by g.cost_usd) cost
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs ? 'quality' and g.inputs->>'quality' in ('medium','high')
        and g.inputs->>'resolution' in ('1k','2k','3k','4k')
        and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
        and not (g.inputs ? 'input_slots')
      group by 1,2 having count(*)>=10
    ) per_tier group by quality
  ) per_quality
$$;

CREATE OR REPLACE FUNCTION "admin"."check_catalog_minimums"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare tariff jsonb; tier text;
begin
  if not admin.is_template_catalog_v2() then return new; end if;
  tariff := admin.template_catalog_minimums()->new.id;
  if tariff->>'quality'=new.quality then
    foreach tier in array array['1k','2k','4k'] loop
      if (new.credits_cost->>tier)::int < (tariff->'costs'->>tier)::int then
        raise exception 'MODEL_CREDIT_FLOOR' using detail=format('%s %s 不能低于目录收费 %s 积分',new.name,tier,tariff->'costs'->>tier);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "admin"."assert_template_sale_floor"("t" "public"."templates") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if exists(select from public.template_sale_approvals s where s.template_id=t.id and s.unpriced_resolutions @> array['1k','2k','4k']) then
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
        -- Jobs before 1431 say 3k for the same tier as 4k: one sample set.
        select provider, public.canonical_resolution(coalesce(inputs->>'resolution','1k')) r,
          percentile_cont(0.95) within group (order by cost_usd) p95
        from public.generation_jobs where provider like 'env/%' and status='succeeded'
          and cost_usd is not null and created_at >= now()-interval '30 days'
          and inputs ? 'quality' and inputs->>'quality'=t.quality and not (inputs ? 'input_slots')
        group by 1,2 having count(*)>=10
      ) per_model group by r
    ) per_tier;
  end if;
  if t.quality='medium' then
    openai_min := '{"1k":1,"2k":2,"4k":3}'; openai_usd := '{"1k":0.055,"2k":0.095,"4k":0.135}';
  else
    openai_min := '{"1k":2,"2k":4,"4k":6}'; openai_usd := '{"1k":0.081,"2k":0.135,"4k":0.206}';
  end if;
  foreach tier in array array['1k','2k','4k'] loop
    if exists(select from public.template_sale_approvals s where s.template_id=t.id and tier=any(s.unpriced_resolutions)) then continue; end if;
    if approved->>'quality'=t.quality and approved->'costs'->tier=t.credits_cost->tier then continue; end if;
    -- T96 never sells unsupported resolutions on this model. Those fields keep
    -- their existing positive placeholder; fallback reservations have their own check.
    if bound is not null then
      if not (tier=any(supported)) or admin.alternate_route_meets_floor(route_tag,tier,t.quality,(t.credits_cost->>tier)::int/admin.slot_floor_factor(t))
          then continue; end if;
    else
      usd := coalesce((env_p95->>tier)::numeric,(openai_usd->>tier)::numeric);
      if budget>0 and (t.credits_cost->>tier)::int >= greatest(ceil(usd*1.10/budget),(openai_min->>tier)::int)*admin.slot_floor_factor(t)
          then continue; end if;
    end if;
    raise exception 'TEMPLATE_PRICE_BELOW_FLOOR' using detail=format('模板 %s 的 %s 售价低于模型成本下限或缺少报价，请刷新报价后再保存。',t.id,tier);
  end loop;
end;
$$;

CREATE OR REPLACE FUNCTION "admin"."template_approved_price"("p_provider" "uuid", "p_template" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('quality',c.quality,'costs',c.costs)
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers p on p.id=s.provider_id
  where b.reverted_at is null and admin.is_template_catalog_v2() and p.id=p_provider and s.template_id=p_template
    and p.module='image' and p.adapter='openai_images' and p.model='gpt-image-2.6-sunburst'
    and md5(p.base_url) is not distinct from s.provider_endpoint_hash
    and (p.capabilities->'resolutions') ?& array['1k','2k','4k']
$$;

CREATE OR REPLACE FUNCTION "admin"."template_approved_prices"("p_provider" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_object_agg(s.template_id,jsonb_build_object('quality',c.quality,'costs',c.costs)), '{}')
  from admin.template_price_batches b join admin.template_price_snapshots s on s.batch_id=b.id
  join admin.template_tariffs_v2 c on c.id=s.template_id
  join public.ai_providers p on p.id=s.provider_id
  where b.reverted_at is null and admin.is_template_catalog_v2() and p.id=p_provider
    and p.module='image' and p.adapter='openai_images' and p.model='gpt-image-2.6-sunburst'
    and md5(p.base_url) is not distinct from s.provider_endpoint_hash
    and (p.capabilities->'resolutions') ?& array['1k','2k','4k']
$$;

CREATE OR REPLACE FUNCTION "admin"."activate_template_price_catalog_v2"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  batch bigint;
  problems text;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0));
  if not admin.is_template_catalog_v2() then raise exception 'TEMPLATE_CATALOG_VERSION_NOT_ACTIVE'; end if;
  if exists (select 1 from admin.template_price_batches where reverted_at is null) then return; end if;
  lock table public.templates, public.template_prompts, public.ai_providers in share row exclusive mode nowait;

  select string_agg(t.id,', ' order by t.id) into problems from public.templates t
    left join admin.template_tariffs_v2 c on c.id=t.id
    where t.is_active and c.id is null and t.category_key<>'art-styles'
      and t.id not in ('bright-listing','evening-glow') and t.id not like 'qa-%';
  if problems is not null then raise exception 'UNMAPPED_ACTIVE_TEMPLATES: %', problems; end if;

  -- Edit and partner requests run on the active provider; a web-only template may pin its own.
  select string_agg(t.id,', ' order by t.id) into problems from admin.template_tariffs_v2 c
    join public.templates t on t.id=c.id
    left join public.template_prompts tp on tp.template_id=t.id
    left join public.ai_providers a on a.module='image' and a.is_active
    left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,a.id)
    where tp.template_id is null or p.id is null or p.adapter<>'openai_images' or p.model<>'gpt-image-2.6-sunburst'
      or rtrim(p.base_url,'/')<>'https://api.openai.com/v1'
      or ('partner'=any(t.visible_in) and a.id is distinct from p.id)
      or not coalesce((p.capabilities->'resolutions') ?& array['1k','2k','4k'],false)
      or not coalesce((t.fields#>>'{images,min}')::int >= (p.capabilities->>'minReferences')::int
          and (t.fields#>>'{images,max}')::int <= (p.capabilities->>'maxReferences')::int,false);
  if problems is not null then raise exception 'TEMPLATE_MODEL_NOT_READY: %', problems; end if;

  insert into admin.template_price_batches default values returning id into batch;
  insert into admin.template_price_snapshots (batch_id,template_id,previous,applied,provider_id,provider_endpoint_hash)
    select batch,t.id,admin.template_price_state(t),
      case when c.id is null then admin.template_price_state(t)||'{"active":false,"featured":null}'::jsonb
        else admin.template_price_state(t)||jsonb_build_object('quality',c.quality,'costs',c.costs) end,
      case when c.id is not null then p.id end, case when c.id is not null then md5(p.base_url) end
    from public.templates t left join admin.template_tariffs_v2 c on c.id=t.id
    left join public.template_prompts tp on tp.template_id=t.id
    left join public.ai_providers a on a.module='image' and a.is_active
    left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,a.id)
    where c.id is not null or t.is_active;
  update public.templates t set quality=s.applied->>'quality',credits_cost=s.applied->'costs',
    is_active=(s.applied->>'active')::boolean,featured_rank=(s.applied->>'featured')::smallint
    from admin.template_price_snapshots s where s.batch_id=batch and s.template_id=t.id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_image_pricing_catalog"("p_env_model" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id))
      || jsonb_build_object('p95_by_quality',admin.route_p95_by_quality(coalesce(p.provider_id::text,'env')||'/'||p.model))
      || case when p.is_active then jsonb_build_object('fallback_floors',(
        select jsonb_object_agg(quality,tiers) from (
          select quality,jsonb_object_agg(res,admin.fallback_route_floor(coalesce(p.provider_id::text,'env')||'/'||p.model,res,quality)) tiers
          from unnest(array['medium','high']) quality cross join unnest(array['1k','2k','4k']) res group by quality
        ) grouped)) else '{}'::jsonb end)
      from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;

CREATE OR REPLACE FUNCTION "public"."admin_image_provider_pricing"("p_env_model" "text") RETURNS TABLE("provider_id" "uuid", "label" "text", "model" "text", "adapter" "text", "is_active" boolean, "capabilities" "jsonb", "resolutions" "text"[], "estimated_image_costs" "jsonb", "p95" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with samples as (
    -- Jobs before 1431 say 3k for the same tier as 4k: one sample set.
    select g.provider, public.canonical_resolution(coalesce(g.inputs->>'resolution', '1k')) as resolution,
           percentile_cont(0.95) within group (order by g.cost_usd) as cost
      from public.generation_jobs g
     where g.created_at >= now() - interval '30 days'
       and coalesce(g.inputs->>'resolution', '1k') in ('1k','2k','3k','4k')
       and g.status = 'succeeded' and g.cost_usd is not null
       and not (g.inputs ? 'input_slots')
     group by 1, 2 having count(*) >= 10
  ), costs as (
    select provider, jsonb_object_agg(resolution, cost) as p95 from samples group by provider
  )
  select p.id, p.label, p.model, p.adapter, p.is_active, p.capabilities, p.resolutions,
         p.estimated_image_costs, coalesce(c.p95, '{}'::jsonb)
    from public.ai_providers p
    left join costs c on c.provider = p.id::text || '/' || p.model
   where p.module = 'image'
  union all
  select null::uuid, '环境默认'::text, p_env_model, 'openai_images'::text, true, '{}'::jsonb,
         array['1k', '2k', '4k'], '{}'::jsonb, coalesce(c.p95, '{}'::jsonb)
    from (values (1)) as fallback(dummy) left join costs c on c.provider = 'env/' || p_env_model
   where not exists (select 1 from public.ai_providers where module = 'image' and is_active)
   order by 2, 1
$$;

CREATE OR REPLACE FUNCTION "public"."reserve_credits"("p_job_id" "uuid", "p_user_id" "uuid", "p_module" "text", "p_template_id" "text", "p_credits_cost" integer, "p_source" "text", "p_inputs" "jsonb" DEFAULT '{}'::"jsonb", "p_provider" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_visibility" "text" DEFAULT NULL::"text", "p_parent_job_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."generation_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_profile public.profiles;
  v_job public.generation_jobs;
  v_pool text;
  -- The old name 3k (callers before 1431) is the same tier as 4k; it is stored and priced as 4k.
  v_resolution text := public.canonical_resolution(coalesce(p_inputs ->> 'resolution', '1k'));
  v_cost integer;
  v_v2 boolean;
  v_template public.templates;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  if v_resolution not in ('1k', '2k', '4k') then
    raise exception 'INVALID_INPUT' using detail = 'resolution must be 1k, 2k or 4k';
  end if;
  -- The `edit` template is only for edits, and an edit only runs on it.
  if (p_template_id = 'edit') <> (p_parent_job_id is not null) then
    raise exception 'INVALID_INPUT' using detail = 'an edit runs on the edit template with a parent job';
  end if;

  -- Lock the profile first so concurrent reserves for one user run one at a time: the pool
  -- choice below always sees the balances the previous reserve left.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select * into v_job from public.generation_jobs where id = p_job_id;
  if found then
    if v_job.user_id <> p_user_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_job;
  end if;

  if p_idempotency_key is not null then
    select * into v_job from public.generation_jobs
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return v_job;
    end if;
  end if;

  if v_profile.banned_at is not null then
    raise exception 'USER_BANNED';
  end if;

  -- Someone else's work, a failed, running or deleted one, or a missing one all look the same.
  if p_parent_job_id is not null then
    perform 1 from public.generation_jobs
     where id = p_parent_job_id and user_id = p_user_id and status = 'succeeded' and deleted_at is null;
    if not found then
      raise exception 'PARENT_JOB_NOT_FOUND';
    end if;
  end if;

  v_v2 := admin.is_template_catalog_v2();
  select t.* into v_template from public.templates t where t.id=p_template_id for share;
  v_cost := (v_template.credits_cost->>v_resolution)::integer;
  if not found then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if v_v2 then
    if not v_template.is_active or (p_template_id<>'edit' and not
        (case when p_source='graylum' then 'partner' else 'web' end=any(v_template.visible_in))) then
      raise exception 'TEMPLATE_NOT_FOUND';
    end if;
    if p_credits_cost is distinct from v_cost then raise exception 'TEMPLATE_QUOTE_CHANGED'; end if;
  end if;
  -- Price the route selected by the server against the locked template before any debit.
  -- Check the persisted binding as well, covering older callers and concurrent rebinding.
  if p_inputs ? 'quality' and p_inputs->>'quality' is distinct from v_template.quality then
    raise exception 'TEMPLATE_QUOTE_CHANGED';
  end if;
  if not admin.reservation_route_allowed(v_template,p_provider,v_resolution,v_cost,
      coalesce(p_inputs->>'fallback_route'='true',false),v_v2) then
    raise exception 'TEMPLATE_UNAVAILABLE';
  end if;
  if v_profile.credits >= v_cost then
    v_pool := 'paid';
  elsif v_profile.free_credits >= v_cost then
    v_pool := 'free';
  else
    raise exception 'CREDITS_INSUFFICIENT';
  end if;

  perform public._apply_credit_change(
    p_user_id, v_pool, 'reserve', -v_cost, 'generation reserve',
    'job:' || p_job_id::text || ':reserve', p_job_id
  );

  insert into public.generation_jobs
    (id, user_id, module, template_id, inputs, provider, source, idempotency_key,
     credit_pool, visibility, credits_cost, parent_job_id)
  values
    (p_job_id, p_user_id, p_module, p_template_id,
     (coalesce(p_inputs, '{}'::jsonb)-'pricing_catalog_version') || jsonb_build_object('resolution',v_resolution)
       || case when v_v2 then '{"pricing_catalog_version":"v2"}'::jsonb else '{}'::jsonb end,
     p_provider, p_source,
     p_idempotency_key,
     v_pool,
     -- Free works are always public (ARCHITECTURE §9); paid works default to private.
     case when v_pool = 'paid' then coalesce(p_visibility, 'private') else 'public' end,
     v_cost,
     p_parent_job_id)
  returning * into v_job;

  return v_job;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_upsert_template"("p_template" "jsonb", "p_prompt" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id text := p_template ->> 'id';
  v_provider uuid;
  v_model text;
  v_floor jsonb;
  v_resolution text;
  v_approved jsonb;
  unpriced text[];
begin
  -- 3k from a caller still on the old name (the app's fetch shim) is read as 4k (1431).
  p_template := public.canonical_tiers(p_template);
  perform 1 from public.templates where id = v_id for update;
  if v_id='edit' then v_provider:=null;
  elsif p_prompt ? 'provider_id' then
    v_provider := (p_prompt ->> 'provider_id')::uuid;
  else
    select provider_id into v_provider from public.template_prompts where template_id = v_id;
  end if;
  select p.id, p.model into v_provider, v_model from public.ai_providers p
    where p.module = 'image' and (p.id = v_provider or (v_provider is null and p.is_active)) for share;

  -- Older deployments send no pricing snapshot. New code derives it from site products and
  -- measured costs on the server; callers without the service role cannot invoke this RPC.
  if admin.is_template_catalog_v2() and (p_template#>>'{price_floors,version}') is distinct from 'v2' then
    raise exception 'MODEL_CHANGED' using detail='请刷新模板报价后再保存';
  end if;
  if p_template ? 'unpriced_resolutions' then
    unpriced:=array(select jsonb_array_elements_text(p_template->'unpriced_resolutions'));
  else
    select unpriced_resolutions into unpriced from public.template_sale_approvals where template_id=v_id;
  end if;
  if p_template ? 'price_floors' then
    v_floor := p_template->'price_floors'->'providers'->coalesce(v_provider::text, 'env');
    if v_floor is null or (v_provider is not null and p_template->'price_floors' ? 'models'
        and v_model is distinct from (p_template->'price_floors'->'models'->>v_provider::text)) then
      raise exception 'MODEL_CHANGED';
    end if;
    v_approved := admin.template_approved_prices(v_provider)->v_id;
    foreach v_resolution in array array['1k','2k','4k'] loop
      if v_resolution=any(unpriced) then continue; end if;
      if (p_template->'credits_cost'->>v_resolution)::integer <
          (v_floor->coalesce(p_template->>'quality','high')->>v_resolution)::integer
        and not coalesce(v_approved->>'quality'=p_template->>'quality'
          and v_approved->'costs'->v_resolution=p_template->'credits_cost'->v_resolution,false) then
        raise exception 'MODEL_CREDIT_FLOOR' using detail = format('%s 积分低于所选模型下限，请检查该档建议积分和成本估价', v_resolution);
      end if;
    end loop;
  end if;
  insert into public.templates as t (
    id, module, name, category, category_key, cover_before_url, cover_after_url,
    fields, quality, credits_cost, sort_order, is_active, visible_in, translations, description, featured_rank
  ) values (
    v_id,
    coalesce(p_template ->> 'module', 'image'),
    p_template ->> 'name',
    -- New code sends the key; old code and the prompt import send a name. The 0581 trigger
    -- fills whichever is missing.
    p_template ->> 'category',
    nullif(p_template ->> 'category_key', ''),
    nullif(p_template ->> 'cover_before_url', ''),
    nullif(p_template ->> 'cover_after_url', ''),
    coalesce(p_template -> 'fields', '{}'::jsonb),
    coalesce(p_template ->> 'quality', 'high'),
    -- Required: a template without its three prices must not save at some default.
    p_template -> 'credits_cost',
    -- New templates go to the end unless a position is given.
    coalesce(
      (p_template ->> 'sort_order')::integer,
      (select coalesce(max(sort_order), 0) + 10 from public.templates)
    ),
    coalesce((p_template ->> 'is_active')::boolean, false),
    array(select jsonb_array_elements_text(coalesce(p_template -> 'visible_in', '["web"]'::jsonb))),
    coalesce(p_template -> 'translations', '{}'::jsonb),
    nullif(btrim(p_template ->> 'description'), ''),
    (p_template ->> 'featured_rank')::smallint
  )
  on conflict (id) do update set
    module = excluded.module,
    name = excluded.name,
    category = excluded.category,
    -- After the BEFORE INSERT trigger, so always set (EXCLUDED carries the trigger's values).
    category_key = excluded.category_key,
    -- Only when the payload carries them: the editor leaves covers to the upload.
    cover_before_url = case when p_template ? 'cover_before_url' then excluded.cover_before_url else t.cover_before_url end,
    cover_after_url = case when p_template ? 'cover_after_url' then excluded.cover_after_url else t.cover_after_url end,
    fields = excluded.fields,
    quality = excluded.quality,
    credits_cost = excluded.credits_cost,
    sort_order = coalesce((p_template ->> 'sort_order')::integer, t.sort_order),
    is_active = coalesce((p_template ->> 'is_active')::boolean, t.is_active),
    visible_in = excluded.visible_in,
    -- The editor always sends the whole object; the prompt import script does not, and keeps it.
    translations = case when p_template ? 'translations' then excluded.translations else t.translations end,
    description = case when p_template ? 'description' then excluded.description else t.description end,
    featured_rank = case
      when p_template ? 'featured_rank' then excluded.featured_rank
      when coalesce((p_template ->> 'is_active')::boolean, t.is_active) and 'web' = any (excluded.visible_in) then t.featured_rank
      else null
    end;

  if p_prompt is not null then
    insert into public.template_prompts as tp (template_id, body, model_params, provider_id)
    values (v_id, p_prompt ->> 'body', coalesce(p_prompt -> 'model_params', '{}'::jsonb), (p_prompt ->> 'provider_id')::uuid)
    on conflict (template_id) do update set
      body = excluded.body,
      model_params = excluded.model_params,
      provider_id = case when p_prompt ? 'provider_id' then excluded.provider_id else tp.provider_id end;
  else
    perform admin.assert_template_reference_range(v_id);
  end if;
  perform admin.set_template_unpriced_resolutions(v_id,unpriced);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_bulk_edit_templates"("p_ids" "text"[], "p_patch" "jsonb", "p_floor" "jsonb", "p_actor" "uuid", "p_locales" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  v_ids text[] := array(select distinct u.id from unnest(coalesce(p_ids, '{}')) as u(id));
  -- 3k from a caller still on the old name (the app's fetch shim) is read as 4k (1431).
  v_patch jsonb := coalesce(public.canonical_tiers(p_patch), '{}');
  v_cost jsonb := coalesce(public.canonical_tiers(p_patch) -> 'credits_cost', '{}');
  v_visible text[];
  change_model boolean := p_patch ? 'provider_id';
  target uuid := (p_patch->>'provider_id')::uuid;
  v_category text := p_patch ->> 'category_key';
  v_failures jsonb;
  catalog_minimums jsonb:=case when admin.is_template_catalog_v2() then admin.template_catalog_minimums() else '{}' end;
  v_changed integer;
begin
  p_patch := public.canonical_tiers(p_patch);
  p_floor := public.canonical_tiers(p_floor);
  if p_actor is null then
    raise exception 'INVALID_INPUT' using detail = 'actor is required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 200 then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 200 templates';
  end if;
  if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}' or v_patch - 'credits_cost' - 'visible_in' - 'quality' - 'category_key' - 'provider_id' <> '{}' then
    raise exception 'INVALID_INPUT' using detail = 'patch must name credits_cost, visible_in, quality or category_key';
  end if;
  if v_patch ? 'quality' and (v_patch ->> 'quality') is distinct from 'high' and (v_patch ->> 'quality') is distinct from 'medium' then
    raise exception 'INVALID_INPUT' using detail = 'quality must be high or medium';
  end if;
  if jsonb_typeof(v_cost) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost must be an object';
  end if;
  if exists (
    select 1 from jsonb_each(v_cost) as e(key, value)
    where e.key not in ('1k', '2k', '4k') or jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^[1-9][0-9]{0,2}$'
  ) then
    raise exception 'INVALID_INPUT' using detail = 'credits_cost tiers must be whole numbers 1..999';
  end if;
  if v_patch ? 'visible_in' then
    if jsonb_typeof(v_patch -> 'visible_in') <> 'array' then
      raise exception 'INVALID_INPUT' using detail = 'visible_in must be an array';
    end if;
    v_visible := array(select distinct x from jsonb_array_elements_text(v_patch -> 'visible_in') as v(x) order by x desc);
    if cardinality(v_visible) = 0 or not (v_visible <@ array['web', 'partner']) then
      raise exception 'INVALID_INPUT' using detail = 'visible_in must be web, partner or both';
    end if;
  end if;
  if v_patch ? 'category_key' then
    -- Held until commit, so the category cannot be deleted under this write.
    perform 1 from public.template_categories c where c.key = v_category and not c.is_system for share;
    if not found then
      raise exception 'CATEGORY_NOT_FOUND' using detail = 'category_key must name a category that is not a system one';
    end if;
  end if;
  if p_floor is null or exists (
    select 1 from unnest(array['high', 'medium']) as q(quality), unnest(array['1k', '2k', '4k']) as r(res)
    where jsonb_typeof(p_floor -> q.quality -> r.res) is distinct from 'number'
  ) then
    raise exception 'INVALID_INPUT' using detail = 'floor table is incomplete';
  end if;

  -- The rows are checked and written under one lock, so no other save slips in between.
  perform 1 from public.templates t where t.id = any (v_ids) order by t.id for update;
  if change_model then
    perform 1 from public.template_prompts where template_id=any(v_ids) order by template_id for update;
    perform 1 from public.ai_providers where module='image' and (id=target or (target is null and is_active)) for share;
    if target is not null and not found then raise exception 'MODEL_CHANGED'; end if;
  end if;

  if admin.is_template_catalog_v2() and (p_floor->>'version') is distinct from 'v2' then
    raise exception 'MODEL_CHANGED' using detail='请刷新模板报价后再保存';
  end if;
  -- A supplier may have switched since the admin action read costs. Re-read the effective
  -- binding under the template lock; a missing/different model requires a fresh preview.
  if p_floor ? 'models' and exists (
    select 1 from public.templates t
      left join public.template_prompts tp on tp.template_id = t.id
      left join public.ai_providers active on active.is_active and active.module = 'image'
      left join public.ai_providers p on p.id = coalesce(case when change_model then target else tp.provider_id end, active.id)
     where t.id = any(v_ids) and (
       not (p_floor->'providers' ? coalesce(p.id::text, 'env'))
       or (p.id is not null and p.model is distinct from (p_floor->'models'->>p.id::text)))
  ) then raise exception 'MODEL_CHANGED'; end if;

  with planned as (
    select a.id, t.id is not null as found, coalesce(t.name, a.id) as name, t.is_active,
           t.description, t.cover_before_url, t.cover_after_url, t.cover_locales, t.visible_in as old_visible,
           coalesce(v_patch ->> 'quality', t.quality) as quality,
           coalesce(p_floor -> 'providers' -> coalesce((case when change_model then target else tp.provider_id end)::text, active.id::text, 'env'), p_floor) as floor,
           admin.template_approved_prices(coalesce(case when change_model then target else tp.provider_id end,active.id))->t.id as approved,
           catalog_minimums->t.id as tariff,
           coalesce(sale.unpriced_resolutions, array(select tier from unnest(array['1k','2k','4k']) tier
             where tier<>all(admin.sale_route_resolutions(previous)))) as unpriced_resolutions,
           t.credits_cost || v_cost as credits_cost,
           coalesce(v_visible, t.visible_in) as visible_in,
           a.id in ('edit', 'freeform') or coalesce(c.is_system, false) as is_builtin,
           case when change_model then admin.bulk_model_problem(t,tp,chosen,v_cost)
                when exists(select from jsonb_object_keys(v_cost) tier where not(tier=any(admin.sale_route_resolutions(chosen))))
                then '所选模型不支持所填积分档位' end model_problem
    from unnest(v_ids) as a(id)
    left join public.templates t on t.id = a.id
    left join public.template_categories c on c.key = t.category_key
    left join public.template_sale_approvals sale on sale.template_id = t.id
    left join public.template_prompts tp on tp.template_id = t.id
    left join public.ai_providers active on active.module = 'image' and active.is_active
    left join public.ai_providers previous on previous.id=coalesce(tp.provider_id,active.id)
    left join public.ai_providers chosen on chosen.id=coalesce(case when change_model then target else tp.provider_id end,active.id)
  ),
  failures as (
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', case when p.found then 'system' else 'not_found' end) as failure
    from planned p
    where not p.found or p.is_builtin
    union all
    select jsonb_build_object('id',p.id,'name',p.name,'reason','model','detail',p.model_problem)
    from planned p where p.found and not p.is_builtin and p.model_problem is not null
    union all
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'reason', 'below_floor', 'resolution', r.res,
      'floor', minimum.credits, 'given', (p.credits_cost ->> r.res)::integer
    )
    from planned p
    cross join unnest(array['1k', '2k', '4k']) as r(res)
    cross join lateral (select greatest((p.floor -> p.quality ->> r.res)::integer,
      case when p.tariff->>'quality'=p.quality then (p.tariff->'costs'->>r.res)::integer end) as credits) minimum
    where p.found and not p.is_builtin
      and (v_cost ? r.res or not (r.res=any(p.unpriced_resolutions)))
      and (p.credits_cost ->> r.res)::integer < minimum.credits
      and not coalesce(p.approved->>'quality'=p.quality and p.approved->'costs'->r.res=p.credits_cost->r.res,false)
    union all
    select jsonb_build_object('id', p.id, 'name', p.name, 'reason', 'web_incomplete')
    from planned p
    where p.found and not p.is_builtin and p.is_active
      and 'web' = any (p.visible_in) and not ('web' = any (p.old_visible))
      and (nullif(btrim(p.description), '') is null
           or not (nullif(btrim(p.cover_before_url), '') is not null or exists (
             select 1 from unnest(coalesce(p_locales, '{}')) as l(code)
             where nullif(btrim(p.cover_locales -> l.code ->> 'before'), '') is not null))
           or not (nullif(btrim(p.cover_after_url), '') is not null or exists (
             select 1 from unnest(coalesce(p_locales, '{}')) as l(code)
             where nullif(btrim(p.cover_locales -> l.code ->> 'after'), '') is not null)))
  )
  select coalesce(jsonb_agg(f.failure), '[]'::jsonb) into v_failures from failures f;

  if jsonb_array_length(v_failures) > 0 then
    return jsonb_build_object('failures', v_failures);
  end if;

  -- Capture missing legacy tier markers against the old route before changing a binding.
  if change_model or v_cost <> '{}'::jsonb then
    perform admin.set_template_unpriced_resolutions(t.id, null)
      from public.templates t where t.id=any(v_ids)
        and not exists(select from public.template_sale_approvals s where s.template_id=t.id);
  end if;

  update public.templates t
  set quality = coalesce(v_patch ->> 'quality', t.quality),
      credits_cost = t.credits_cost || v_cost,
      visible_in = coalesce(v_visible, t.visible_in),
      -- templates.category (the English name) follows through T75's trigger.
      category_key = coalesce(v_category, t.category_key),
      featured_rank = case when v_visible is not null and not ('web' = any (v_visible)) then null else t.featured_rank end
  where t.id = any (v_ids);
  get diagnostics v_changed = row_count;

  if change_model then
    update public.template_prompts set provider_id=target where template_id=any(v_ids) and provider_id is distinct from target;
  end if;

  -- A capability expansion or a model change alone never opens a previously unpriced tier.
  if v_cost <> '{}'::jsonb then
    perform admin.set_template_unpriced_resolutions(s.template_id,
      array(select tier from unnest(s.unpriced_resolutions) tier where not (v_cost ? tier)))
    from public.template_sale_approvals s where s.template_id=any(v_ids)
      and exists(select from unnest(s.unpriced_resolutions) tier where v_cost ? tier);
  end if;
  return jsonb_build_object('failures', '[]'::jsonb, 'changed', v_changed);
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."sync_preview_template"("p_template" "jsonb", "p_prompt" "jsonb", "p_provider" "jsonb", "p_floors" "jsonb", "p_run_id" "text", "p_locales" "text"[], "p_target_token" "text", "p_catalog_version" "text", "p_validate_only" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id text := p_template->>'id';
  v_provider uuid;
  v_catalog text;
  v_quote jsonb;
  v_inserted boolean;
  v_template_xmin text;
  v_prompt_xmin text;
  v_previous public.template_prompts;
  v_version integer;
  v_live boolean;
  v_featured smallint;
  -- The sub-category and series (2026-11-12): carried only when the source sends the keys, so a
  -- caller from before this migration keeps the old behaviour (production's own filing stays).
  v_assign boolean := p_template ? 'subcategory_key' and p_template ? 'series_slug';
  v_sub text := nullif(p_template->>'subcategory_key','');
  v_series uuid;
  v_old_series uuid;
  v_order integer := 0;
  -- Style references (1276): carried only when the source sends the key, as for the sub-category.
  v_refs boolean := p_prompt ? 'style_refs';
  v_prompt jsonb;
  v_matches integer;
begin
  -- 3k from a caller still on the old name (the app's fetch shim) is read as 4k (1431).
  p_template := public.canonical_tiers(p_template);
  p_floors := public.canonical_tiers(p_floors);
  if nullif(p_run_id,'') is null or nullif(btrim(p_prompt->>'body'),'') is null then
    raise exception 'INVALID_SYNC';
  end if;
  if v_refs and jsonb_typeof(p_prompt->'style_refs') is distinct from 'array' then raise exception 'INVALID_STYLE_REFS'; end if;
  -- Serialize dispatches even before the first template row exists.
  -- Same lock and lock order as #385 cutover and rollback. The subsequent read sees a
  -- cutover that won the lock; one that comes later must wait for the entire write.
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  perform pg_advisory_xact_lock(hashtextextended('template-sync:' || v_id, 0));
  select synced_version into v_version from public.template_sync_history
    where template_id = v_id and run_id = p_run_id;
  if found then return v_version; end if;
  v_catalog := admin.template_sync_catalog();
  if v_catalog not in ('v1','v2') or p_catalog_version is distinct from v_catalog
      or coalesce(p_floors->>'version','v1') <> v_catalog then raise exception 'CATALOG_MISMATCH'; end if;
  -- The tree lock before any category row (1272): 分类管理 takes the tree lock exclusively and then
  -- writes rows, so a row share taken first could wait on it while it waits on us. Same order as
  -- admin_save_template_assignment and the 1270–1271 sync: tree shared, series, then rows.
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  if v_assign then perform pg_advisory_xact_lock(hashtextextended('shotviva.template_series',0)); end if;
  perform 1 from public.template_categories where key = p_template->>'category_key' for share;
  if not found then raise exception 'CATEGORY_MISSING'; end if;
  if v_assign then
    if v_sub is not null then
      perform 1 from public.template_category_paths p join public.template_categories c on c.key = p.key
        where p.key = v_sub and p.root_key = p_template->>'category_key' and p.key <> p.root_key and not c.is_system;
      if not found then raise exception 'SUBCATEGORY_MISSING'; end if;
      perform 1 from public.template_categories where key = v_sub for share;
    end if;
    if nullif(p_template->>'series_slug','') is not null then
      select id into v_series from public.template_series where slug = p_template->>'series_slug' for share;
      if not found then raise exception 'SERIES_MISSING'; end if;
    end if;
  end if;

  if p_provider is not null and p_provider <> 'null'::jsonb then
    -- The one production row with this adapter, model and endpoint; of several (a leftover copy),
    -- the module's active one (at most one per module). Otherwise say which case it is (1277).
    select count(*) into v_matches from public.ai_providers
      where module = 'image' and adapter = p_provider->>'adapter'
        and model = p_provider->>'model' and base_url = p_provider->>'base_url';
    if v_matches = 0 then raise exception 'PROVIDER_MISSING'; end if;
    begin
      select id into strict v_provider from public.ai_providers
        where module = 'image' and adapter = p_provider->>'adapter'
          and model = p_provider->>'model' and base_url = p_provider->>'base_url'
          and (v_matches = 1 or is_active) for share;
    exception when no_data_found or too_many_rows then
      raise exception 'PROVIDER_NOT_UNIQUE' using detail = format(
        '%s rows share this adapter, model and endpoint and none is the active provider', v_matches);
    end;
  end if;
  -- The editor RPC resolves the effective provider and checks its floor and exact tariff.
  -- Refuse incomplete input: the editor's comparison with a missing numeric tier is SQL NULL.
  if jsonb_typeof(p_floors->'providers') is distinct from 'object' or exists (
    select from jsonb_each(p_floors->'providers') f cross join unnest(array['1k','2k','4k']) r
      where jsonb_typeof(f.value->(p_template->>'quality')->r) is distinct from 'number'
         or (f.value->(p_template->>'quality')->>r)::numeric < 1
  ) then raise exception 'MODEL_CHANGED'; end if;

  -- Acquire the same row lock as normal editor saves, including racing first-time inserts.
  insert into public.templates (id, name, category_key, credits_cost, sort_order)
    values (v_id, p_template->>'name', p_template->>'category_key', p_template->'credits_cost',
      (select coalesce(max(sort_order),0) + 10 from public.templates))
    on conflict (id) do nothing returning true into v_inserted;
  select xmin::text, is_active, featured_rank into strict v_template_xmin, v_live, v_featured from public.templates where id = v_id for update;
  select tp.xmin::text into v_prompt_xmin from public.template_prompts tp where template_id=v_id for update;
  if p_target_token is distinct from (case when v_inserted then 'missing'
      else v_template_xmin || '/' || coalesce(v_prompt_xmin,'-') end) then raise exception 'STALE_TARGET'; end if;
  if v_featured is not null and not (p_template->'visible_in' ? 'web') then raise exception 'FEATURED_WEB_REQUIRED'; end if;
  if v_live and p_template->'visible_in' ? 'web' and
      (nullif(btrim(p_template->>'description'),'') is null or not public._template_has_cover_parts(
        p_template->>'cover_before_url', p_template->>'cover_after_url', p_template->'cover_locales', p_locales))
    then raise exception 'LIVE_TEMPLATE_INCOMPLETE'; end if;

  select tp.* into v_previous from public.template_prompts tp where template_id = v_id;
  -- Keep publication, feature rank and sort order under production control. The normal editor
  -- RPC also enforces production's model constraints when the T96 migration is present.
  -- With style references, the editor's three-argument writer: the same 0940 trigger checks the
  -- keys (this template's private prefix, at most three, no repeats) and the same 0941/0943 checks
  -- the model's input range with production's model; an unchanged list keeps the version. Without
  -- the key, the two-argument writer keeps production's own references, as before.
  v_prompt := (p_prompt - array['provider_id','style_refs']) || jsonb_build_object('provider_id',v_provider);
  if v_refs then
    perform public.admin_upsert_template(
      (p_template - array['sort_order','is_active','featured_rank','category','price_floors',
        'subcategory_key','series_slug','series_sort_order'])
        || jsonb_build_object('price_floors',p_floors),
      v_prompt, p_prompt->'style_refs');
  else
    perform public.admin_upsert_template(
      (p_template - array['sort_order','is_active','featured_rank','category','price_floors',
        'subcategory_key','series_slug','series_sort_order'])
        || jsonb_build_object('price_floors',p_floors),
      v_prompt);
  end if;
  -- The editor writer now holds the effective model lock. Compare the exact response used
  -- by its calculator with the current inputs (including p95, approved tariffs and unit).
  -- A quote changed between the last HTTP read and this transaction rolls back the upsert.
  if nullif(p_floors->>'env_model','') is null or jsonb_typeof(p_floors->'quote_receipt') is distinct from 'object' then
    raise exception 'PRICE_QUOTE_CHANGED';
  end if;
  v_quote := public.template_sync_pricing_input(p_floors->>'env_model')->'receipt';
  if admin.template_sync_quote(v_quote,v_provider,v_id='edit') is distinct from
     admin.template_sync_quote(p_floors->'quote_receipt',v_provider,v_id='edit') then
    raise exception 'PRICE_QUOTE_CHANGED';
  end if;
  -- Production files the template where the test site does: same sub-category, same series (by
  -- slug), none when the test site has none. Series order as the editor keeps it: unchanged while
  -- the series is, appended at the end of a series it joins.
  if v_assign then
    select series_id, coalesce(series_sort_order,0) into v_old_series, v_order from public.templates where id = v_id;
    if v_series is null then v_order := 0;
    elsif v_series is distinct from v_old_series then
      select coalesce(max(series_sort_order),0) + 1 into v_order from public.templates where series_id = v_series;
    end if;
    update public.templates set subcategory_key = v_sub, series_id = v_series, series_sort_order = v_order
      where id = v_id and (subcategory_key, series_id, series_sort_order) is distinct from (v_sub, v_series, v_order);
  end if;
  update public.templates set cover_media_type = p_template->>'cover_media_type',
    cover_video_url = p_template->>'cover_video_url', cover_poster_url = p_template->>'cover_poster_url',
    cover_locales = p_template->'cover_locales' where id = v_id;

  update public.template_prompts set version = version + 1
    where template_id = v_id and version = v_previous.version;
  select version into strict v_version from public.template_prompts where template_id = v_id;
  insert into public.template_sync_history(template_id, run_id, source_version, synced_version,
      previous_version, previous_body, previous_model_params, previous_provider_id, previous_style_refs)
    values (v_id, p_run_id, (p_prompt->>'version')::int, v_version,
      v_previous.version, v_previous.body, v_previous.model_params, v_previous.provider_id, v_previous.style_refs);
  -- The same constraints and T96 RPC are exercised before publishing any cover bytes.
  -- This private SQLSTATE rolls back all changes inside the function's exception block.
  if p_validate_only then raise exception using errcode = 'Z9301'; end if;
  return v_version;
exception when sqlstate 'Z9301' then return v_version;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_begin_prompt_lab_matrix"("p_actor" "uuid", "p_session_id" "uuid", "p_batch_id" "uuid", "p_photos" "uuid"[], "p_versions" "uuid"[], "p_model" "text", "p_resolution" "text", "p_quality" "text", "p_use_style_reference" boolean, "p_estimate_usd" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare cells integer; quoted numeric:=round(p_estimate_usd,6); result jsonb; photo_count integer;
begin
  -- 3k from a caller still on the old name (the app's fetch shim) is read as 4k (1431).
  p_resolution := public.canonical_resolution(p_resolution);
  perform admin.require_reference_admin(p_actor);
  cells:=cardinality(p_photos)*cardinality(p_versions);
  if cells is null or cells not between 1 and 12 or p_batch_id is null or p_model is null or length(btrim(p_model)) not between 1 and 300
    or p_resolution is null or p_resolution not in ('1k','2k','4k') or p_quality is null or p_quality not in ('medium','high')
    or p_use_style_reference is null or quoted is null or quoted<=0 or quoted>=10000
    or cardinality(p_photos)<>(select count(distinct id) from unnest(p_photos) id)
    or cardinality(p_versions)<>(select count(distinct id) from unnest(p_versions) id) then raise exception 'INVALID_INPUT'; end if;
  perform admin.lock_prompt_lab(p_session_id);
  perform pg_advisory_xact_lock(hashtextextended(p_batch_id::text,101));
  if exists(select from public.prompt_lab_runs where batch_id=p_batch_id) then
    if cells<>(select count(*) from public.prompt_lab_runs where batch_id=p_batch_id) or exists(
      select from public.prompt_lab_runs r where batch_id=p_batch_id and (
        session_id<>p_session_id or created_by is distinct from p_actor or model<>p_model or resolution<>p_resolution or quality<>p_quality
        or use_style_reference<>p_use_style_reference or estimate_usd<>quoted or photo_id<>p_photos[1+(ordinal-1)/cardinality(p_versions)]
        or version_id<>p_versions[1+(ordinal-1)%cardinality(p_versions)]))
      then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  else
    if cardinality(p_versions)<>(select count(*) from public.prompt_lab_versions where session_id=p_session_id and id=any(p_versions))
      then raise exception 'PROMPT_VERSION_NOT_FOUND'; end if;
    -- T85 takes the budget lock before inserting a run that references its photo.
    -- Use the same order when T85 and the lab try the same photo concurrently.
    perform admin.reserve_prompt_lab_budget(quoted*cells);
    perform 1 from public.admin_test_photos where id=any(p_photos) order by id for update;
    get diagnostics photo_count=row_count;
    if photo_count<>cardinality(p_photos) then raise exception 'TEST_PHOTO_NOT_FOUND'; end if;
    with batch as (
      insert into public.prompt_lab_runs(session_id,batch_id,ordinal,photo_id,version_id,model,resolution,quality,
        use_style_reference,estimate_usd,created_by)
      select p_session_id,p_batch_id,(ph.n-1)*cardinality(p_versions)+v.n,ph.id,v.id,p_model,p_resolution,p_quality,
        p_use_style_reference,quoted,p_actor from unnest(p_photos) with ordinality ph(id,n)
          cross join unnest(p_versions) with ordinality v(id,n)
      returning id
    )
    insert into public.admin_test_spend(run_id,estimate_usd,provider)
      select id,quoted,p_model from batch;
    update public.admin_test_photos set last_used_at=now() where id=any(p_photos);
    update public.prompt_lab_sessions set updated_at=now() where id=p_session_id;
  end if;
  select jsonb_agg(jsonb_build_object('id',id,'photo_id',photo_id,'version_id',version_id,'status',status) order by ordinal)
    into result from public.prompt_lab_runs where batch_id=p_batch_id;
  return result;
end $$;

-- 4. A 3k written by code still on the old name (before the shim goes) is stored as 4k. One small
-- trigger function per table; "aa_" sorts them before every other BEFORE trigger on the table.
create function admin.canonical_template_tiers() returns trigger language plpgsql set search_path = '' as $$
begin new.credits_cost := public.canonical_tiers(new.credits_cost); return new; end $$;
create function admin.canonical_provider_tiers() returns trigger language plpgsql set search_path = '' as $$
begin
  new.resolutions := public.canonical_tier_array(new.resolutions);
  new.capabilities := public.canonical_tiers(new.capabilities);
  new.estimated_image_costs := public.canonical_tiers(new.estimated_image_costs);
  return new;
end $$;
create function admin.canonical_sale_tiers() returns trigger language plpgsql set search_path = '' as $$
begin new.unpriced_resolutions := public.canonical_tier_array(new.unpriced_resolutions); return new; end $$;
create function admin.canonical_run_tier() returns trigger language plpgsql set search_path = '' as $$
begin new.resolution := public.canonical_resolution(new.resolution); return new; end $$;
create function admin.canonical_snapshot_tiers() returns trigger language plpgsql set search_path = '' as $$
begin new.previous := public.canonical_tiers(new.previous); new.applied := public.canonical_tiers(new.applied); return new; end $$;

create trigger aa_canonical_tiers before insert or update of credits_cost on public.templates
  for each row execute function admin.canonical_template_tiers();
create trigger aa_canonical_tiers before insert or update on public.ai_providers
  for each row execute function admin.canonical_provider_tiers();
create trigger aa_canonical_tiers before insert or update of unpriced_resolutions on public.template_sale_approvals
  for each row execute function admin.canonical_sale_tiers();
create trigger aa_canonical_tiers before insert or update of resolution on public.admin_test_runs
  for each row execute function admin.canonical_run_tier();
create trigger aa_canonical_tiers before insert or update of resolution on public.prompt_lab_runs
  for each row execute function admin.canonical_run_tier();
create trigger aa_canonical_tiers before insert or update of previous, applied on admin.template_price_snapshots
  for each row execute function admin.canonical_snapshot_tiers();

revoke all on function admin.canonical_template_tiers(), admin.canonical_provider_tiers(), admin.canonical_sale_tiers(),
  admin.canonical_run_tier(), admin.canonical_snapshot_tiers() from public;

alter table public.templates enable trigger user;
alter table public.ai_providers enable trigger user;
alter table public.template_sale_approvals enable trigger user;
alter table public.admin_test_runs enable trigger user;
alter table public.prompt_lab_runs enable trigger user;
alter table admin.template_price_snapshots enable trigger user;
