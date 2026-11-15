-- 1570: load speed (Owner, 2026-11-15:「算一次就行了…没有修改的情况下没必要每次都算」).
--
-- 1. Stored budget: the break-even budget, the floor budget and the margin target live in a
--    one-row private table, admin.template_floor_budget_cache, recomputed only when an input is
--    written: statement triggers on system_settings (policy, catalogue version), the catalogue
--    products and versions, product_terms_v2, products (v1), affiliates, affiliate_rates and
--    affiliate_rate_overrides. Reads are one primary-key lookup. The refresh runs inside the
--    writing transaction under an advisory lock and recomputes after taking it, so concurrent
--    writers end with the value of everything committed. A missing row falls back to 1569's
--    compute-once-per-statement path. The migration fills the row.
-- 2. Route floors once per statement: alternate_route_floor, fallback_route_floor and
--    slot_route_floor depend only on their arguments and the data, and the catalogue read asked
--    each of them once per template (480 p95 scans for 120 templates on six distinct argument
--    sets). Their bodies move unchanged to *_now; the old names keep each result for the rest of
--    the client statement in a transaction-local setting keyed by statement_timestamp(). Any
--    write to a floor input in the statement (ai_providers, generation_jobs, or the budget
--    inputs above) clears it, so a later read in the same statement recomputes: same results as
--    before. Only a value this statement wrote, in the exact form written, is used.
-- Expand-only: new private objects; replaced functions keep signatures and results.

-- ---- per-statement memo -------------------------------------------------------------------

create function admin.stmt_memo(p_key text) returns jsonb
  language plpgsql stable set search_path to '' as $$
declare
  raw text := current_setting('shotviva.stmt_memo', true);
  stamp text := statement_timestamp()::text || '|';
  body text;
begin
  if raw is null or left(raw, length(stamp)) <> stamp then return null; end if;
  body := substr(raw, length(stamp) + 1);
  if not pg_input_is_valid(body, 'jsonb') then return null; end if;
  return case when jsonb_typeof(body::jsonb) = 'object' then body::jsonb -> p_key end;
end $$;

create function admin.stmt_memo_put(p_key text, p_value jsonb) returns void
  language plpgsql volatile set search_path to '' as $$
declare
  raw text := current_setting('shotviva.stmt_memo', true);
  stamp text := statement_timestamp()::text || '|';
  body text;
  memo jsonb := '{}';
begin
  if raw is not null and left(raw, length(stamp)) = stamp then
    body := substr(raw, length(stamp) + 1);
    if pg_input_is_valid(body, 'jsonb') and jsonb_typeof(body::jsonb) = 'object' then memo := body::jsonb; end if;
  end if;
  perform set_config('shotviva.stmt_memo', stamp || (memo || jsonb_build_object(p_key, jsonb_build_object('v', p_value)))::text, true);
end $$;

create function admin.stmt_memo_clear() returns trigger
  language plpgsql set search_path to '' as $$
begin
  perform set_config('shotviva.stmt_memo', '', true);
  return null;
end $$;

revoke all on function admin.stmt_memo(text), admin.stmt_memo_put(text,jsonb), admin.stmt_memo_clear()
  from public, anon, authenticated;
grant execute on function admin.stmt_memo(text), admin.stmt_memo_put(text,jsonb) to service_role;

create trigger zz_floor_memo_clear after insert or update or delete or truncate on public.ai_providers
  for each statement execute function admin.stmt_memo_clear();
create trigger zz_floor_memo_clear after insert or update or delete or truncate on public.generation_jobs
  for each statement execute function admin.stmt_memo_clear();

-- ---- route floors: bodies from 1568, unchanged ---------------------------------------------

create function admin.alternate_route_floor_now(p_tag text, p_resolution text, p_quality text) returns jsonb
  language sql stable set search_path to '' as $$
  with route as (
    select p.adapter, p.capabilities, p.estimated_image_costs, admin.provider_list_priced(p) as listed
    from public.ai_providers p
    where p.module='image' and p.id::text||'/'||p.model=p_tag
      and p.resolutions @> array[public.canonical_resolution(p_resolution)] and p.capabilities<>'{}'::jsonb
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k')
  ), measured as (
    select count(*) as n, percentile_cont(0.95) within group (order by g.cost_usd) as p95
    from public.generation_jobs g
    where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'resolution' = any(public.resolution_aliases(p_resolution))
      and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
      and g.created_at>=now()-interval '30 days' and g.status='succeeded' and g.cost_usd is not null
      and not (g.inputs ? 'input_slots')
  ), sources as (
    select r.listed, m.n,
      -- Through jsonb as admin_image_provider_pricing returns it, so the rounding is unchanged.
      case when m.n>=10 then (to_jsonb(m.p95) #>> '{}')::numeric end as p95,
      (r.estimated_image_costs->>public.canonical_resolution(p_resolution))::numeric as estimate,
      case when r.adapter='openrouter_images' and not r.listed
        and jsonb_typeof(r.capabilities->'catalogImageCosts'->public.canonical_resolution(p_resolution))='number'
        and (r.capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric > 0
        then (r.capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric end as catalog,
      case when r.listed then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"4k":0.135}'
                    else '{"1k":0.081,"2k":0.135,"4k":0.206}' end)::jsonb->>public.canonical_resolution(p_resolution))::numeric end as list
    from route r cross join measured m
  ), priced as (
    select listed, n, coalesce(p95,estimate,catalog,list) as usd,
      case when p95 is not null then 'p95' when estimate is not null then 'estimate'
           when catalog is not null then 'catalog' when list is not null then 'list' end as basis
    from sources
  ), budget as (
    select admin.template_floor_budget() as usd
  )
  select jsonb_build_object('usd',priced.usd,'basis',priced.basis,'samples',priced.n,
    'credits',case when priced.usd is not null and budget.usd>0 then greatest(
      ceil(priced.usd*1.10/budget.usd)::int,
      case when priced.listed then (case when p_quality='medium' then
        '{"1k":1,"2k":2,"4k":3}' else '{"1k":2,"2k":4,"4k":6}' end::jsonb->>public.canonical_resolution(p_resolution))::int else 0 end) end)
  from priced, budget
