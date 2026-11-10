-- Absent rows mean closed. Import the effective live catalogue without rewriting templates.
create table public.template_sale_approvals (
  template_id text primary key references public.templates(id) on delete cascade,
  enabled boolean not null default false,
  -- The three historical numbers stay readable to old consumers. Only priced tiers are offers.
  unpriced_resolutions text[] not null default '{}' check (
    unpriced_resolutions <@ array['1k','2k','3k'] and array_position(unpriced_resolutions,null) is null)
);
alter table public.template_sale_approvals enable row level security;
revoke all on public.template_sale_approvals from public,anon,authenticated,service_role;
grant select on public.template_sale_approvals to service_role;

-- A provider row without usable Router capabilities cannot publish an inferred tier.
create function admin.sale_route_resolutions(p public.ai_providers) returns text[]
language sql stable set search_path='' as $$
  select array(select r from unnest(coalesce(p.resolutions,array['1k','2k','3k'])) r
    where p.adapter is distinct from 'openrouter_images' or (p.capabilities->'resolutions') ? r)
$$;
revoke all on function admin.sale_route_resolutions(public.ai_providers) from public,anon,authenticated,service_role;

-- Freeze legacy placeholders before capability syncs or provider changes can make them look sellable.
-- The old art draft editor explicitly described HD/Max as undecided. A real sale or an approved
-- cutover tariff is evidence of a real price; merely having a model snapshot isn't.
insert into public.template_sale_approvals(template_id, enabled, unpriced_resolutions)
select t.id, t.is_active or coalesce(c.style_sale_approved or t.category_key<>'art-styles' and c.id is not null,false),
  array(select tier from unnest(array['1k','2k','3k']) tier
    where (not (admin.sale_route_resolutions(p) @> array[tier])
      or (t.category_key='art-styles' and not t.is_active and tier<>'1k'))
    and not coalesce(c.quality=t.quality and c.costs->tier=t.credits_cost->tier
      and admin.template_catalog_minimums() ? t.id,false) and not exists (
      select from public.generation_jobs j where j.template_id=t.id and j.status='succeeded'
        and coalesce(j.inputs->>'resolution','1k')=tier and j.credits_cost=(t.credits_cost->>tier)::int))
from public.templates t left join admin.template_tariffs_v2 c on c.id=t.id
left join public.template_prompts tp on tp.template_id=t.id
left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,
  (select a.id from public.ai_providers a where a.module='image' and a.is_active));

create table admin.template_sale_events (
  id bigint generated always as identity primary key, template_id text not null,
  actor_id uuid not null, enabled boolean not null, created_at timestamptz not null default now()
);
alter table admin.template_sale_events enable row level security;
revoke all on admin.template_sale_events from public,anon,authenticated,service_role;

-- Both enabling sales and publishing use T98-C's database pricing calculation.
create function admin.assert_template_sale_floor(t public.templates) returns void
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
    if exists(select from public.template_sale_approvals s where s.template_id=t.id and tier=any(s.unpriced_resolutions)) then continue; end if;
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
end;
$$;
revoke all on function admin.assert_template_sale_floor(public.templates) from public,anon,authenticated,service_role;

