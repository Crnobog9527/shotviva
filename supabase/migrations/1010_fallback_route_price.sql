-- The request records the quality it actually sent. Older rows without that evidence
-- cannot be attributed to a quality tier after a template edit.
create index generation_jobs_route_cost_idx on public.generation_jobs
  (provider, (inputs->>'resolution'), (inputs->>'quality'), created_at)
  where status='succeeded' and cost_usd is not null and inputs ? 'quality';

-- NULL means the actual route or cost is unknown, so a fallback cannot be sold.
create function admin.fallback_route_floor(p_tag text, p_resolution text, p_quality text)
returns numeric language sql stable set search_path='' as $$
  with route as (
    select p.adapter, p.estimated_image_costs, p.capabilities
      from public.ai_providers p
      where p.module='image' and p.id::text=split_part(p_tag,'/',1)
        and p_tag=p.id::text||'/'||p.model and p_resolution=any(p.resolutions)
        and (p.adapter='openai_images' or p.capabilities<>'{}'::jsonb)
    union all
    select 'openai_images','{}'::jsonb,'{}'::jsonb where p_tag like 'env/_%'
  ), measured as (
    select percentile_cont(0.95) within group (order by g.cost_usd)::numeric as usd
      from public.generation_jobs g
      where g.provider=p_tag and g.inputs->>'resolution'=p_resolution
        and g.inputs ? 'quality' and g.inputs->>'quality'=p_quality
        and g.status='succeeded' and g.cost_usd is not null
        and g.created_at>=now()-interval '30 days'
      having count(*)>=10
  ), priced as (
    select adapter, greatest(
      (select usd from measured), (estimated_image_costs->>p_resolution)::numeric,
      case when jsonb_typeof(capabilities->'catalogImageCosts'->p_resolution)='number'
        then nullif((capabilities->'catalogImageCosts'->>p_resolution)::numeric,0) end,
      case when adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"3k":0.135}'
          else '{"1k":0.081,"2k":0.135,"3k":0.206}' end)::jsonb->>p_resolution)::numeric end
    ) as usd from route
  ), budget as (select admin.lowest_credit_price()*0.761*0.4 as usd)
  select greatest(1,ceil(priced.usd*1.10/budget.usd),
    case when adapter='openai_images' then
      ((case when p_quality='medium' then '{"1k":1,"2k":2,"3k":3}'
        else '{"1k":2,"2k":4,"3k":6}' end)::jsonb->>p_resolution)::int end)
    from priced,budget where priced.usd is not null and budget.usd>0
      and p_resolution in ('1k','2k','3k') and p_quality in ('medium','high')
$$;
revoke all on function admin.fallback_route_floor(text,text,text) from public,anon,authenticated;
grant execute on function admin.fallback_route_floor(text,text,text) to service_role;

-- Carry the editor's default-route quote in its existing single pricing read.
create or replace function public.admin_image_pricing_catalog(p_env_model text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',case when admin.is_template_catalog_v2() then 'v2' else 'v1' end,
    'unit_price',admin.lowest_credit_price(),'tariffs',admin.template_catalog_minimums(),
    'providers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('approved',admin.template_approved_prices(p.provider_id))
      || case when p.is_active then jsonb_build_object('fallback_floors',(
        select jsonb_object_agg(quality,tiers) from (
          select quality,jsonb_object_agg(res,admin.fallback_route_floor(coalesce(p.provider_id::text,'env')||'/'||p.model,res,quality)) tiers
          from unnest(array['medium','high']) quality cross join unnest(array['1k','2k','3k']) res group by quality
        ) grouped)) else '{}'::jsonb end)
      from public.admin_image_provider_pricing(p_env_model) p),'[]'))
$$;

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
      then raise exception 'TEMPLATE_QUOTE_CHANGED'; end if;
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
