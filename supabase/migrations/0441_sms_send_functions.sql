-- T63: the two steps of an SMS code (ARCHITECTURE §7). Limits, all over the last 24 hours:
--   one code per number per 60 seconds, 5 per number, 20 per IP.
-- Both answer a status word instead of raising, so the caller can say which limit was hit:
--   'ok' | 'phone_cooldown' | 'phone_daily' | 'ip_daily' | 'no_request' (authorize only)
-- A per-number advisory lock (and a per-IP one for the request) makes concurrent calls for the
-- same number or IP queue up, so two at once cannot both pass the count.

-- Step 1, the server action, before it asks Supabase to send: counts every request, sent or
-- not (Supabase test numbers never reach the hook, and they still count).
create function public.sms_request_send(p_phone_key text, p_ip inet)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '24 hours';
begin
  if p_phone_key is null or p_phone_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'phone_key must be a sha256 hex digest';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sms:phone:' || p_phone_key, 0));
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('sms:ip:' || host(p_ip), 0));
  end if;

  if exists (select 1 from public.sms_sends s
              where s.phone_key = p_phone_key and s.requested_at > now() - interval '60 seconds') then
    return 'phone_cooldown';
  end if;
  if (select count(*) from public.sms_sends s
       where s.phone_key = p_phone_key and s.requested_at > v_since) >= 5 then
    return 'phone_daily';
  end if;
  if p_ip is not null and (select count(*) from public.sms_sends s
                            where s.ip = p_ip and s.requested_at > v_since) >= 20 then
    return 'ip_daily';
  end if;

  insert into public.sms_sends (phone_key, ip) values (p_phone_key, p_ip);
  -- The rows have done their job after a day; keep two, then let them go.
  delete from public.sms_sends s
   where s.id in (select o.id from public.sms_sends o
                   where o.requested_at < now() - interval '2 days'
                   order by o.requested_at
                   limit 200);
  return 'ok';
end;
$$;

-- Step 2, the Send SMS hook, before any provider is called: there must be a request from the
-- last 2 minutes that has not been sent yet, and the sent codes must still be under the limits
-- for the number and for the IP that request came from. Marks that request sent.
create function public.sms_authorize_send(p_phone_key text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '24 hours';
  v_request public.sms_sends;
begin
  if p_phone_key is null or p_phone_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'phone_key must be a sha256 hex digest';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sms:phone:' || p_phone_key, 0));

  select * into v_request
    from public.sms_sends s
   where s.phone_key = p_phone_key and s.sent_at is null and s.requested_at > now() - interval '2 minutes'
   order by s.requested_at desc
   limit 1
   for update;
  if not found then
    return 'no_request';
  end if;

  if exists (select 1 from public.sms_sends s
              where s.phone_key = p_phone_key and s.sent_at > now() - interval '60 seconds') then
    return 'phone_cooldown';
  end if;
  if (select count(*) from public.sms_sends s
       where s.phone_key = p_phone_key and s.sent_at > v_since) >= 5 then
    return 'phone_daily';
  end if;
  if v_request.ip is not null and (select count(*) from public.sms_sends s
                                    where s.ip = v_request.ip and s.sent_at > v_since) >= 20 then
    return 'ip_daily';
  end if;

  update public.sms_sends set sent_at = now() where id = v_request.id;
  return 'ok';
end;
$$;

revoke execute on function public.sms_request_send(text, inet) from public, anon, authenticated;
grant execute on function public.sms_request_send(text, inet) to service_role;
revoke execute on function public.sms_authorize_send(text) from public, anon, authenticated;
grant execute on function public.sms_authorize_send(text) to service_role;

-- When Supabase refused before the hook ran (a failed hCaptcha, its own limit), the request
-- sent nothing and should not count against the number: drop the newest unsent request of the
-- last 2 minutes. Without this anyone could use up a stranger's 5 a day with failed checks.
create function public.sms_release_send(p_phone_key text)
returns void
language sql
set search_path = ''
as $$
  delete from public.sms_sends s
   where s.id = (select o.id from public.sms_sends o
                  where o.phone_key = p_phone_key and o.sent_at is null
                    and o.requested_at > now() - interval '2 minutes'
                  order by o.requested_at desc
                  limit 1)
$$;

revoke execute on function public.sms_release_send(text) from public, anon, authenticated;
grant execute on function public.sms_release_send(text) to service_role;
