-- T77: ban or unban up to 50 selected users at once (ARCHITECTURE §10.a 「批量操作」), with one
-- reason. Each user goes through admin_ban_user / admin_unban_user, so a batch ban also revokes
-- the Graylum link and writes one audit row per user, exactly as banning one does.
--
-- All or nothing, in one transaction: every user is locked in id order first; nobody changes when
--   - an account is missing: PROFILE_NOT_FOUND,
--   - a ban would hit an admin or the acting admin themself: PROTECTED_USER,
-- each with the offending ids, comma-separated, in the error detail, so the page can name them.
--
-- Who did it: p_actor is the signed-in admin, checked here as well (NOT_ADMIN unless that profile's
-- role is admin); every audit row's reason ends with 「· 操作人 <actor id>」.
--
-- Idempotent: only users whose state actually changes are touched (a ban skips users already
-- banned, keeping their first ban time; an unban skips users not banned), so submitting the same
-- batch again changes nobody and writes no second audit row.

create function public.admin_batch_set_banned(p_actor uuid, p_user_ids uuid[], p_banned boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_ids uuid[];
  v_bad uuid[];
  v_id uuid;
  v_changed integer := 0;
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if p_banned is null then
    raise exception 'INVALID_INPUT' using detail = 'banned must be true or false';
  end if;
  if length(v_reason) = 0 or length(v_reason) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'reason is required, at most 500 characters';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 or cardinality(p_user_ids) > 50
     or array_position(p_user_ids, null) is not null then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 50 users';
  end if;

  select array_agg(distinct i order by i) into v_ids from unnest(p_user_ids) as i;
  if cardinality(v_ids) <> cardinality(p_user_ids) then
    raise exception 'INVALID_INPUT' using detail = 'a user is listed twice';
  end if;

  perform 1 from public.profiles where id = any(v_ids) order by id for update;

  select array_agg(i order by i) into v_bad
    from unnest(v_ids) as i
   where not exists (select 1 from public.profiles p where p.id = i);
  if v_bad is not null then
    raise exception 'PROFILE_NOT_FOUND' using detail = array_to_string(v_bad, ',');
  end if;

  if p_banned then
    select array_agg(p.id order by p.id) into v_bad
      from public.profiles p
     where p.id = any(v_ids) and (p.role = 'admin' or p.id = p_actor);
    if v_bad is not null then
      raise exception 'PROTECTED_USER' using detail = array_to_string(v_bad, ',');
    end if;
  end if;

  for v_id in
    select p.id from public.profiles p
     where p.id = any(v_ids) and (p.banned_at is null) = p_banned
     order by p.id
  loop
    if p_banned then
      perform public.admin_ban_user(v_id, v_reason || ' · 操作人 ' || p_actor::text);
    else
      perform public.admin_unban_user(v_id, v_reason || ' · 操作人 ' || p_actor::text);
    end if;
    v_changed := v_changed + 1;
  end loop;

  return jsonb_build_object('changed', v_changed, 'unchanged', cardinality(v_ids) - v_changed);
end;
$$;

revoke execute on function public.admin_batch_set_banned(uuid, uuid[], boolean, text) from public, anon, authenticated;
grant execute on function public.admin_batch_set_banned(uuid, uuid[], boolean, text) to service_role;
