alter table public.affiliates add column reapply_allowed boolean not null default false;

create function public.admin_affiliate_allow_reapply(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_reason text;
begin
  perform public._affiliate_require_admin(p_actor);
  update public.affiliates set reapply_allowed=true
    where user_id=v_user and status='rejected' and not reapply_allowed
    returning reject_reason into v_reason;
  if not found then raise exception 'AFFILIATE_NOT_REJECTED'; end if;
  -- Keep the prior reason even for rejected rows that predate this workflow.
  perform public._affiliate_audit(p_actor,'decide',v_user::text,concat('allow_reapply: ',v_reason));
end;
$$;
revoke all on function public.admin_affiliate_allow_reapply(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_allow_reapply(uuid,jsonb) to service_role;

create or replace function public.affiliate_apply(p_user uuid,p_application jsonb,p_parent_slug text,p_terms_version text) returns void
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

  insert into public.affiliates as a(user_id,slug,parent_user_id,country,application,terms_version,terms_accepted_at)
    values(p_user,'sv-' || substr(replace(gen_random_uuid()::text,'-',''),1,20),v_parent,
           p_application->>'country',p_application - 'source',v_version,now())
    on conflict(user_id) do update
      set application=excluded.application,country=excluded.country,terms_version=excluded.terms_version,
          terms_accepted_at=excluded.terms_accepted_at,status='pending',reject_reason=null,reapply_allowed=false
      where a.status='rejected' and a.reapply_allowed;
  if not found then raise exception 'AFFILIATE_APPLICATION_EXISTS'; end if;
end;
$$;