$$;

create function admin.fallback_route_floor_now(p_tag text, p_resolution text, p_quality text) returns numeric
  language sql stable set search_path to '' as $$
  with route as (
    select admin.provider_list_priced(p) as listed, p.adapter, p.estimated_image_costs, p.capabilities
      from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1)
        and p_tag=p.id::text||'/'||p.model and public.canonical_resolution(p_resolution)=any(p.resolutions)
        and (p.adapter='openai_images' or p.capabilities<>'{}'::jsonb)
    union all
    select true,'openai_images','{}'::jsonb,'{}'::jsonb where p_tag like 'env/_%'
  ), measured as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'resolution' = any(public.resolution_aliases(p_resolution))
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null
        and g.created_at>=now()-interval '30 days' and not (g.inputs ? 'input_slots')
      having count(*)>=10
  ), priced as (
    select listed, greatest(
      (select usd from measured), (estimated_image_costs->>public.canonical_resolution(p_resolution))::numeric,
      case when not listed and jsonb_typeof(capabilities->'catalogImageCosts'->public.canonical_resolution(p_resolution))='number'
        then nullif((capabilities->'catalogImageCosts'->>public.canonical_resolution(p_resolution))::numeric,0) end,
      case when listed then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"4k":0.135}'
          else '{"1k":0.081,"2k":0.135,"4k":0.206}' end)::jsonb->>public.canonical_resolution(p_resolution))::numeric end
    ) as usd from route
  ), budget as (select admin.template_floor_budget() as usd)
  select greatest(1,ceil(priced.usd*1.10/budget.usd),
    case when listed then
      ((case when p_quality='medium' then '{"1k":1,"2k":2,"4k":3}'
        else '{"1k":2,"2k":4,"4k":6}' end)::jsonb->>public.canonical_resolution(p_resolution))::int end)
    from priced,budget where priced.usd is not null and budget.usd>0
      and public.canonical_resolution(p_resolution) in ('1k','2k','4k') and p_quality in ('medium','high')
$$;

create function admin.slot_route_floor_now(p_tag text, p_resolution text, p_quality text, p_slots integer, p_single integer) returns integer
  language sql stable set search_path to '' as $$
  with budget as (select admin.template_floor_budget() as usd),
  full_slots as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=any((select admin.route_cost_tags(p_tag))::text[]) and g.inputs->>'resolution'=p_resolution
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null and g.created_at>=now()-interval '30 days'
        and admin.slot_count(g.inputs)=p_slots
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

