-- Audit target ids are namespaced by action: commission #7 is unrelated to payout #7.
create index affiliate_audit_target_page_idx on public.admin_audit_log(target_id,action,created_at desc,id desc)
  where target_id is not null;
-- 0909 records rebindings as "old UUID → new UUID note" with the buyer as target.
-- Index only the structured prefix, never the free-text operator note.
create index affiliate_rebind_participants_idx on public.admin_audit_log using gin
  ((array[target_id,split_part(reason,' ',1),split_part(reason,' ',3)]))
  where action='affiliate_rebind';

create function public.admin_affiliate_dossier_log(p_actor uuid,p_user uuid,
  p_before_at timestamptz default null,p_before_id bigint default null)
returns table(id bigint,created_at timestamptz,action text,user_id uuid,target_id text,reason text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  if (p_before_at is null)<>(p_before_id is null) then raise exception 'INVALID_INPUT'; end if;
  if not exists(select from public.affiliates a where a.user_id=p_user) then return; end if;
  return query with targets(operation,target) as (
    select unnest(array['affiliate_create','affiliate_decide','affiliate_set']),p_user::text
    union all select 'affiliate_adjust',j.id::text from public.affiliate_adjustments j where j.affiliate_user_id=p_user
    union all select 'affiliate_payout_decide',p.id::text from public.affiliate_payouts p where p.affiliate_user_id=p_user
    union all select 'affiliate_commission_release',c.id::text from public.affiliate_commissions c where c.affiliate_user_id=p_user
    union all select 'affiliate_recompute',c.payment_id::text from public.affiliate_commissions c where c.affiliate_user_id=p_user
  ), events as (
    select l.id,l.created_at,l.action,l.user_id,l.target_id,l.reason
      from targets t join public.admin_audit_log l on (l.action,l.target_id)=(t.operation,t.target)
    union all
    select l.id,l.created_at,l.action,l.user_id,l.target_id,l.reason from public.admin_audit_log l
      where l.action='affiliate_rebind' and array[l.target_id,split_part(l.reason,' ',1),split_part(l.reason,' ',3)] @> array[p_user::text]
  )
  select e.id,e.created_at,e.action,e.user_id,e.target_id,e.reason from events e
    where p_before_at is null or (e.created_at,e.id)<(p_before_at,p_before_id)
    order by e.created_at desc,e.id desc limit 31;
end;
$$;
revoke all on function public.admin_affiliate_dossier_log(uuid,uuid,timestamptz,bigint) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_dossier_log(uuid,uuid,timestamptz,bigint) to service_role;

create function public.admin_affiliate_commission_history(p_actor uuid,p_user uuid,p_commission bigint,p_level smallint,
  p_before_at timestamptz default null,p_before_id bigint default null)
returns table(id bigint,at timestamptz,old_amount bigint,new_amount bigint,old_status text,new_status text,reason text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public._affiliate_require_admin(p_actor);
  if p_level is null or p_level not in (1,2) or (p_before_at is null)<>(p_before_id is null)
    then raise exception 'INVALID_INPUT'; end if;
  return query select h.id,h.at,h.old_amount,h.new_amount,h.old_status,h.new_status,h.reason
    from public.affiliate_commissions c join public.affiliate_commission_changes h on h.commission_id=c.id
    where c.id=p_commission and c.affiliate_user_id=p_user and c.level=p_level
      and (p_before_at is null or (h.at,h.id)<(p_before_at,p_before_id))
    order by h.at desc,h.id desc limit 31;
end;
$$;
revoke all on function public.admin_affiliate_commission_history(uuid,uuid,bigint,smallint,timestamptz,bigint) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_commission_history(uuid,uuid,bigint,smallint,timestamptz,bigint) to service_role;
