create function public.admin_affiliate_create(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_invited boolean;
begin
  perform public._affiliate_require_admin(p_actor);
  select u.invited_at is not null and u.email_confirmed_at is null into strict v_invited from auth.users u where id=v_user for update;
  insert into public.affiliates(user_id,slug,status,application,approved_at,approved_by)
    values(v_user,p_input->>'slug',case when v_invited then 'pending' else 'active' end,
      case when v_invited then '{"source":"admin_invite"}'::jsonb else '{}' end,now(),p_actor);
  perform public._affiliate_overrides(v_user,p_input->'overrides');
  perform public._affiliate_audit(p_actor,'create',v_user::text);
end;
$$;
create function public._affiliate_accept_invite() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.affiliates set status='active' where user_id=new.id and status='pending' and application->>'source'='admin_invite';
  return null;
end;
$$;
create trigger affiliate_accept_invite after update of email_confirmed_at on auth.users for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null and new.invited_at is not null)
  execute function public._affiliate_accept_invite();

create function public.admin_affiliate_decide(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_status text:=p_input->>'status'; v_reason text:=nullif(trim(p_input->>'reason'),'');
begin
  perform public._affiliate_require_admin(p_actor);
  if v_status not in ('active','rejected') or v_status is null or (v_status='rejected' and v_reason is null) then raise exception 'INVALID_INPUT'; end if;
  update public.affiliates set status=v_status,slug=coalesce(p_input->>'slug',slug),reject_reason=case when v_status='rejected' then v_reason end,
    approved_by=case when v_status='active' then p_actor end,approved_at=case when v_status='active' then now() end
    where user_id=v_user and status='pending' and application->>'source' is distinct from 'admin_invite';
  if not found then raise exception 'AFFILIATE_NOT_PENDING'; end if;
  perform public._affiliate_audit(p_actor,'decide',v_user::text,coalesce(v_reason,v_status));
end;
$$;
create function public.admin_affiliate_set(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_parent uuid:=(p_input->>'parent_user_id')::uuid; v_status text:=p_input->>'status';
begin
  perform public._affiliate_require_admin(p_actor);
  if v_status is not null and v_status not in ('active','suspended','banned') then raise exception 'INVALID_INPUT'; end if;
  if p_input ? 'parent_user_id' then
    -- Serialize only rare admin hierarchy edits; concurrent A->B and B->A cannot race.
    perform pg_advisory_xact_lock(hashtextextended('affiliate_parent_edit',0));
    if exists(with recursive ancestors(id) as (select v_parent union
      select a.parent_user_id from public.affiliates a join ancestors on ancestors.id=a.user_id)
      select from ancestors where id=v_user) then raise exception 'AFFILIATE_PARENT_CYCLE'; end if;
  end if;
  update public.affiliates set status=coalesce(v_status,status),slug=coalesce(p_input->>'slug',slug),
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
create function public.admin_affiliate_rebind(p_actor uuid,p_input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_owner uuid:=(p_input->>'affiliate_user_id')::uuid;
  v_reason text:=nullif(trim(p_input->>'reason'),''); v_old uuid;
begin
  perform public._affiliate_require_admin(p_actor);
  if v_reason is null or not(p_input ? 'affiliate_user_id') or v_user=v_owner then raise exception 'INVALID_INPUT'; end if;
  select referred_by into strict v_old from public.profiles where id=v_user for update;
  update public.profiles set referred_by=v_owner,referred_source=case when v_owner is not null then 'admin' end,
    referred_at=case when v_owner is not null then now() end where id=v_user;
  perform public._affiliate_audit(p_actor,'rebind',v_user::text,
    concat(coalesce(v_old::text,'∅'),' → ',coalesce(v_owner::text,'∅'),' ',v_reason));
end;
$$;

revoke all on function public.admin_affiliate_create(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_create(uuid,jsonb) to service_role;

revoke all on function public._affiliate_accept_invite() from public,anon,authenticated,service_role;

revoke all on function public.admin_affiliate_decide(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_decide(uuid,jsonb) to service_role;

revoke all on function public.admin_affiliate_set(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_set(uuid,jsonb) to service_role;

revoke all on function public.admin_affiliate_rebind(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_rebind(uuid,jsonb) to service_role;
