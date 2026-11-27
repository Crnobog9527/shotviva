-- Mutual exclusion between the personal affiliate program and enterprise orgs (ARCHITECTURE §6.5,
-- Owner 2026-11-21): an org owner or member never also holds a personal affiliate account, and a
-- personal affiliate never owns or joins an org. "Open" personal account = pending or active;
-- a rejected or suspended one is closed (the Owner settles and closes it before binding the person
-- to an org), and the admin cannot reactivate it while that person is in an org.
--
-- Lock order: the profile row first (FOR NO KEY UPDATE), then the other side's rows. org_join locks
-- the org row before the profile, which is safe because nothing here locks an org row.

create function public._affiliate_personal_open(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from public.affiliates a where a.user_id=p_user and a.org_id is null and a.status in ('pending','active'));
$$;
create function public._org_active_member(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from public.org_members m where m.user_id=p_user and m.status='active');
$$;
revoke all on function public._affiliate_personal_open(uuid) from public,anon,authenticated,service_role;
revoke all on function public._org_active_member(uuid) from public,anon,authenticated,service_role;

-- The application form is hidden for org members (it reads this), and affiliate_apply refuses them.
create or replace function public.affiliate_can_apply(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select s.enabled and not public._org_active_member(p_user) and case s.apply_min_level when 'none' then true else exists (
    select 1 from public.payments p join admin.catalog_products c on c.product_id=p.product_id
     where p.user_id=p_user and p.amount_total>p.amount_refunded and c.kind<>'pack'
       and array_position(array['starter','pro','max'],c.tier) >=
         coalesce(array_position(array['starter','pro','max'],s.apply_min_level),1)
  ) end from public.affiliate_settings s where s.singleton
$$;

create or replace function public.affiliate_apply(p_user uuid,p_application jsonb,p_parent_slug text,p_terms_version text) returns void
language plpgsql security definer set search_path='' as $$
declare v_parent uuid; v_version text;
begin
  select terms_version into strict v_version from public.affiliate_settings where singleton and enabled for share;
  if p_terms_version is distinct from v_version then raise exception 'AFFILIATE_TERMS_CHANGED'; end if;
  -- Serializes with org_join / admin_org_create on the same account.
  perform 1 from public.profiles where id=p_user for no key update;
  if public._org_active_member(p_user) then raise exception 'AFFILIATE_ORG_MEMBER'; end if;
  if not public.affiliate_can_apply(p_user) then raise exception 'AFFILIATE_INELIGIBLE'; end if;
  if p_application is null or jsonb_typeof(p_application)<>'object' or
     exists(select from unnest(array['name','country','channel','audience','plan']) k
       where nullif(trim(p_application->>k),'') is null) then raise exception 'INVALID_INPUT'; end if;
  select user_id into v_parent from public.affiliates where slug=p_parent_slug and status='active' and team_enabled and user_id<>p_user;

  insert into public.affiliates as a(user_id,slug,parent_user_id,country,application,terms_version,terms_accepted_at)
    values(p_user,'sv-' || substr(replace(gen_random_uuid()::text,'-',''),1,20),v_parent,
           p_application->>'country',p_application - 'source',v_version,now())
    on conflict(user_id) do update
      set application=excluded.application,country=excluded.country,terms_version=excluded.terms_version,
          terms_accepted_at=excluded.terms_accepted_at,status='pending',reject_reason=null,reapply_allowed=false
      where a.status='rejected' and a.reapply_allowed and a.org_id is null;
  if not found then raise exception 'AFFILIATE_APPLICATION_EXISTS'; end if;
end;
$$;

create or replace function public.admin_affiliate_create(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_invited boolean;
begin
  perform public._affiliate_require_admin(p_actor);
  select u.invited_at is not null and u.email_confirmed_at is null into strict v_invited
    from auth.users u where id=v_user for update;
  perform 1 from public.profiles where id=v_user for no key update;
  if public._org_active_member(v_user) then raise exception 'AFFILIATE_ORG_MEMBER'; end if;
  insert into public.affiliates(user_id,slug,status,application,approved_at,approved_by,admin_label)
    values(v_user,p_input->>'slug',case when v_invited then 'pending' else 'active' end,
      case when v_invited then '{"source":"admin_invite"}'::jsonb else '{}' end,
      case when not v_invited then now() end,p_actor,nullif(btrim(p_input->>'admin_label'),''));
  perform public._affiliate_overrides(v_user,p_input->'overrides');
  perform public._affiliate_audit(p_actor,'create',v_user::text);
end;
$$;

-- Admin edits: a closed personal account of an org member stays closed, and an org account never
-- gets a parent or a team (it earns level 1 / level 2 from its own customers only). Org accounts'
-- status is otherwise the admin's, and follows orgs.affiliate_enabled (1643).
create or replace function public.admin_affiliate_set(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_parent uuid:=(p_input->>'parent_user_id')::uuid; v_status text:=p_input->>'status';
  v_org uuid;
begin
  perform public._affiliate_require_admin(p_actor);
  if v_status is not null and v_status not in ('active','suspended','banned') then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.profiles where id=v_user for no key update;
  select org_id into v_org from public.affiliates where user_id=v_user;
  if v_org is null and v_status='active' and public._org_active_member(v_user) then raise exception 'AFFILIATE_ORG_MEMBER'; end if;
  if v_org is not null and (coalesce((p_input->>'team_enabled')::boolean,false) or v_parent is not null
     or (v_status='active' and not exists(select from public.orgs o where o.id=v_org and o.affiliate_enabled))) then
    raise exception 'AFFILIATE_ORG_ACCOUNT';
  end if;
  if p_input ? 'parent_user_id' then
    -- Serialize only rare admin hierarchy edits; concurrent A->B and B->A cannot race.
    perform pg_advisory_xact_lock(hashtextextended('affiliate_parent_edit',0));
    if exists(with recursive ancestors(id) as (select v_parent union
      select a.parent_user_id from public.affiliates a join ancestors on ancestors.id=a.user_id)
      select from ancestors where id=v_user) then raise exception 'AFFILIATE_PARENT_CYCLE'; end if;
  end if;
  -- An admin status change takes over from the org switch (1643 restores only switch suspensions).
  update public.affiliates set status=coalesce(v_status,status),slug=coalesce(p_input->>'slug',slug),
    suspended_by_org_switch=case when v_status is not null then false else suspended_by_org_switch end,
    team_enabled=coalesce((p_input->>'team_enabled')::boolean,team_enabled),
    parent_user_id=case when p_input ? 'parent_user_id' then v_parent else parent_user_id end,
    admin_note=case when p_input ? 'admin_note' then p_input->>'admin_note' else admin_note end
    where user_id=v_user and status in ('active','suspended','banned');
  if not found then raise exception 'AFFILIATE_NOT_FOUND'; end if;
  perform public._affiliate_overrides(v_user,p_input->'overrides');
  if v_status='banned' and (p_input->>'void_unconfirmed')::boolean then
    with targets as materialized (
      select id,status,amount from public.affiliate_commissions where affiliate_user_id=v_user and status in ('pending','on_hold') for update
    ), changed as (
      update public.affiliate_commissions c set status='void',amount=0,void_reason='admin_void',updated_at=now()
      from targets t where t.id=c.id returning c.id,t.status,t.amount)
    insert into public.affiliate_commission_changes(commission_id,old_amount,new_amount,old_status,new_status,reason)
      select id,amount,0,status,'void','admin_void' from changed;
  end if;
  perform public._affiliate_audit(p_actor,'set',v_user::text,coalesce(v_status,'settings'));
end;
$$;

-- A manual rebind moves the customer to another account (or none): the org member and level-1
-- customer recorded by an org attribution no longer apply.
create or replace function public.admin_affiliate_rebind(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_owner uuid:=(p_input->>'affiliate_user_id')::uuid;
  v_reason text:=nullif(trim(p_input->>'reason'),''); v_old uuid;
begin
  perform public._affiliate_require_admin(p_actor);
  if v_reason is null or not(p_input ? 'affiliate_user_id') or v_user=v_owner then raise exception 'INVALID_INPUT'; end if;
  select referred_by into strict v_old from public.profiles where id=v_user for update;
  update public.profiles set referred_by=v_owner,referred_source=case when v_owner is not null then 'admin' end,
    referred_at=case when v_owner is not null then now() end,referred_member=null,referred_via=null where id=v_user;
  perform public._affiliate_audit(p_actor,'rebind',v_user::text,
    concat(coalesce(v_old::text,'∅'),' → ',coalesce(v_owner::text,'∅'),' ',v_reason));
end;
$$;

create or replace function public.org_join(p_user uuid, p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  current_org uuid;
begin
  if p_user is null or p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'ORG_INVITE_INVALID'; end if;
  select * into o from public.orgs where invite_token = p_token for no key update;
  if not found then raise exception 'ORG_INVITE_INVALID'; end if;
  if o.status <> 'active' then raise exception 'ORG_SUSPENDED'; end if;
  perform 1 from public.profiles where id = p_user and banned_at is null for no key update;
  if not found then raise exception 'USER_BANNED'; end if;
  select org_id into current_org from public.org_members where user_id = p_user and status = 'active';
  if current_org = o.id then return o.id; end if;
  if current_org is not null then raise exception 'ORG_MEMBER_EXISTS'; end if;
  if public._affiliate_personal_open(p_user) then raise exception 'ORG_PERSONAL_AFFILIATE'; end if;
  insert into public.org_members(org_id, user_id, role) values (o.id, p_user, 'member')
    on conflict (org_id, user_id) do update set status = 'active', removed_at = null, joined_at = now(),
      monthly_allowance = 0, held_credits = 0;
  return o.id;
end;
$$;

create or replace function public.admin_org_create(p_actor uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (p_input->>'owner_user_id')::uuid;
  v_org public.orgs;
begin
  perform public._org_require_admin(p_actor);
  perform public._org_check_limits(p_input);
  if v_owner is null or nullif(trim(p_input->>'name'), '') is null
     or (p_input ? 'affiliate_levels' and coalesce(p_input->>'affiliate_levels', '') not in ('1','2')) then
    raise exception 'INVALID_INPUT';
  end if;
  perform 1 from public.profiles where id = v_owner and banned_at is null for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if exists(select from public.org_members where user_id = v_owner and status = 'active')
     or exists(select from public.orgs where owner_user_id = v_owner) then
    raise exception 'ORG_MEMBER_EXISTS';
  end if;
  if public._affiliate_personal_open(v_owner) then raise exception 'ORG_PERSONAL_AFFILIATE'; end if;
  -- With the affiliate switch on, the insert also creates the owner's org account (1643).
  insert into public.orgs(name, owner_user_id, concurrency, per_window, batch_max, multi_template_max,
      batch_zip, early_features, affiliate_enabled, affiliate_levels, admin_note, created_by)
    values (trim(p_input->>'name'), v_owner, (p_input->>'concurrency')::integer, (p_input->>'per_window')::integer,
      (p_input->>'batch_max')::integer, (p_input->>'multi_template_max')::integer,
      coalesce((p_input->>'batch_zip')::boolean, false), coalesce((p_input->>'early_features')::boolean, false),
      coalesce((p_input->>'affiliate_enabled')::boolean, false), coalesce((p_input->>'affiliate_levels')::smallint, 1),
      nullif(trim(p_input->>'admin_note'), ''), p_actor)
    returning * into v_org;
  insert into public.org_members(org_id, user_id, role) values (v_org.id, v_owner, 'owner');
  perform public._org_audit(p_actor, 'org_create', v_org.id::text, 'owner:' || v_owner::text);
  return v_org.id;
end;
$$;
