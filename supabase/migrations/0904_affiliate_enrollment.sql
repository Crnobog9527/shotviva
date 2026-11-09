create function public.affiliate_can_apply(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select s.enabled and case s.apply_min_level when 'none' then true else exists (
    select 1 from public.payments p where p.user_id=p_user and p.amount_total>p.amount_refunded
      and p.product_id ~ '^(starter|pro|max)_(monthly|yearly)$'
      and array_position(array['starter','pro','max'],split_part(p.product_id,'_',1)) >=
          coalesce(array_position(array['starter','pro','max'],s.apply_min_level),1)
  ) end from public.affiliate_settings s where s.singleton;
$$;
create function public.affiliate_apply(p_user uuid,p_application jsonb,p_parent_slug text,p_terms_version text) returns void
language plpgsql security definer set search_path='' as $$
declare v_parent uuid; v_version text;
begin
  select terms_version into strict v_version from public.affiliate_settings where singleton and enabled for share;
  if p_terms_version is distinct from v_version then raise exception 'AFFILIATE_TERMS_CHANGED'; end if;
  if not public.affiliate_can_apply(p_user) then raise exception 'AFFILIATE_INELIGIBLE'; end if;
  if p_application is null or jsonb_typeof(p_application)<>'object' or
     exists(select from unnest(array['name','country','channel','audience','plan']) k
       where nullif(trim(p_application->>k),'') is null) then raise exception 'INVALID_INPUT'; end if;
  select user_id into v_parent from public.affiliates where slug=p_parent_slug and status='active' and team_enabled and user_id<>p_user;
  insert into public.affiliates(user_id,slug,parent_user_id,country,application,terms_version,terms_accepted_at)
    values(p_user,'sv-' || substr(replace(gen_random_uuid()::text,'-',''),1,20),v_parent,
           p_application->>'country',p_application - 'source',v_version,now());
end;
$$;
create function public.affiliate_save_profile(p_user uuid,p_payout_method text,p_payout_details text,p_us_person boolean,p_terms_version text)
returns void language plpgsql security definer set search_path='' as $$
declare v_version text;
begin
  select terms_version into strict v_version from public.affiliate_settings where singleton and enabled for share;
  if p_terms_version is distinct from v_version then raise exception 'AFFILIATE_TERMS_CHANGED'; end if;
  if (p_payout_method is null) <> (nullif(trim(p_payout_details),'') is null) then raise exception 'INVALID_INPUT'; end if;
  update public.affiliates set payout_method=p_payout_method,payout_details=nullif(trim(p_payout_details),''),
    us_person=p_us_person,terms_version=v_version,
    terms_accepted_at=case when terms_version is distinct from v_version then now() else coalesce(terms_accepted_at,now()) end
    where user_id=p_user;
  if not found then raise exception 'AFFILIATE_NOT_FOUND'; end if;
end;
$$;
create function public.affiliate_bind(p_user uuid,p_slug text,p_source text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  if p_source not in ('signup','first_checkout') or p_source is null then return false; end if;
  if not (select enabled from public.affiliate_settings where singleton) then return false; end if;
  select user_id into v_owner from public.affiliates where slug=p_slug and status='active' and user_id<>p_user;
  if not found then return false; end if;
  -- Billing already takes the profile row lock in settle_checkout. Lock before observing payment history.
  perform 1 from public.profiles where id=p_user and referred_by is null for update;
  if not found then return false; end if;
  if p_source='first_checkout' and exists(select from public.payments where user_id=p_user) then return false; end if;
  update public.profiles set referred_by=v_owner,referred_at=now(),referred_source=p_source where id=p_user and referred_by is null;
  return found;
end;
$$;
create function public.affiliate_count_click(p_slug text) returns void language sql security definer set search_path='' as $$
  insert into public.affiliate_click_days(affiliate_user_id,day,clicks)
    select a.user_id,(now() at time zone 'UTC')::date,1 from public.affiliates a,public.affiliate_settings s
    where s.singleton and s.enabled and a.slug=p_slug and a.status='active'
    on conflict(affiliate_user_id,day) do update set clicks=public.affiliate_click_days.clicks+1;
$$;

revoke all on function public.affiliate_can_apply(uuid) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_can_apply(uuid) to service_role;

revoke all on function public.affiliate_apply(uuid,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_apply(uuid,jsonb,text,text) to service_role;

revoke all on function public.affiliate_save_profile(uuid,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_save_profile(uuid,text,text,boolean,text) to service_role;

revoke all on function public.affiliate_bind(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_bind(uuid,text,text) to service_role;

revoke all on function public.affiliate_count_click(text) from public,anon,authenticated,service_role;
grant execute on function public.affiliate_count_click(text) to service_role;
