-- T94 phase 2, ARCHITECTURE §6.4. Keep at most ten timestamps per account, including
-- rejected attempts. No submitted code is recorded here. Signup calls redeem_code directly.
alter table public.profiles add column code_redeem_attempts timestamptz[] not null default '{}';

create function public.redeem_limited_code(
  p_user uuid, p_code text, p_context text, p_invitee_credits integer,
  p_invite_window_days integer, p_replace boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  checked_at timestamptz;
  attempts timestamptz[];
  result jsonb;
begin
  if p_user is null or p_context is null or p_context not in ('account','paywall') then
    raise exception 'INVALID_INPUT';
  end if;
  -- Serialize this quota without taking a profile lock ahead of redeem_code: reciprocal
  -- invites lock both profiles in sorted order, which must remain the first profile locks.
  perform pg_advisory_xact_lock(hashtextextended('shotviva.code_redeem:' || p_user::text, 0));
  checked_at := clock_timestamp();
  select array(select t from unnest(p.code_redeem_attempts) as a(t)
                where t > checked_at - interval '1 hour')
    into attempts from public.profiles p where id = p_user;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if cardinality(attempts) >= 10 then return jsonb_build_object('status', 'rate_limited'); end if;

  if p_code is null or p_code !~ '^[A-Za-z0-9]{4,20}$' then
    result := jsonb_build_object('status', 'invalid_input');
  else
    result := public.redeem_code(p_user,p_code,p_context,p_invitee_credits,p_invite_window_days,p_replace);
  end if;
  update public.profiles set code_redeem_attempts = array_append(attempts, checked_at) where id = p_user;
  return result;
end;
$$;
revoke all on function public.redeem_limited_code(uuid,text,text,integer,integer,boolean) from public, anon, authenticated;
grant execute on function public.redeem_limited_code(uuid,text,text,integer,integer,boolean) to service_role;
