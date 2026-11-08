-- T81 (ARCHITECTURE §5.1a): marking a decision call that failed open, and the counts
-- /admin/providers shows. identity_judge_calls keeps a day of rows (0703), enough for 24 hours.

create function public.fail_identity_judge(p_id bigint)
returns void
language sql
set search_path = ''
as $$
  update public.identity_judge_calls set failed = true where id = p_id
$$;

revoke execute on function public.fail_identity_judge(bigint) from public, anon, authenticated;
grant execute on function public.fail_identity_judge(bigint) to service_role;

-- Calls made, refused and failed open over the last p_hours (1 to 24), every account together.
-- Reads identity_judge_calls_created_at_idx.
create function public.admin_identity_judge_stats(p_hours integer)
returns table (calls integer, refused integer, failed_open integer)
language sql
stable
set search_path = ''
as $$
  select count(*)::integer as calls,
         (count(*) filter (where c.identity_swap))::integer as refused,
         (count(*) filter (where c.failed))::integer as failed_open
    from public.identity_judge_calls c
   where c.created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24))
$$;

revoke execute on function public.admin_identity_judge_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_identity_judge_stats(integer) to service_role;
