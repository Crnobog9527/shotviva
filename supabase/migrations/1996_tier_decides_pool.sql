-- The output tier decides which credit pool pays (Owner 2026-11-23, every template; ARCHITECTURE
-- §6.1, §6.5). A 1K work may be paid ONLY from the free pool (signup / promo gifts; for an active
-- org member the org's promotion share), so it is always a free work (watermarked, public unless
-- org-funded, non-commercial). A 2K or 4K work may be paid ONLY from the paid pool (for an org
-- member the org's paid share). There is no fallback to the other pool: when the tier's pool
-- cannot cover the price the reserve is refused (CREDITS_INSUFFICIENT; ORG_CREDITS_INSUFFICIENT
-- for an active member, whose own credits stay frozen as in 1897). A member's pool_choice and the
-- remembered profiles.org_pool_choice no longer pick the pool of a web job; a malformed choice is
-- still INVALID_INPUT. Prices are data and are not touched here.
--
-- Scope: web jobs (the site: single photos, posters and batch cells, which reach this through
-- reserve_batch_cell; it still refuses a free cell, so a 1K batch is refused as a whole).
-- 作品编辑 (the `edit` template) is exempt (Owner 2026-11-23: only 2K is sold, open to both pools):
-- it keeps the 1897 rule, paid first then free, and a free-pool edit stays a free work.
-- Partner calls (source graylum, which send no resolution and so are always 1K) keep the 1897
-- rule unchanged, as does poster photo extraction (start_poster_photo, a 1-credit text step, not
-- an image tier), which keeps calling _reserve_pool.
--
-- Expand-only: a new private helper, and reserve_credits re-created from its 1897 body with only
-- the pool selection call changed (same signature and return type). Code already in production
-- keeps working; a paid-only account asking for 1K is now refused, which is intended.

create function public._reserve_pool_for_tier(p_profile public.profiles, p_cost integer, p_source text, p_choice text, p_resolution text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pool text := case when p_resolution = '1k' then 'free' else 'paid' end;
  v_member boolean := false;
  v_paid integer;
  v_promo integer;
begin
  if p_source <> 'web' then
    return public._reserve_pool(p_profile, p_cost, p_source, p_choice);
  end if;
  if p_choice is not null and p_choice not in ('paid', 'promo') then
    raise exception 'INVALID_INPUT' using detail = 'pool_choice must be paid or promo';
  end if;
  -- Same org shares as _reserve_pool (1897): the paid share, and the promotion share while the
  -- org's promotion month is live.
  select true, least(m.held_credits, p_profile.credits),
         case when o.promo_expires_at > now() then least(m.held_promo_credits, p_profile.free_credits) else 0 end
    into v_member, v_paid, v_promo
    from public.org_members m join public.orgs o on o.id = m.org_id
   where m.user_id = p_profile.id and m.status = 'active';
  if not coalesce(v_member, false) then
    if (case when v_pool = 'paid' then p_profile.credits else p_profile.free_credits end) >= p_cost then return v_pool; end if;
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  if (case when v_pool = 'paid' then v_paid else v_promo end) >= p_cost then return v_pool; end if;
  raise exception 'ORG_CREDITS_INSUFFICIENT';
end;
$$;
revoke all on function public._reserve_pool_for_tier(public.profiles, integer, text, text, text) from public, anon, authenticated, service_role;

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
  -- The tier decides the pool (1996): 1K from free credits only, 2K/4K from paid credits only.
  -- An edit keeps the 1897 rule (paid first, then free; org members from org shares only).
  v_pool := case when p_template_id = 'edit'
    then public._reserve_pool(v_profile, v_cost, p_source, p_inputs->>'pool_choice')
    else public._reserve_pool_for_tier(v_profile, v_cost, p_source, p_inputs->>'pool_choice', v_resolution) end;

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
