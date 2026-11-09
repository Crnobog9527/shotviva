-- A fallback or reconfigured provider cannot inherit another model's price exception.
-- Only this exceptional route needs a cost lookup. Use 0924's exact-model p95 / estimate
-- precedence and the same conservative OpenAI fallback as modelCreditFloor.
create function admin.alternate_route_meets_floor(p_tag text,p_resolution text,p_quality text,p_price int)
returns boolean language sql stable set search_path='' as $$
  with route as (
    select p.* from public.admin_image_provider_pricing('') p
    where p.provider_id::text||'/'||p.model=p_tag
      and p.resolutions @> array[p_resolution] and p.capabilities<>'{}'::jsonb
  ), priced as (
    select adapter,coalesce((p95->>p_resolution)::numeric,(estimated_image_costs->>p_resolution)::numeric,
      case when adapter='openai_images' then
        ((case when p_quality='medium' then '{"1k":0.055,"2k":0.095,"3k":0.135}'
                    else '{"1k":0.081,"2k":0.135,"3k":0.206}' end)::jsonb->>p_resolution)::numeric end) as usd
    from route
  ), budget as (
    select admin.lowest_credit_price()*0.761*0.4 as usd
  )
  select coalesce((select p_price >= ceil(priced.usd*1.10/nullif(budget.usd,0))
    and (priced.adapter<>'openai_images' or p_price>=(case when p_quality='medium' then
      '{"1k":1,"2k":2,"3k":3}' else '{"1k":2,"2k":4,"3k":6}' end::jsonb->>p_resolution)::int)
    from priced,budget),false)
$$;
revoke all on function admin.alternate_route_meets_floor(text,text,text,int) from public,anon,authenticated,service_role;

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
