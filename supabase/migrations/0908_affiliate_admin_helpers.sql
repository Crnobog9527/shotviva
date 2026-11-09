create function public._affiliate_require_admin(p_actor uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
end;
$$;
create function public._affiliate_audit(p_actor uuid,p_action text,p_target text,p_reason text default null)
returns void language sql security definer set search_path='' as $$
  insert into public.admin_audit_log(action,user_id,target_id,reason)
    values('affiliate_' || p_action,p_actor,p_target,coalesce(nullif(trim(p_reason),''),'affiliate_' || p_action));
$$;
create function public._affiliate_overrides(p_user uuid,p_values jsonb) returns void language sql security definer set search_path='' as $$
  insert into public.affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp)
    select p_user,r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_values) r(product_kind text,l1_bp integer,l2_bp integer)
    on conflict(user_id,product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
$$;

revoke all on function public._affiliate_require_admin(uuid) from public,anon,authenticated,service_role;

revoke all on function public._affiliate_audit(uuid,text,text,text) from public,anon,authenticated,service_role;

revoke all on function public._affiliate_overrides(uuid,jsonb) from public,anon,authenticated,service_role;