-- Called by trusted admin writes after the final provider is stored, under the template lock.
-- A NULL argument preserves existing decisions. New templates suppress unpriced, unsupported tiers.
create function admin.set_template_unpriced_resolutions(p_id text,p_unpriced text[]) returns void
language plpgsql security definer set search_path='' as $$
declare t public.templates; supported text[]; previous text[]; next_unpriced text[];
begin
  select * into strict t from public.templates where id=p_id for update;
  select admin.sale_route_resolutions(p) into supported
    from public.templates x left join public.template_prompts tp on tp.template_id=x.id
    left join public.ai_providers p on p.id=coalesce(case when x.id<>'edit' then tp.provider_id end,
      (select a.id from public.ai_providers a where a.module='image' and a.is_active)) where x.id=p_id;
  select unpriced_resolutions into previous from public.template_sale_approvals where template_id=p_id;
  next_unpriced:=coalesce(p_unpriced, previous, array(select tier from unnest(array['1k','2k','3k']) tier where tier<>all(supported)));
  if not (next_unpriced <@ array['1k','2k','3k']) or array_position(next_unpriced,null) is not null or exists(
    select from unnest(coalesce(previous,array['1k','2k','3k'])) tier where tier<>all(next_unpriced) and tier<>all(supported))
  then raise exception 'MODEL_CHANGED'; end if;
  if next_unpriced is not distinct from previous then return; end if;
  insert into public.template_sale_approvals(template_id,unpriced_resolutions) values(p_id,next_unpriced)
    on conflict(template_id) do update set unpriced_resolutions=excluded.unpriced_resolutions;
  if previous is not null and not(previous <@ next_unpriced) then perform admin.assert_template_sale_floor(t); end if;
end;
$$;
revoke all on function admin.set_template_unpriced_resolutions(text,text[]) from public,anon,authenticated;
grant execute on function admin.set_template_unpriced_resolutions(text,text[]) to service_role;

create or replace function admin.check_template_publish_floor() returns trigger
language plpgsql security definer set search_path='' as $$
declare template_key text; t public.templates;
begin
  if tg_table_name='templates' then
    template_key:=new.id;
    if tg_op='UPDATE' and old.credits_cost=new.credits_cost and old.quality=new.quality and old.is_active=new.is_active then return null; end if;
  elsif tg_op='DELETE' then template_key:=old.template_id;
  else
    if tg_op='UPDATE' and old.provider_id is not distinct from new.provider_id then return null; end if;
    template_key:=new.template_id;
  end if;
  select * into t from public.templates where id=template_key for share;
  if found and (t.is_active or (tg_op='UPDATE' and tg_name<>'template_publish_floor' and
      exists(select from public.template_sale_approvals where template_id=t.id and enabled))) then
    perform admin.assert_template_sale_floor(t);
  end if;
  return null;
end;
$$;
-- Also recheck approved, unpublished templates when their stored price changes.
create constraint trigger draft_sale_floor after update of credits_cost,quality on public.templates
deferrable initially deferred for each row when (not new.is_active) execute function admin.check_template_publish_floor();

