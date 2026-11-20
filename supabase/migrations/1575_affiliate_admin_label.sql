-- Admin-only display name for an affiliate. Self-applied affiliates often leave the application
-- name empty, so the admin directory showed only "unnamed" next to a phone number. The column is
-- never granted to clients (affiliates is service_role-only) and is written only by admin RPCs.
alter table public.affiliates add column admin_label text;
alter table public.affiliates add constraint affiliates_admin_label_check
  check (admin_label is null or char_length(admin_label) between 1 and 60);
create index affiliates_admin_label_prefix_idx on public.affiliates (lower(admin_label) text_pattern_ops)
  where admin_label is not null;

-- Same projection as 1047 with admin_label appended (create or replace may only add trailing columns).
create or replace view admin.affiliate_directory_rows with (security_invoker=true) as
select a.user_id,a.slug,a.status,a.application->>'source' as source,
  nullif(btrim(a.application->>'name'),'') as name,nullif(u.email,'')::text as email,
  nullif(u.phone,'')::text as phone,a.team_enabled,
  case when a.team_enabled then (select count(*) from public.affiliates child where child.parent_user_id=a.user_id and child.status='active') end as team_count,
  a.created_at,(b.confirmed+b.pending+coalesce((select sum(c.amount) from public.affiliate_commissions c
    where c.affiliate_user_id=a.user_id and c.status='on_hold'),0))::bigint as total,
  b.confirmed,(b.available+b.pending)::bigint as unwithdrawn,b.paid,a.admin_label
from public.affiliates a join auth.users u on u.id=a.user_id
join public.affiliate_balances b on b.affiliate_user_id=a.user_id;

-- Versioned copy of admin_affiliate_directory (1047), kept alongside it because the returned row gains admin_label and
-- a function cannot change its row type in place. The old function stays untouched for the code still in production.
create function public.admin_affiliate_directory_v2(p_actor uuid,p_query text default null,p_review text default null,
  p_parent uuid default null,p_before_at timestamptz default null,p_before_id uuid default null)
returns table(user_id uuid,slug text,status text,source text,name text,email text,phone text,team_enabled boolean,
  team_count bigint,created_at timestamptz,total bigint,confirmed bigint,unwithdrawn bigint,paid bigint,admin_label text)
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
    union all select a.user_id from public.affiliates a
      where v_prefix is not null and a.admin_label is not null and lower(a.admin_label) like v_prefix
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
    r.total,r.confirmed,r.unwithdrawn,r.paid,r.admin_label
  from page join admin.affiliate_directory_rows r on r.user_id=page.user_id order by page.created_at desc,page.user_id desc;
end;
$$;
revoke all on function public.admin_affiliate_directory_v2(uuid,text,text,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_directory_v2(uuid,text,text,uuid,timestamptz,uuid) to service_role;

-- Editing the label or the free-text note of any affiliate, whatever its status. Only keys that are
-- present change; an empty or null value clears. Records "set" in the audit log (shown in the dossier).
create function public.admin_affiliate_annotate(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_label text:=nullif(btrim(p_input->>'admin_label'),'');
  v_note text:=nullif(btrim(p_input->>'admin_note'),'');
begin
  perform public._affiliate_require_admin(p_actor);
  if length(v_label)>60 or length(v_note)>2000 then raise exception 'INVALID_INPUT'; end if;
  update public.affiliates set
    admin_label=case when p_input ? 'admin_label' then v_label else admin_label end,
    admin_note=case when p_input ? 'admin_note' then v_note else admin_note end
    where user_id=v_user;
  if not found then raise exception 'AFFILIATE_NOT_FOUND'; end if;
  perform public._affiliate_audit(p_actor,'set',v_user::text,'annotate');
end;
$$;
revoke all on function public.admin_affiliate_annotate(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_affiliate_annotate(uuid,jsonb) to service_role;

-- Enrollment from the user dialog may carry the label too. Body as in schema.sql plus admin_label.
create or replace function public.admin_affiliate_create(p_actor uuid,p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(p_input->>'user_id')::uuid; v_invited boolean;
begin
  perform public._affiliate_require_admin(p_actor);
  select u.invited_at is not null and u.email_confirmed_at is null into strict v_invited
    from auth.users u where id=v_user for update;
  insert into public.affiliates(user_id,slug,status,application,approved_at,approved_by,admin_label)
    values(v_user,p_input->>'slug',case when v_invited then 'pending' else 'active' end,
      case when v_invited then '{"source":"admin_invite"}'::jsonb else '{}' end,
      case when not v_invited then now() end,p_actor,nullif(btrim(p_input->>'admin_label'),''));
  perform public._affiliate_overrides(v_user,p_input->'overrides');
  perform public._affiliate_audit(p_actor,'create',v_user::text);
end;
$$;
