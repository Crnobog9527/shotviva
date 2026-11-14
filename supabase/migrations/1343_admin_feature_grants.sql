-- /admin/features: add an invited account (1342) by its email or phone number, remove one by its
-- account id, and list the invited accounts. Only an unbanned admin may change the list; who did it is kept on the row.
-- Accounts that sign in with a phone (mainland China) have no email, so both are accepted.
create function public.admin_set_feature_grant(p_actor uuid, p_key text, p_account text, p_granted boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_account text := lower(btrim(coalesce(p_account, '')));
  v_digits text := regexp_replace(v_account, '\D', '', 'g');
  v_user uuid;
begin
  if not exists(select from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{0,39}$' or v_account = '' or p_granted is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  -- The admin page removes an invite by the account id it listed.
  if v_account ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_user := v_account::uuid;
  elsif position('@' in v_account) > 0 then
    select id into v_user from auth.users where lower(email) = v_account;
  elsif length(v_digits) >= 6 then
    select id into v_user from auth.users
      where phone in (v_digits, '86' || v_digits) order by created_at limit 1;
  end if;
  if v_user is null or not exists(select from public.profiles where id = v_user) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_granted then
    insert into public.feature_user_grants (feature_key, user_id, granted_by)
    values (p_key, v_user, p_actor) on conflict do nothing;
  else
    delete from public.feature_user_grants where feature_key = p_key and user_id = v_user;
  end if;
  return v_user;
end;
$$;

revoke all on function public.admin_set_feature_grant(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_feature_grant(uuid, text, text, boolean) to service_role;

-- Newest first; the email or phone is what the admin typed to find the account again.
create function public.admin_list_feature_grants(p_key text)
returns table (user_id uuid, email text, phone text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.user_id, u.email::text, u.phone::text, g.created_at
  from public.feature_user_grants g join auth.users u on u.id = g.user_id
  where g.feature_key = p_key
  order by g.created_at desc
  limit 200
$$;

revoke all on function public.admin_list_feature_grants(text) from public, anon, authenticated;
grant execute on function public.admin_list_feature_grants(text) to service_role;
