-- An unconfirmed Auth invitation reserves the slug. Approval starts at activation.
create or replace function public.admin_affiliate_create(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_invited boolean;
begin
  perform public._affiliate_require_admin(p_actor);
  select u.invited_at is not null and u.email_confirmed_at is null into strict v_invited
    from auth.users u where id=v_user for update;
  insert into public.affiliates(user_id,slug,status,application,approved_at,approved_by)
    values(v_user,p_input->>'slug',case when v_invited then 'pending' else 'active' end,
      case when v_invited then '{"source":"admin_invite"}'::jsonb else '{}' end,
      case when not v_invited then now() end,p_actor);
  perform public._affiliate_overrides(v_user,p_input->'overrides');
  perform public._affiliate_audit(p_actor,'create',v_user::text);
end;
$$;

create or replace function public._affiliate_accept_invite() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.affiliates set status='active',approved_at=now()
    where user_id=new.id and status='pending' and application->>'source'='admin_invite';
  return null;
end;
$$;

-- Preserve every other approval stamp, including already activated invitations.
update public.affiliates set approved_at=null
  where status='pending' and application->>'source'='admin_invite';
