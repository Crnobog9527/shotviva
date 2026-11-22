-- Work collection sharing (ARCHITECTURE §6.2「作品集分享」), the functions on 1870's table. Each is
-- one round trip (AGENTS §5.1), security definer with an empty search_path, and callable by the
-- service role only: the server passes the user it read from the session, and the function
-- checks ownership itself. Nothing here moves credits.

-- Create a link from the caller's own works. Every id must be the caller's own finished, undeleted
-- work: someone else's work, a failed, running or deleted one and a missing one all look the same
-- (WORK_SHARE_JOB_NOT_FOUND), so the error tells nothing about other accounts. A work moderation
-- rejected (an automatic flag, an admin decision, an upheld report: moderation_status =
-- 'rejected') is refused the same way and is never served by a link either. Org works follow the
-- same rule: a work belongs to the member who made it, so an org owner cannot share a member's
-- works. Limits per account: 20 links an hour and 100 a day, revoked ones included, so making and
-- turning off links cannot grow the table without bound (WORK_SHARE_RATE_LIMITED), and at most 200
-- live links (WORK_SHARE_LIMIT). The profile row lock makes the counts exact under concurrent
-- calls; both counts use work_shares_user_created_idx. Returns the new link's id.
create function public.create_work_share(
  p_user_id uuid,
  p_job_ids uuid[],
  p_show_before boolean default false,
  p_title text default null,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_banned timestamptz;
  v_count integer := coalesce(cardinality(p_job_ids), 0);
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id text;
begin
  select banned_at into v_banned from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if v_banned is not null then
    raise exception 'USER_BANNED';
  end if;
  if v_count < 1 or v_count > 30 or array_position(p_job_ids, null) is not null
     or (select count(distinct j) from unnest(p_job_ids) j) <> v_count then
    raise exception 'INVALID_INPUT' using detail = 'one to 30 distinct works';
  end if;
  if (v_title is not null and char_length(v_title) > 80) or (v_note is not null and char_length(v_note) > 500) then
    raise exception 'INVALID_INPUT' using detail = 'title up to 80, note up to 500 characters';
  end if;

  if (select count(*) from public.generation_jobs
       where id = any(p_job_ids) and user_id = p_user_id and status = 'succeeded' and deleted_at is null
         and moderation_status <> 'rejected') <> v_count then
    raise exception 'WORK_SHARE_JOB_NOT_FOUND';
  end if;

  if (select count(*) from public.work_shares where user_id = p_user_id and created_at > now() - interval '1 hour') >= 20
     or (select count(*) from public.work_shares where user_id = p_user_id and created_at > now() - interval '1 day') >= 100 then
    raise exception 'WORK_SHARE_RATE_LIMITED';
  end if;

  if (select count(*) from public.work_shares where user_id = p_user_id and revoked_at is null) >= 200 then
    raise exception 'WORK_SHARE_LIMIT';
  end if;

  insert into public.work_shares (user_id, job_ids, show_before, title, note)
  values (p_user_id, p_job_ids, coalesce(p_show_before, false), v_title, v_note)
  returning id into v_id;
  return v_id;
end;
$$;

-- The owner turns a link off for good. A repeat keeps the first time; someone else's link or a
-- missing one is WORK_SHARE_NOT_FOUND.
create function public.revoke_work_share(p_user_id uuid, p_share_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.work_shares
     set revoked_at = coalesce(revoked_at, now())
   where id = p_share_id and user_id = p_user_id;
  if not found then
    raise exception 'WORK_SHARE_NOT_FOUND';
  end if;
end;
$$;

-- "My share links": one page, newest first, on work_shares_user_created_idx with the
-- (created_at, id) cursor. works counts only the works still shown (a deleted or rejected work drops out);
-- cover_job_id is the first of them, for the row's thumbnail (the owner's own thumbnail route).
create function public.list_work_shares(
  p_user_id uuid,
  p_limit integer default 30,
  p_before_at timestamptz default null,
  p_before_id text default null
)
returns table (
  id text,
  title text,
  show_before boolean,
  created_at timestamptz,
  revoked_at timestamptz,
  works integer,
  cover_job_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.show_before, s.created_at, s.revoked_at, live.works, live.cover
    from public.work_shares s
    cross join lateral (
      select count(*)::integer as works, (array_agg(j.id order by k.ord))[1] as cover
        from unnest(s.job_ids) with ordinality as k(job_id, ord)
        join public.generation_jobs j on j.id = k.job_id
       where j.user_id = s.user_id and j.status = 'succeeded' and j.deleted_at is null and j.moderation_status <> 'rejected'
    ) live
   where s.user_id = p_user_id
     and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
   order by s.created_at desc, s.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- The public read behind /s/w/<id> and its image routes. null for a missing or revoked link and for
-- a banned owner's link. Otherwise the link with its works in the sharer's order, skipping any that
-- were deleted or that moderation rejected after the link was made (and, defensively, any not the
-- owner's or not finished). The page and the image routes both read through here, so a work
-- rejected later disappears from the page and its images answer 404 on the next request.
-- output_key and the owner id are for the server's image routes only; the page sends neither to the browser. ref is the
-- owner's active affiliate code, so the page's "try Shotviva" link keeps their attribution.
create function public.read_work_share(p_share_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'user_id', s.user_id,
    'title', s.title,
    'note', s.note,
    'show_before', s.show_before,
    'created_at', s.created_at,
    'ref', (select a.slug from public.affiliates a where a.user_id = s.user_id and a.status = 'active'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'job_id', j.id,
               'template_id', j.template_id,
               'credit_pool', j.credit_pool,
               'output_key', j.output_key,
               'aspect_ratio', j.inputs ->> 'aspect_ratio'
             ) order by k.ord)
        from unnest(s.job_ids) with ordinality as k(job_id, ord)
        join public.generation_jobs j on j.id = k.job_id
       where j.user_id = s.user_id and j.status = 'succeeded' and j.deleted_at is null and j.moderation_status <> 'rejected'
    ), '[]'::jsonb)
  )
    from public.work_shares s
    join public.profiles p on p.id = s.user_id
   where s.id = p_share_id and s.revoked_at is null and p.banned_at is null;
$$;

revoke execute on function public.create_work_share(uuid, uuid[], boolean, text, text) from public, anon, authenticated;
revoke execute on function public.revoke_work_share(uuid, text) from public, anon, authenticated;
revoke execute on function public.list_work_shares(uuid, integer, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.read_work_share(text) from public, anon, authenticated;
grant execute on function public.create_work_share(uuid, uuid[], boolean, text, text) to service_role;
grant execute on function public.revoke_work_share(uuid, text) to service_role;
grant execute on function public.list_work_shares(uuid, integer, timestamptz, text) to service_role;
grant execute on function public.read_work_share(text) to service_role;
