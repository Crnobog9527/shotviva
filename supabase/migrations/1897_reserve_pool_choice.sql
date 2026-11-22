-- Org members pay with org credits only, and choose which kind (ARCHITECTURE §6.5 企业推广积分池,
-- the Owner 2026-11-22: 「出图时让员工自选」, and 「在职成员只用企业积分」).
--
-- An active member (staff, role 'member'; the org's owner keeps their own credits, which they can
-- also deposit into the pool) of an org generates ONLY from the org's shares in their account: the paid share
-- min(held_credits, credits) and the promotion share min(held_promo_credits, free_credits) while
-- the org's promotion month is live. Their own credits stay frozen while they are a member (usable
-- again once they leave), and one job is never paid partly by the org and partly by the member.
--  - Holding both shares, a web job may choose (inputs.pool_choice): 'paid' charges the paid pool,
--    'promo' the free pool (a free work, watermarked). A chosen kind that cannot cover the price is
--    refused (POOL_CHOICE_INSUFFICIENT), never charged from the other kind. A honoured choice is
--    remembered in profiles.org_pool_choice.
--  - Otherwise (no choice, one kind, any non-web source) the org paid share pays if it covers the
--    price, else the org promotion share; neither covers it: ORG_CREDITS_INSUFFICIENT (the member
--    asks the org's admin; personal credits are never used).
-- The whole price comes out of the org's share: the paid share trigger (1629) now draws a member's
-- reserve from held_credits first (it used to spend own credits first), as the promotion trigger
-- (1892) already does, so the draw tables hold the job's full cost (org work stamping reads them).
-- Everyone who is not an active member keeps paid-first-then-free on their own credits. Batches
-- stay paid only (reserve_batch_cell refuses a free cell, unchanged). Poster photo extraction
-- (start_poster_photo) follows the same pool rule.
--
-- reserve_credits and start_poster_photo are re-created from their current bodies with only the
-- pool selection replaced by _reserve_pool (same signatures and answers).

create function public._reserve_pool(p_profile public.profiles, p_cost integer, p_source text, p_choice text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_member boolean := false;
  v_paid integer;
  v_promo integer;
  v_pool text;
begin
  if p_choice is not null and p_choice not in ('paid', 'promo') then
    raise exception 'INVALID_INPUT' using detail = 'pool_choice must be paid or promo';
  end if;
  select true, least(m.held_credits, p_profile.credits),
         case when o.promo_expires_at > now() then least(m.held_promo_credits, p_profile.free_credits) else 0 end
    into v_member, v_paid, v_promo
    from public.org_members m join public.orgs o on o.id = m.org_id
   where m.user_id = p_profile.id and m.status = 'active' and m.role = 'member';
  if not coalesce(v_member, false) then
    if p_profile.credits >= p_cost then return 'paid'; end if;
    if p_profile.free_credits >= p_cost then return 'free'; end if;
    raise exception 'CREDITS_INSUFFICIENT';
  end if;
  if p_choice is not null and p_source = 'web' and v_paid > 0 and v_promo > 0 then
    v_pool := case p_choice when 'paid' then 'paid' else 'free' end;
    if (case when v_pool = 'paid' then v_paid else v_promo end) < p_cost then
      raise exception 'POOL_CHOICE_INSUFFICIENT';
    end if;
    if p_profile.org_pool_choice is distinct from p_choice then
      update public.profiles set org_pool_choice = p_choice where id = p_profile.id;
    end if;
    return v_pool;
  end if;
  if v_paid >= p_cost then return 'paid'; end if;
  if v_promo >= p_cost then return 'free'; end if;
  raise exception 'ORG_CREDITS_INSUFFICIENT';
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

-- Poster photo extraction: the same pool rule.
create or replace function public.start_poster_photo(p_user_id uuid, p_provider text, p_per_hour integer) returns table(extraction_id bigint, credits integer)
language plpgsql security definer set search_path = '' as $_$
declare
  v_profile public.profiles;
  v_price integer;
  v_pool text;
  v_id bigint;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_profile.banned_at is not null then raise exception 'USER_BANNED'; end if;

  select (s.value #>> '{}')::integer into v_price from public.system_settings s
   where s.key = 'poster_photo_credits' and jsonb_typeof(s.value) = 'number' and (s.value #>> '{}') ~ '^[1-9][0-9]*$';
  if v_price is null then raise exception 'PRICE_UNSET'; end if;

  if (select count(*) from public.poster_extractions e
       where e.user_id = p_user_id and e.created_at >= now() - interval '1 hour') >= p_per_hour then
    raise exception 'RATE_LIMITED';
  end if;

  -- Paid first, then free; org members from org shares only (1897).
  v_pool := public._reserve_pool(v_profile, v_price, 'web', null);

  insert into public.poster_extractions (user_id, source, input_chars, status, provider, credits, credit_pool)
  values (p_user_id, 'photo', 0, 'pending', p_provider, v_price, v_pool)
  returning id into v_id;

  perform public._apply_credit_change(p_user_id, v_pool, 'reserve', -v_price, 'poster photo',
    'poster_photo:' || v_id::text || ':reserve');
  return query select v_id, v_price;
end;
$_$;

-- The paid share follows what a member spends (1629), except that a member's reserve now takes
-- the org's share first (the whole price: _reserve_pool only lets the share pay). Every other
-- paid debit (a clawback, an admin adjustment) still spends the member's own credits first.
create or replace function public._org_held_follows_ledger() returns trigger
language plpgsql security definer set search_path = '' as $_$
declare
  m public.org_members;
  d public.org_held_draws;
  back integer;
  v_draw integer;
begin
  if new.delta < 0 then
    select * into m from public.org_members where user_id = new.user_id and status = 'active' for update;
    if not found then return new; end if;
    v_draw := case when new.kind = 'reserve' then least(m.held_credits, -new.delta)
                   else greatest(0, m.held_credits - new.balance_after) end;
    if v_draw > 0 or m.held_credits > new.balance_after then
      update public.org_members set held_credits = least(held_credits - v_draw, new.balance_after) where org_id = m.org_id and user_id = m.user_id;
    end if;
    if v_draw > 0 then
      insert into public.org_held_draws(debit_key, org_id, user_id, drawn) values (new.idempotency_key, m.org_id, m.user_id, v_draw);
    end if;
  elsif new.kind = 'refund' then
    select * into d from public.org_held_draws
     where debit_key = regexp_replace(new.idempotency_key, ':[^:]+$', ':reserve') and user_id = new.user_id for update;
    if not found or d.restored >= d.drawn then return new; end if;
    back := least(new.delta, d.drawn - d.restored);
    select * into m from public.org_members where org_id = d.org_id and user_id = d.user_id and status = 'active' for update;
    if not found then
      -- Left before the refund: the org's part goes back to the org, not to the member.
      update public.org_held_draws set restored = restored + back where debit_key = d.debit_key;
      perform public._apply_credit_change(new.user_id, 'paid', 'org_reclaim', -back, 'org:' || d.org_id::text,
        'org_return:' || new.idempotency_key);
      insert into public.org_pool_returns(refund_key, org_id, user_id, credits) values (new.idempotency_key, d.org_id, d.user_id, back);
      return new;
    end if;
    update public.org_members set held_credits = least(held_credits + back, new.balance_after)
     where org_id = m.org_id and user_id = m.user_id;
    update public.org_held_draws set restored = restored + back where debit_key = d.debit_key;
  end if;
  return new;
end;
$_$;
