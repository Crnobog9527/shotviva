-- 作品集分享 (Owner 2026-11-23): the owner's list of their share links is gone, so nobody can turn
-- a link off any more and WORK_SHARE_LIMIT ("turn some off first") could never be resolved.
-- create_work_share now keeps the live-link cap itself: when the owner already has 200 live
-- links, the oldest ones are revoked to make room for the new one instead of raising. The hourly
-- and daily limits (WORK_SHARE_RATE_LIMITED) are unchanged. The body is 1942's with only the cap
-- step changed; signature, grants and every other error stay the same. revoke_work_share and
-- list_work_shares stay in place (expand-only), unused by the app.

create or replace function public.create_work_share(
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
  -- The profile row lock serializes one owner's creates, so the live count below is exact.
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
         and moderation_status <> 'rejected' and org_access_ended_at is null) <> v_count then
    raise exception 'WORK_SHARE_JOB_NOT_FOUND';
  end if;

  if (select count(*) from public.work_shares where user_id = p_user_id and created_at > now() - interval '1 hour') >= 20
     or (select count(*) from public.work_shares where user_id = p_user_id and created_at > now() - interval '1 day') >= 100 then
    raise exception 'WORK_SHARE_RATE_LIMITED';
  end if;

  -- At most 200 live links: keep the newest 199, revoke the rest, then add this one.
  update public.work_shares s set revoked_at = now()
   where s.id in (
     select l.id from public.work_shares l
      where l.user_id = p_user_id and l.revoked_at is null
      order by l.created_at desc, l.id desc
      offset 199
   );

  insert into public.work_shares (user_id, job_ids, show_before, title, note)
  values (p_user_id, p_job_ids, coalesce(p_show_before, false), v_title, v_note)
  returning id into v_id;
  return v_id;
end;
$$;