revoke all on function admin.alternate_route_floor_now(text,text,text), admin.fallback_route_floor_now(text,text,text),
  admin.slot_route_floor_now(text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function admin.alternate_route_floor_now(text,text,text), admin.fallback_route_floor_now(text,text,text),
  admin.slot_route_floor_now(text,text,text,integer,integer) to service_role;

create or replace function admin.alternate_route_floor(p_tag text, p_resolution text, p_quality text) returns jsonb
  language plpgsql stable set search_path to '' as $$
declare
  k text := concat_ws('|', 'alternate', quote_nullable(p_tag), quote_nullable(p_resolution), quote_nullable(p_quality));
  hit jsonb := admin.stmt_memo(k);
  v jsonb;
begin
  if hit ? 'v' then return case when jsonb_typeof(hit->'v') = 'null' then null else hit->'v' end; end if;
  v := admin.alternate_route_floor_now(p_tag, p_resolution, p_quality);
  perform admin.stmt_memo_put(k, v);
  return v;
end $$;

create or replace function admin.fallback_route_floor(p_tag text, p_resolution text, p_quality text) returns numeric
  language plpgsql stable set search_path to '' as $$
declare
  k text := concat_ws('|', 'fallback', quote_nullable(p_tag), quote_nullable(p_resolution), quote_nullable(p_quality));
  hit jsonb := admin.stmt_memo(k);
  v numeric;
begin
  if hit ? 'v' and jsonb_typeof(hit->'v') in ('number', 'null') then return (hit->>'v')::numeric; end if;
  v := admin.fallback_route_floor_now(p_tag, p_resolution, p_quality);
  perform admin.stmt_memo_put(k, to_jsonb(v));
  return v;
end $$;

create or replace function admin.slot_route_floor(p_tag text, p_resolution text, p_quality text, p_slots integer, p_single integer) returns integer
  language plpgsql stable set search_path to '' as $$
declare
  k text := concat_ws('|', 'slot', quote_nullable(p_tag), quote_nullable(p_resolution), quote_nullable(p_quality),
    quote_nullable(p_slots), quote_nullable(p_single));
  hit jsonb := admin.stmt_memo(k);
  v integer;
begin
  if hit ? 'v' and jsonb_typeof(hit->'v') in ('number', 'null') then return (hit->>'v')::integer; end if;
  v := admin.slot_route_floor_now(p_tag, p_resolution, p_quality, p_slots, p_single);
  perform admin.stmt_memo_put(k, to_jsonb(v));
  return v;
end $$;

-- ---- stored budget --------------------------------------------------------------------------

create table admin.template_floor_budget_cache (
  singleton boolean primary key default true check (singleton),
  breakeven numeric,
  floor_budget numeric,
  margin_target_bp integer,
  refreshed_at timestamptz not null default now()
);
alter table admin.template_floor_budget_cache enable row level security;
revoke all on admin.template_floor_budget_cache from public, anon, authenticated;
grant select on admin.template_floor_budget_cache to service_role;

-- Recomputes after taking the lock: under read committed each statement here sees everything
-- committed before it, so the last writer's value includes every earlier writer's change.
create function admin.refresh_template_floor_budget() returns void
  language plpgsql volatile security definer set search_path to '' as $$
declare b numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('shotviva.template_floor_budget_cache', 0));
  b := admin.template_breakeven_budget_now();
  insert into admin.template_floor_budget_cache as c (singleton, breakeven, floor_budget, margin_target_bp, refreshed_at)
  values (true, b, coalesce(b, admin.lowest_credit_price()*0.761*0.4),
    case when b is not null then (select (s.value->>'margin_bp')::int from public.system_settings s where s.key='catalog_economics_policy') end,
    clock_timestamp())
  on conflict (singleton) do update set breakeven=excluded.breakeven, floor_budget=excluded.floor_budget,
    margin_target_bp=excluded.margin_target_bp, refreshed_at=excluded.refreshed_at;
  perform set_config('shotviva.stmt_memo', '', true);
end $$;

create function admin.template_floor_budget_changed() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  perform admin.refresh_template_floor_budget();
  return null;
end $$;

revoke all on function admin.refresh_template_floor_budget(), admin.template_floor_budget_changed() from public, anon, authenticated;
grant execute on function admin.refresh_template_floor_budget() to service_role;

create trigger zz_template_floor_budget after insert or update or delete or truncate on public.system_settings
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on admin.catalog_products
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on admin.catalog_product_versions
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on admin.product_terms_v2
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on public.products
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on public.affiliates
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on public.affiliate_rates
  for each statement execute function admin.template_floor_budget_changed();
create trigger zz_template_floor_budget after insert or update or delete or truncate on public.affiliate_rate_overrides
  for each statement execute function admin.template_floor_budget_changed();

-- Reads: the stored row; without it, 1569's compute-once-per-statement path.
create or replace function admin.template_breakeven_budget() returns numeric
  language plpgsql stable security definer set search_path to '' as $$
declare
  c admin.template_floor_budget_cache;
  stamp text := statement_timestamp()::text;
  cached text := current_setting('shotviva.breakeven_budget', true);
  budget numeric;
begin
  select * into c from admin.template_floor_budget_cache where singleton;
  if found then return c.breakeven; end if;
  if cached is not null and split_part(cached, '|', 1) = stamp
     and split_part(cached, '|', 2) ~ '^([0-9]+([.][0-9]+)?)?$' and cached ~ '^[^|]+[|][^|]*$' then
    return nullif(split_part(cached, '|', 2), '')::numeric;
  end if;
  budget := admin.template_breakeven_budget_now();
  perform set_config('shotviva.breakeven_budget', stamp || '|' || coalesce(budget::text, ''), true);
  return budget;
end;
$$;

create or replace function admin.template_floor_budget() returns numeric
  language plpgsql stable security definer set search_path to '' as $$
declare c admin.template_floor_budget_cache;
begin
  select * into c from admin.template_floor_budget_cache where singleton;
  if found then return c.floor_budget; end if;
  return coalesce(admin.template_breakeven_budget(), admin.lowest_credit_price()*0.761*0.4);
end $$;

create or replace function admin.template_margin_target_bp() returns integer
  language plpgsql stable security definer set search_path to '' as $$
declare c admin.template_floor_budget_cache;
begin
  select * into c from admin.template_floor_budget_cache where singleton;
  if found then return c.margin_target_bp; end if;
  return case when admin.template_breakeven_budget() is not null then
    (select (s.value->>'margin_bp')::int from public.system_settings s where s.key='catalog_economics_policy') end;
end $$;

select admin.refresh_template_floor_budget();
