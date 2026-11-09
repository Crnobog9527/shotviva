-- T86: the business inquiry form's one write (ARCHITECTURE §10.c). The server has validated the
-- fields; this checks the limits and stores the row in one round trip:
--   per IP (hashed): 3 in the last hour, 10 in the last 24 hours;
--   per email (case-insensitive): 3 in the last 24 hours.
-- Answers {status, id}: status 'ok' with the new id, or which limit was hit ('ip_hourly',
-- 'ip_daily', 'email_daily') with id null, so the caller can say "try again later".
-- Advisory locks per IP hash and per email (always in that order) make concurrent submissions
-- queue up, so two at once cannot both pass a count.

create function public.submit_business_inquiry(p_inquiry jsonb, p_ip_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_inquiry ->> 'email'));
  v_id uuid;
begin
  if v_email is null or v_email = '' then
    raise exception 'INVALID_INPUT' using detail = 'email is required';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT' using detail = 'ip_hash must be a sha256 hex digest';
  end if;

  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('inquiry:ip:' || p_ip_hash, 0));
    if (select count(*) from public.business_inquiries b
         where b.ip_hash = p_ip_hash and b.created_at > now() - interval '1 hour') >= 3 then
      return jsonb_build_object('status', 'ip_hourly', 'id', null);
    end if;
    if (select count(*) from public.business_inquiries b
         where b.ip_hash = p_ip_hash and b.created_at > now() - interval '24 hours') >= 10 then
      return jsonb_build_object('status', 'ip_daily', 'id', null);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inquiry:email:' || v_email, 0));
  if (select count(*) from public.business_inquiries b
       where lower(b.email) = v_email and b.created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('status', 'email_daily', 'id', null);
  end if;

  insert into public.business_inquiries (
    locale, page, user_id, name, email, company, monthly_volume, uses, message,
    job_title, website, wechat, phone, team_size, country, platforms, needs, start_time, ip_hash
  ) values (
    p_inquiry ->> 'locale',
    p_inquiry ->> 'page',
    (p_inquiry ->> 'user_id')::uuid,
    p_inquiry ->> 'name',
    v_email,
    p_inquiry ->> 'company',
    p_inquiry ->> 'monthly_volume',
    array(select jsonb_array_elements_text(coalesce(p_inquiry -> 'uses', '[]'::jsonb))),
    p_inquiry ->> 'message',
    p_inquiry ->> 'job_title',
    p_inquiry ->> 'website',
    p_inquiry ->> 'wechat',
    p_inquiry ->> 'phone',
    p_inquiry ->> 'team_size',
    p_inquiry ->> 'country',
    array(select jsonb_array_elements_text(coalesce(p_inquiry -> 'platforms', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_inquiry -> 'needs', '[]'::jsonb))),
    p_inquiry ->> 'start_time',
    p_ip_hash
  )
  returning id into v_id;

  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

revoke execute on function public.submit_business_inquiry(jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_business_inquiry(jsonb, text) to service_role;
