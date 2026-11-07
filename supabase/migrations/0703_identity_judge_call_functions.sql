-- T81 (ARCHITECTURE §5.1a): a slot for one decision call, and its verdict.

-- Answers jsonb:
--   {"status":"cached","identity_swap":bool}  the same words were judged in the last 10 minutes
--   {"status":"limited"}                       p_per_hour calls already made in the last hour
--   {"status":"call","id":n}                   go ahead; report the verdict with that id
-- A null p_text_hash (a photo edit) takes a slot without the reuse. A per-account advisory lock
-- keeps the count exact under concurrent requests. Photos of one batch that start after the
-- first one's verdict reuse it; the few running alongside it (the tier's concurrency) call too.
create function public.begin_identity_judge(p_user_id uuid, p_text_hash text, p_per_hour integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cached boolean;
  v_id bigint;
begin
  if p_user_id is null or p_per_hour is null or p_per_hour < 1 then
    raise exception 'INVALID_INPUT' using detail = 'user and a positive hourly limit are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('identity_judge:' || p_user_id::text, 0));

  if p_text_hash is not null then
    select c.identity_swap into v_cached
      from public.identity_judge_calls c
     where c.user_id = p_user_id and c.text_hash = p_text_hash and c.identity_swap is not null
       and c.created_at > now() - interval '10 minutes'
     order by c.created_at desc
     limit 1;
    if found then
      return jsonb_build_object('status', 'cached', 'identity_swap', v_cached);
    end if;
  end if;

  if (select count(*) from public.identity_judge_calls c
       where c.user_id = p_user_id and c.created_at > now() - interval '1 hour') >= p_per_hour then
    return jsonb_build_object('status', 'limited');
  end if;

  insert into public.identity_judge_calls (user_id, text_hash) values (p_user_id, p_text_hash)
  returning id into v_id;

  delete from public.identity_judge_calls c
   where c.id in (select o.id from public.identity_judge_calls o
                   where o.created_at < now() - interval '1 day'
                   order by o.created_at
                   limit 500);
  return jsonb_build_object('status', 'call', 'id', v_id);
end;
$$;

revoke execute on function public.begin_identity_judge(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.begin_identity_judge(uuid, text, integer) to service_role;

create function public.finish_identity_judge(p_id bigint, p_identity_swap boolean)
returns void
language sql
set search_path = ''
as $$
  update public.identity_judge_calls set identity_swap = p_identity_swap where id = p_id
$$;

revoke execute on function public.finish_identity_judge(bigint, boolean) from public, anon, authenticated;
grant execute on function public.finish_identity_judge(bigint, boolean) to service_role;