create function public.admin_set_template_sale(p_actor uuid,p_template_id text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare t public.templates;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  select * into strict t from public.templates where id=p_template_id for update;
  if p_enabled is null then raise exception 'INVALID_INPUT'; end if;
  if not p_enabled and t.is_active then raise exception 'UNPUBLISH_FIRST' using detail='请先下架，再关闭销售'; end if;
  if p_enabled=exists(select from public.template_sale_approvals where template_id=t.id and enabled) then return; end if;
  if p_enabled then
    perform admin.set_template_unpriced_resolutions(t.id,null);
    perform admin.assert_template_sale_floor(t);
  end if;
  insert into public.template_sale_approvals(template_id,enabled) values(t.id,p_enabled)
    on conflict(template_id) do update set enabled=excluded.enabled;
  insert into admin.template_sale_events(template_id,actor_id,enabled) values(t.id,p_actor,p_enabled);
end;
$$;
revoke all on function public.admin_set_template_sale(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_template_sale(uuid,text,boolean) to service_role;

-- The deferred gate sees the final state of compound upserts and cutover transactions.
drop trigger template_retirement_check on public.templates;
drop trigger style_sale_prompt on public.template_prompts;
create or replace function admin.check_style_sale_binding() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select from public.templates t where t.id=new.id and t.is_active
    and not exists(select from public.template_sale_approvals s where s.template_id=t.id and s.enabled)) then
    raise exception 'TEMPLATE_RETIRED' using detail='请先开放销售，再上架';
  end if;
  return null;
end;
$$;

-- #416 also calls this legacy hook before its stricter fallback floor calculation.
create or replace function admin.assert_style_sale_route(t public.templates, actual_route text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if admin.is_template_catalog_v2() and not exists(select from public.template_sale_approvals s
    where s.template_id=t.id and s.enabled) then raise exception 'TEMPLATE_UNAVAILABLE'; end if;
end;
$$;

-- Validate the actual job route, including Graylum's default provider and fallback routes.
-- A rejection inside the reservation transaction rolls back both wallet debit and ledger entry.
create or replace function admin.check_style_job_route() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.templates; tier text:=coalesce(new.inputs->>'resolution','1k'); p public.ai_providers; approved jsonb;
begin
  if exists(select from public.template_sale_approvals s where s.template_id=new.template_id and tier=any(s.unpriced_resolutions))
    then raise exception 'TEMPLATE_UNAVAILABLE'; end if;
  if new.inputs->>'pricing_catalog_version' is distinct from 'v2' then return new; end if;
  select * into strict t from public.templates where id=new.template_id for share;
  perform admin.assert_style_sale_route(t,new.provider);
  if new.provider like 'env/_%' then
    if new.credits_cost>=admin.fallback_route_floor(new.provider,tier,t.quality) then return new; end if;
  else
    select * into p from public.ai_providers where module='image' and id::text=split_part(new.provider,'/',1)
      and id::text||'/'||model=new.provider for share;
    if found and tier=any(admin.sale_route_resolutions(p)) then
      approved:=admin.template_approved_prices(p.id)->t.id;
      if (approved->>'quality'=t.quality and (approved->'costs'->>tier)::int=new.credits_cost)
        or admin.alternate_route_meets_floor(new.provider,tier,t.quality,new.credits_cost) then return new; end if;
    end if;
  end if;
  raise exception 'TEMPLATE_UNAVAILABLE';
end;
$$;
create or replace trigger style_sale_job before insert on public.generation_jobs for each row execute function admin.check_style_job_route();

create or replace function admin.check_catalog_minimums() returns trigger
language plpgsql security definer set search_path='' as $$
declare tariff jsonb; tier text;
begin
  if not admin.is_template_catalog_v2() then return new; end if;
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

create or replace function public.admin_upsert_template(p_template jsonb,p_prompt jsonb) returns void
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
    foreach v_resolution in array array['1k','2k','3k'] loop
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


-- Options exposed to the web include only priced tiers of the bound model.
create or replace function admin.template_image_options(public.templates) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'resolutions', array(select r from unnest(admin.sale_route_resolutions(p)) r where not(r=any(coalesce(s.unpriced_resolutions,'{}')))),
    'aspectRatios',case when p.adapter='openrouter_images' then coalesce(p.capabilities->'aspectRatios','[]'::jsonb)
      else '["16:9","4:5","1:1","9:16","3:2","4:3","2:3"]'::jsonb end,
    'originalRatio',case when p.adapter='openrouter_images' then coalesce(p.capabilities->'originalRatio','false'::jsonb) else 'true'::jsonb end)
  from public.templates t left join public.template_sale_approvals s on s.template_id=t.id
  left join public.template_prompts tp on tp.template_id=t.id
  left join public.ai_providers p on p.id=coalesce(case when t.id<>'edit' then tp.provider_id end,
    (select a.id from public.ai_providers a where a.module='image' and a.is_active))
  where t.id=$1.id and (t.is_active or current_setting('role',true)='service_role')
$$;

-- Partner v1 only offers Standard and sends the job through the active provider.
create or replace function admin.partner_image_aspects(public.templates) returns text[]
language sql stable security definer set search_path='' as $$
  select array(select r.ratio from public.templates t
    left join public.template_sale_approvals s on s.template_id=t.id
    left join public.ai_providers p on p.module='image' and p.is_active
    cross join lateral jsonb_array_elements_text(t.fields->'aspectRatios') with ordinality r(ratio, ord)
    where t.id=$1.id and t.is_active and t.visible_in @> array['partner']
      and not('1k'=any(coalesce(s.unpriced_resolutions,'{}')))
      and (p.id is null or '1k'=any(p.resolutions)) and (p.adapter is distinct from 'openrouter_images'
        or ((p.capabilities->'resolutions') ? '1k' and coalesce(p.capabilities->'providerAspectRatios',p.capabilities->'aspectRatios') ? r.ratio))
    order by r.ord)
$$;

-- Preserve the locked quote and fallback checks of 1010. A rejected substitute route is unavailable.
create or replace function public.reserve_credits(
  p_job_id uuid,
  p_user_id uuid,
  p_module text,
  p_template_id text,
  p_credits_cost integer,
  p_source text,
  p_inputs jsonb default '{}'::jsonb,
  p_provider text default null,
  p_idempotency_key text default null,
  p_visibility text default null,
  p_parent_job_id uuid default null
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_job public.generation_jobs;
  v_pool text;
  v_resolution text := coalesce(p_inputs ->> 'resolution', '1k');
  v_cost integer;
  v_v2 boolean;
  v_template public.templates;
  v_fallback_floor numeric;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  if v_resolution not in ('1k', '2k', '3k') then
    raise exception 'INVALID_INPUT' using detail = 'resolution must be 1k, 2k or 3k';
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
  if p_inputs->>'fallback_route'='true' or exists (
    select 1 from public.template_prompts tp join public.ai_providers p on p.id=tp.provider_id
    where tp.template_id=p_template_id and p_provider is distinct from p.id::text||'/'||p.model
  ) then
    perform admin.assert_style_sale_route(v_template,coalesce(p_provider,''));
    v_fallback_floor := admin.fallback_route_floor(p_provider,v_resolution,v_template.quality);
    if v_fallback_floor is null or v_cost<v_fallback_floor then
      raise exception 'TEMPLATE_UNAVAILABLE';
    end if;
  end if;

  if v_v2 then
    if exists (
      select 1 from admin.template_price_snapshots s join admin.template_price_batches b on b.id=s.batch_id
      join admin.template_tariffs_v2 c on c.id=s.template_id
      where b.reverted_at is null and s.template_id=p_template_id and c.quality=v_template.quality
        and c.costs->v_resolution=v_template.credits_cost->v_resolution
        and (p_provider is distinct from (s.provider_id::text||'/gpt-image-2.6-sunburst')
          or not (admin.template_approved_prices(s.provider_id) ? p_template_id))
    ) then
      if not admin.alternate_route_meets_floor(p_provider,v_resolution,v_template.quality,v_cost)
      then raise exception 'TEMPLATE_UNAVAILABLE'; end if;
    end if;
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
-- One template, its private prompt, any explicit sale approval and the audit event
-- commit together. The existing writer preserves omitted publication and reference fields.
create function public.admin_import_template(
  p_template jsonb, p_prompt jsonb, p_open_sale boolean, p_actor uuid default null, p_style_refs jsonb default null
) returns void language plpgsql security invoker set search_path='' as $$
declare template_id text := p_template->>'id';
begin
  if p_open_sale is null then raise exception 'INVALID_INPUT'; end if;
  if not p_open_sale and coalesce((p_template->>'is_active')::boolean,
      (select t.is_active from public.templates t where t.id=template_id for update),false) then
    raise exception 'IMPORT_OPEN_SALE_REQUIRED';
  end if;
  if p_style_refs is null then
    perform public.admin_upsert_template(p_template,p_prompt);
  else
    perform public.admin_upsert_template(p_template,p_prompt,p_style_refs);
  end if;
  if p_open_sale then
    perform public.admin_set_template_sale(p_actor,template_id,true);
  elsif exists (select from public.templates t where t.id=template_id and t.is_active) then
    -- A concurrent importer may have created a live row after the initial lookup.
    -- Check the final state under the upsert's lock before committing.
    raise exception 'IMPORT_OPEN_SALE_REQUIRED';
  end if;
end;
$$;
revoke all on function public.admin_import_template(jsonb,jsonb,boolean,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_import_template(jsonb,jsonb,boolean,uuid,jsonb) to service_role;
