-- 出图时让员工自选 (ARCHITECTURE §6.5 企业推广积分池, the Owner 2026-11-22). A member of an org who
-- holds BOTH kinds of org credits (a paid share min(held_credits, credits) > 0 and a promotion
-- share min(held_promo_credits, free_credits) > 0 while the org's promotion month is live) picks
-- per generation which kind pays: inputs.pool_choice = 'paid' or 'promo'.
--  - 'paid': the paid pool (own paid credits first, then the org's paid share, as always);
--  - 'promo': the free pool (the org's promotion share first, then own free credits): a free work;
--  - the chosen pool cannot cover the price: POOL_CHOICE_INSUFFICIENT, never the other pool.
-- Everyone else, and every non-web source (partner API, Graylum), keeps paid-first-then-free and
-- the choice is ignored. A honoured choice is remembered in profiles.org_pool_choice. Batches stay
-- paid only (reserve_batch_cell refuses a free cell, unchanged).
--
-- reserve_credits is re-created from its current body with only the pool selection moved into
-- _reserve_pool (same signature and answers).

-- The pool a reserve charges. The caller holds the profile row (reserve_credits locks it first).
create function public._reserve_pool(p_profile public.profiles, p_cost integer, p_source text, p_choice text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_both boolean := false;
  v_pool text;
begin
  if p_choice is not null and p_choice not in ('paid', 'promo') then
    raise exception 'INVALID_INPUT' using detail = 'pool_choice must be paid or promo';
  end if;
  if p_choice is not null and p_source = 'web' then
    select least(m.held_credits, p_profile.credits) > 0 and least(m.held_promo_credits, p_profile.free_credits) > 0
      into v_both
      from public.org_members m join public.orgs o on o.id = m.org_id
     where m.user_id = p_profile.id and m.status = 'active' and o.promo_expires_at > now();
  end if;
  if coalesce(v_both, false) then
    v_pool := case p_choice when 'paid' then 'paid' else 'free' end;
    if (case when v_pool = 'paid' then p_profile.credits else p_profile.free_credits end) < p_cost then
      raise exception 'POOL_CHOICE_INSUFFICIENT';
    end if;
    if p_profile.org_pool_choice is distinct from p_choice then
      update public.profiles set org_pool_choice = p_choice where id = p_profile.id;
    end if;
    return v_pool;
  end if;
  if p_profile.credits >= p_cost then return 'paid'; end if;
  if p_profile.free_credits >= p_cost then return 'free'; end if;
  raise exception 'CREDITS_INSUFFICIENT';
end;
$$;
revoke all on function public._reserve_pool(public.profiles, integer, text, text) from public, anon, authenticated, service_role;

create or replace function public.reserve_credits(p_job_id uuid, p_user_id uuid, p_module text, p_template_id text, p_credits_cost integer, p_source text, p_inputs jsonb DEFAULT '{}'::jsonb, p_provider text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_visibility text DEFAULT NULL::text, p_parent_job_id uuid DEFAULT NULL::uuid) returns public.generation_jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_job public.generation_jobs;
  v_pool text;
  -- The old name 3k (callers before PR-2) is the same tier as 4k; it is stored and priced as 4k.
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
  -- Paid first, then free, unless a member holding both kinds of org credits chose one (1897).
  v_pool := public._reserve_pool(v_profile, v_cost, p_source, p_inputs->>'pool_choice');

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

