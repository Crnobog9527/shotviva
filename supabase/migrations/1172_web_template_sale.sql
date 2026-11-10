-- The pre-debit checks of reserve_credits (1100), including stale catalogue
-- snapshots and the stricter cost floor on a substituted model.
create function admin.reservation_route_allowed(t public.templates, route text, tier text,
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
        or not (admin.template_approved_prices(s.provider_id) ? t.id))
  ) then return admin.alternate_route_meets_floor(route,tier,t.quality,price); end if;
  return true;
end $$;

-- The insert trigger's sale checks are also available before making a quote.
-- Keep its price argument: historical callers can supply a stored price.
create function admin.job_route_allowed(t public.templates, route text, tier text,
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
  approved:=admin.template_approved_prices(p.id)->t.id;
  if approved->>'quality'=t.quality and (approved->'costs'->>tier)::int=price then return true; end if;
  return admin.alternate_route_meets_floor(route,tier,t.quality,price);
end $$;

create or replace function admin.check_style_job_route() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.templates; v2 boolean:=coalesce(new.inputs->>'pricing_catalog_version'='v2',false);
begin
  select * into t from public.templates where id=new.template_id for share;
  if not found then return new; end if; -- The existing foreign key reports a missing template.
  if v2 then
    perform 1 from public.ai_providers where module='image' and id::text=split_part(new.provider,'/',1)
      and id::text||'/'||model=new.provider for share;
  end if;
  if not admin.job_route_allowed(t,new.provider,coalesce(new.inputs->>'resolution','1k'),new.credits_cost,v2)
    then raise exception 'TEMPLATE_UNAVAILABLE'; end if;
  return new;
end $$;

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
-- Both halves of the committed reservation, evaluated in one read-only snapshot.
create function admin.template_route_allowed(t public.templates, route text, tier text,
  price integer, fallback boolean) returns boolean language plpgsql stable set search_path='' as $$
declare v2 boolean:=admin.is_template_catalog_v2();
begin
  return coalesce(price=(t.credits_cost->>tier)::int,false)
    and admin.reservation_route_allowed(t,route,tier,price,fallback,v2)
    and admin.job_route_allowed(t,route,tier,price,v2);
end $$;

-- Separate ordinary web publication (category/series visibility included) from
-- listing at the default tier. A direct request at a different tier keeps its own quote.
create view admin.published_web_members with (security_invoker=true) as
select t.id,t.series_id,t.series_sort_order,t.sort_order,c.key as category_key,
       (t.series_id is null or s.show_members) as standalone
from public.templates t
join public.template_category_paths c on c.key=coalesce(t.subcategory_key,t.category_key)
left join public.template_series s on s.id=t.series_id
left join public.template_category_paths sc on sc.key=s.category_key
where t.is_active and 'web'=any(t.visible_in) and c.web_visible
  and (t.series_id is null or (s.is_active and sc.web_visible));

create function public.web_generation_template(p_template_id text) returns setof public.templates
language sql stable security invoker set search_path='' as $$
  select t.* from public.templates t join admin.published_web_members m using(id) where m.id=p_template_id
$$;

-- Resolve the catalogue's default configured route. An env-only route has no
-- model row: apply the baseline plus every currently measured env model floor.
create function admin.web_standard_sale_allowed(template_id text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare t public.templates; route text; price integer;
begin
  select * into t from public.templates where id=template_id and is_active and 'web'=any(visible_in);
  if not found then return false; end if;
  price:=(t.credits_cost->>'1k')::int;
  select p.id::text||'/'||p.model into route from public.ai_providers p where p.module='image' and
    p.id=coalesce((select tp.provider_id from public.template_prompts tp where tp.template_id=t.id and t.id<>'edit'),
                  (select a.id from public.ai_providers a where a.module='image' and a.is_active));
  if route is not null then return admin.template_route_allowed(t,route,'1k',price,false); end if;
  if not admin.template_route_allowed(t,'env/unknown','1k',price,false) then return false; end if;
  if not admin.is_template_catalog_v2() then return true; end if;
  return not exists (
    select j.provider from public.generation_jobs j where j.provider like 'env/_%'
      and j.status='succeeded' and j.cost_usd is not null and j.created_at>=now()-interval '30 days'
      and j.inputs->>'resolution'='1k' and j.inputs->>'quality'=t.quality group by j.provider
    having count(*)>=10 and not admin.template_route_allowed(t,j.provider,'1k',price,false)
  );
end $$;

create or replace view public.web_template_members with (security_invoker=true) as
select m.* from admin.published_web_members m where admin.web_standard_sale_allowed(m.id);

-- The web server resolves the actual image model (including runtime fallback)
-- before this call. Stop at the first rejected route in grid order.
create function public.unavailable_batch_template(p_routes jsonb) returns text
language plpgsql stable security definer set search_path='' as $$
declare candidate record; t public.templates;
begin
  if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes) not between 1 and 30
    then raise exception 'INVALID_INPUT'; end if;
  for candidate in select * from jsonb_to_recordset(p_routes)
    as r(template_id text,resolution text,provider text,expected_credits integer,fallback_route boolean)
  loop
    if candidate.template_id is null then raise exception 'INVALID_INPUT'; end if;
    select * into t from public.web_generation_template(candidate.template_id);
    if not found or not admin.template_route_allowed(t,candidate.provider,candidate.resolution,
        candidate.expected_credits,coalesce(candidate.fallback_route,false)) then return candidate.template_id; end if;
  end loop;
  return null;
end $$;

revoke all on function admin.reservation_route_allowed(public.templates,text,text,integer,boolean,boolean),
  admin.job_route_allowed(public.templates,text,text,integer,boolean),
  admin.template_route_allowed(public.templates,text,text,integer,boolean)
  from public,anon,authenticated,service_role;
revoke all on function admin.web_standard_sale_allowed(text) from public;
grant execute on function admin.web_standard_sale_allowed(text) to anon,authenticated,service_role;
revoke all on admin.published_web_members from public,anon,authenticated,service_role;
grant select on admin.published_web_members to anon,authenticated,service_role;

revoke all on function public.unavailable_batch_template(jsonb) from public, anon, authenticated;
grant execute on function public.unavailable_batch_template(jsonb) to service_role;

revoke all on function public.web_generation_template(text) from public, anon, authenticated;
grant execute on function public.web_generation_template(text) to service_role;
