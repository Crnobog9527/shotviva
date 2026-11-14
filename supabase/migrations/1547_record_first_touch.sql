-- Writes an account's first touch once (1546). Called by the sign-in path with the service role
-- after the server has checked the cookie's seal and shape (core/attribution); a second call for
-- the same account changes nothing. Returns whether this call wrote the row.
create function public.record_first_touch(p_user uuid, p_touch jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_written integer;
begin
  if jsonb_typeof(p_touch) is distinct from 'object' or pg_column_size(p_touch) > 4096 then
    raise exception 'FIRST_TOUCH_INVALID' using errcode = '23514';
  end if;
  insert into public.account_first_touch (
    user_id, landing_path, referrer_host, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    share_template_id, share_id, graylum, affiliate_slug, landed_at)
  values (
    p_user, p_touch->>'p', p_touch->>'r', p_touch->>'us', p_touch->>'um', p_touch->>'uc', p_touch->>'ut', p_touch->>'un',
    p_touch->>'st', p_touch->>'si', coalesce((p_touch->>'g')::integer = 1, false), p_touch->>'a',
    to_timestamp((p_touch->>'at')::bigint))
  on conflict (user_id) do nothing;
  get diagnostics v_written = row_count;
  return v_written > 0;
end $$;
revoke all on function public.record_first_touch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_first_touch(uuid, jsonb) to service_role;
