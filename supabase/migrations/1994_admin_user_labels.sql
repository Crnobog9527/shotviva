-- One admin-only name tag per account, shown next to the email or phone on /admin/users
-- (Owner 2026-11-23: invited KOCs are only a phone number in the list). An affiliate already has
-- one (affiliates.admin_label, 1576); for them the tag IS that column, so the users list and the
-- affiliate admin show and edit the same value. This table holds the tag of everyone else.
-- Never granted to clients: RLS on with no policies, written only by the function below.
create table public.admin_user_labels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);
alter table public.admin_user_labels enable row level security;
revoke all on table public.admin_user_labels from public, anon, authenticated;
grant select on table public.admin_user_labels to service_role;

-- Sets (or clears, with null or blank) the tag of any account. An affiliate's goes to its
-- admin_label, audited like the affiliate admin's own edit; anyone else's to the table above.
-- Returns the tag now in force.
create function public.admin_set_user_label(p_actor uuid, p_user uuid, p_label text) returns text
language plpgsql security definer set search_path='' as $$
declare v_label text:=nullif(btrim(p_label),'');
begin
  perform public._affiliate_require_admin(p_actor);
  if p_user is null or char_length(v_label)>60 then raise exception 'INVALID_INPUT'; end if;
  if not exists(select from auth.users where id=p_user) then raise exception 'USER_NOT_FOUND'; end if;
  update public.affiliates set admin_label=v_label where user_id=p_user;
  if found then
    perform public._affiliate_audit(p_actor,'set',p_user::text,'annotate');
    delete from public.admin_user_labels where user_id=p_user;
  elsif v_label is null then
    delete from public.admin_user_labels where user_id=p_user;
  else
    insert into public.admin_user_labels(user_id,label,updated_by) values (p_user,v_label,p_actor)
    on conflict (user_id) do update set label=excluded.label, updated_at=now(), updated_by=excluded.updated_by;
  end if;
  return v_label;
end;
$$;
revoke all on function public.admin_set_user_label(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_user_label(uuid,uuid,text) to service_role;
