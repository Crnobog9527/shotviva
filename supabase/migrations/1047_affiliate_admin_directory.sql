-- The directory first chooses 31 identities. Only those members need financial aggregates.
create index affiliates_application_name_prefix_idx
  on public.affiliates (lower(left(application->>'name',254)) text_pattern_ops);
create index affiliates_parent_member_page_idx
  on public.affiliates (parent_user_id,created_at desc,user_id desc) where parent_user_id is not null;

-- Private shared projection for the directory, the team tab and one member's dossier.
create view admin.affiliate_directory_rows with (security_invoker=true) as
select a.user_id,a.slug,a.status,a.application->>'source' as source,
  nullif(btrim(a.application->>'name'),'') as name,nullif(u.email,'')::text as email,
  nullif(u.phone,'')::text as phone,a.team_enabled,
  case when a.team_enabled then (select count(*) from public.affiliates child where child.parent_user_id=a.user_id and child.status='active') end as team_count,
  a.created_at,(b.confirmed+b.pending+coalesce((select sum(c.amount) from public.affiliate_commissions c
    where c.affiliate_user_id=a.user_id and c.status='on_hold'),0))::bigint as total,
  b.confirmed,(b.available+b.pending)::bigint as unwithdrawn,b.paid
from public.affiliates a join auth.users u on u.id=a.user_id
join public.affiliate_balances b on b.affiliate_user_id=a.user_id;
revoke all on admin.affiliate_directory_rows from public,anon,authenticated,service_role;

create function public.admin_affiliate_directory(p_actor uuid,p_query text default null,p_review text default null,
  p_parent uuid default null,p_before_at timestamptz default null,p_before_id uuid default null)
returns table(user_id uuid,slug text,status text,source text,name text,email text,phone text,team_enabled boolean,
  team_count bigint,created_at timestamptz,total bigint,confirmed bigint,unwithdrawn bigint,paid bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_q text:=nullif(lower(btrim(p_query)),''); v_prefix text; v_phone text; v_user uuid;
begin
  perform public._affiliate_require_admin(p_actor);
  if length(v_q)>254 or p_review not in ('pending','rejected') or (p_before_at is null)<>(p_before_id is null)
    then raise exception 'INVALID_INPUT'; end if;
  if v_q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_user:=v_q::uuid; end if;
  if v_q ~ '^\+?[0-9][0-9 ()-]*$' then v_phone:=regexp_replace(v_q,'[^0-9]','','g'); end if;
  v_prefix:=replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_')||'%';
  return query with matches as (
    select a.user_id from public.affiliates a where a.user_id=v_user
    union all select a.user_id from public.affiliates a where v_prefix is not null and a.slug like v_prefix
    union all select a.user_id from public.affiliates a
      where v_prefix is not null and lower(left(a.application->>'name',254)) like v_prefix
    union all select u.id from auth.users u where position('@' in v_q)>0 and u.email=v_q
    union all select u.id from auth.users u where v_phone is not null and u.phone in (v_phone,'+'||v_phone,
      case when v_phone ~ '^1[3-9][0-9]{9}$' then '86'||v_phone end)
  ), page as materialized (
    select a.user_id,a.created_at from public.affiliates a
    where (v_q is null or a.user_id in (select m.user_id from matches m))
      and (p_review is null or (a.status=p_review and a.application->>'source' is distinct from 'admin_invite'))
      and (p_parent is null or a.parent_user_id=p_parent)
      and (p_before_at is null or (a.created_at,a.user_id)<(p_before_at,p_before_id))
    order by a.created_at desc,a.user_id desc limit 31
  )
  select r.user_id,r.slug,r.status,r.source,r.name,r.email,r.phone,r.team_enabled,r.team_count,r.created_at,
    r.total,r.confirmed,r.unwithdrawn,r.paid
  from page join admin.affiliate_directory_rows r on r.user_id=page.user_id order by page.created_at desc,page.user_id desc;
end;
$$;
revoke all on function public.admin_affiliate_directory(uuid,text,text,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_directory(uuid,text,text,uuid,timestamptz,uuid) to service_role;

create function public.admin_affiliate_dossier(p_actor uuid,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public._affiliate_require_admin(p_actor);
  select to_jsonb(r)||jsonb_build_object(
    'registered_at',u.created_at,'country',a.country,'parent_user_id',a.parent_user_id,'application',a.application,
    'payout_method',a.payout_method,'payout_details',a.payout_details,'us_person',a.us_person,
    'terms_version',a.terms_version,'terms_accepted_at',a.terms_accepted_at,'admin_note',a.admin_note,
    'approved_at',a.approved_at,'approved_by',a.approved_by,'reject_reason',a.reject_reason,'reapply_allowed',a.reapply_allowed,
    'rates',(select coalesce(jsonb_agg(jsonb_build_object('product_kind',o.product_kind,'l1_bp',o.l1_bp,'l2_bp',o.l2_bp)
      order by o.product_kind),'[]'::jsonb) from public.affiliate_rate_overrides o where o.user_id=r.user_id))
    into v_result from admin.affiliate_directory_rows r join public.affiliates a on a.user_id=r.user_id
      join auth.users u on u.id=r.user_id where r.user_id=p_user;
  return v_result;
end;
$$;
revoke all on function public.admin_affiliate_dossier(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_dossier(uuid,uuid) to service_role;
