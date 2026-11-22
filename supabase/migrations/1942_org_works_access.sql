-- 企业作品 (1941), the maker's side: once they leave the org (org_access_ended_at set), its works
-- look missing everywhere they could reach them. Their own reads (RLS here; the server's
-- service-role reads filter the same column in core/jobs), sharing (a link already made stops
-- showing them, its image routes included, since both read through read_work_share), downloads,
-- the visibility switch, and deleting. Edits, redraws and again are refused at insert (1941).
-- Each function below is its 0340 / 0724 / 1320 / 1871 body plus that one column check, and for
-- delete_own_job the org-work rule. Signatures, grants and errors are unchanged.

-- Restrictive, so it narrows generation_jobs_select_own without touching it.
create policy generation_jobs_org_access on public.generation_jobs
  as restrictive for select to authenticated
  using (org_access_ended_at is null);

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

  if (select count(*) from public.work_shares where user_id = p_user_id and revoked_at is null) >= 200 then
    raise exception 'WORK_SHARE_LIMIT';
  end if;

  insert into public.work_shares (user_id, job_ids, show_before, title, note)
  values (p_user_id, p_job_ids, coalesce(p_show_before, false), v_title, v_note)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_work_shares(
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
         and j.org_access_ended_at is null
    ) live
   where s.user_id = p_user_id
     and (p_before_at is null or (s.created_at, s.id) < (p_before_at, p_before_id))
   order by s.created_at desc, s.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.read_work_share(p_share_id text)
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
         and j.org_access_ended_at is null
    ), '[]'::jsonb)
  )
    from public.work_shares s
    join public.profiles p on p.id = s.user_id
   where s.id = p_share_id and s.revoked_at is null and p.banned_at is null;
$$;

create or replace function public.record_job_download(p_job_id uuid, p_user_id uuid, p_ip inet default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_jobs
     set downloaded_at = coalesce(downloaded_at, now()),
         download_ip = case when downloaded_at is null then p_ip else download_ip end,
         download_count = download_count + 1
   where id = p_job_id
     and user_id = p_user_id
     and status = 'succeeded'
     and deleted_at is null
     and org_access_ended_at is null;
  return found;
end;
$$;

create or replace function public.set_job_visibility(p_job_id uuid, p_user_id uuid, p_visibility text)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  if p_visibility is null or p_visibility not in ('public', 'private') then
    raise exception 'INVALID_INPUT' using detail = 'visibility must be public or private';
  end if;

  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id and deleted_at is null and org_access_ended_at is null
     for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;

  -- An org work is gallery-excluded (1941), so it stays private here too.
  if v_job.gallery_excluded then
    if p_visibility = 'public' then
      raise exception 'WORK_PRIVATE_ONLY';
    end if;
    return v_job;
  end if;

  if v_job.credit_pool = 'free' and p_visibility = 'private' then
    raise exception 'FREE_WORK_PUBLIC';
  end if;

  update public.generation_jobs set visibility = p_visibility where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;

-- An org work belongs to the org, so a member cannot delete it (deleting also removes its files):
-- ORG_WORK_DELETE_FORBIDDEN. The org's owner deletes their own org works like any other.
create or replace function public.delete_own_job(p_job_id uuid, p_user_id uuid)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs;
begin
  select * into v_job from public.generation_jobs
   where id = p_job_id and user_id = p_user_id and org_access_ended_at is null
     for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if v_job.deleted_at is not null then
    return v_job;
  end if;
  if v_job.status = 'running' then
    raise exception 'JOB_RUNNING';
  end if;
  if v_job.org_id is not null
     and not exists (select 1 from public.orgs o where o.id = v_job.org_id and o.owner_user_id = p_user_id) then
    raise exception 'ORG_WORK_DELETE_FORBIDDEN';
  end if;

  update public.generation_jobs
     set deleted_at = now(), inputs = inputs - 'note' - 'copy' - 'instruction'
   where id = p_job_id
  returning * into v_job;
  return v_job;
end;
$$;
