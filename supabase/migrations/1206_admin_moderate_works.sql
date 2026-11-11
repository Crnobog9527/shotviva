-- T108 (ARCHITECTURE §9 第 5 条, §9.1): a person's decision on up to 50 public works at once, from
-- /admin/gallery. One transaction: the works, their open reports and one audit row per work.
-- Returns how many works it changed (deleted, private or failed works are skipped).
create function public.admin_moderate_works(p_actor uuid, p_job_ids uuid[], p_decision text, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_actor is null or not exists (
      select 1 from public.profiles p where p.id = p_actor and p.role = 'admin' and p.banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_job_ids is null or cardinality(p_job_ids) not between 1 and 50 then
    raise exception 'INVALID_INPUT' using detail = 'between 1 and 50 works';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_INPUT' using detail = 'decision must be approved or rejected';
  end if;
  if p_decision = 'rejected' and (p_reason is null or p_reason not in
      ('sexual', 'violence', 'hate', 'minor', 'privacy', 'ip', 'spam', 'quality', 'other')) then
    raise exception 'INVALID_INPUT' using detail = 'a rejection needs a reason';
  end if;

  with changed as (
    update public.generation_jobs j
       set moderation_status = p_decision,
           moderation_reason = case when p_decision = 'rejected' then p_reason end,
           moderated_at = now(),
           moderated_by = p_actor
     where j.id = any (p_job_ids) and j.status = 'succeeded' and j.visibility = 'public' and j.deleted_at is null
    returning j.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from changed;

  update public.work_reports r set resolved_at = now()
   where r.job_id = any (v_ids) and r.resolved_at is null;

  insert into public.admin_audit_log (action, user_id, reason, target_id)
  select 'moderate_work', p_actor, p_decision || coalesce(':' || case when p_decision = 'rejected' then p_reason end, ''), id::text
    from unnest(v_ids) as id;

  return cardinality(v_ids);
end;
$$;

revoke execute on function public.admin_moderate_works(uuid, uuid[], text, text) from public, anon, authenticated;
grant execute on function public.admin_moderate_works(uuid, uuid[], text, text) to service_role;
