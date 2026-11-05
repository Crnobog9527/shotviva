-- T23: everything the admin overview shows except revenue, in one call (ARCHITECTURE §10).
-- Revenue is admin_revenue_stats, created with the orders page once T9's tables are on main.
--
-- Days are Beijing days: the admin is the Owner's tool and "today" should mean the Owner's
-- today. Windows: today, the last 7 days and the last p_days days, each ending now. Each table
-- is read once over the longest window through its created_at index (0160):
--   generation_jobs_created_at_id_idx, credit_ledger_created_at_idx, profiles_created_at_idx.
-- First purchases also probe credit_ledger_user_id_created_at_idx per buyer.

create function public.admin_dashboard_stats(p_days integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz constant text := 'Asia/Shanghai';
  v_today timestamptz;
  v_start timestamptz;
  v_result jsonb;
begin
  if p_days is null or p_days < 7 or p_days > 90 then
    raise exception 'INVALID_INPUT' using detail = 'p_days must be between 7 and 90';
  end if;

  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_start := v_today - make_interval(days => p_days - 1);

  with windows(key, since) as (
    values ('today', v_today), ('7d', v_today - interval '6 days'), ('period', v_start)
  ),
  jobs as (
    select g.created_at,
           g.status,
           -- generation_jobs.provider is '<source>/<model>'; older rows hold a bare name.
           case when position('/' in g.provider) > 0
                then substr(g.provider, position('/' in g.provider) + 1)
                else coalesce(g.provider, 'unknown') end as model,
           coalesce(g.inputs ->> 'resolution', '1k') as resolution
      from public.generation_jobs g
     where g.created_at >= v_start
  ),
  -- Net credits spent on generation: reserves minus refunds, per pool.
  spend as (
    select l.created_at, l.pool, -l.delta as used
      from public.credit_ledger l
     where l.created_at >= v_start and l.kind in ('reserve', 'refund')
  ),
  -- A paying user is new on the day of their first purchase ever.
  first_purchases as (
    select l.user_id, min(l.created_at) as first_at
      from public.credit_ledger l
     where l.created_at >= v_start
       and l.kind = 'purchase'
       and not exists (
         select 1 from public.credit_ledger e
          where e.user_id = l.user_id and e.kind = 'purchase' and e.created_at < v_start
       )
     group by l.user_id
  ),
  window_stats as (
    select jsonb_agg(jsonb_build_object(
             'key', w.key,
             'since', w.since,
             'signups', (select count(*) from public.profiles p where p.created_at >= w.since),
             'jobs', (select count(*) from jobs j where j.created_at >= w.since),
             'succeeded', (select count(*) from jobs j where j.created_at >= w.since and j.status = 'succeeded'),
             'failed', (select count(*) from jobs j where j.created_at >= w.since and j.status = 'failed'),
             'free_credits_used', (select coalesce(sum(s.used), 0) from spend s where s.created_at >= w.since and s.pool = 'free'),
             'paid_credits_used', (select coalesce(sum(s.used), 0) from spend s where s.created_at >= w.since and s.pool = 'paid'),
             'new_paying_users', (select count(*) from first_purchases f where f.first_at >= w.since)
           ) order by w.since desc) as value
      from windows w
  ),
  trend as (
    select jsonb_agg(jsonb_build_object(
             'day', to_char(d.day at time zone v_tz, 'YYYY-MM-DD'),
             'jobs', (select count(*) from jobs j where j.created_at >= d.day and j.created_at < d.day + interval '1 day'),
             'succeeded', (select count(*) from jobs j
                            where j.created_at >= d.day and j.created_at < d.day + interval '1 day' and j.status = 'succeeded')
           ) order by d.day) as value
      from generate_series(v_start, v_today, interval '1 day') as d(day)
  ),
  by_model as (
    select jsonb_agg(jsonb_build_object(
             'model', m.model, 'resolution', m.resolution, 'jobs', m.jobs, 'succeeded', m.succeeded
           ) order by m.jobs desc, m.model, m.resolution) as value
      from (
        select j.model, j.resolution, count(*) as jobs, count(*) filter (where j.status = 'succeeded') as succeeded
          from jobs j
         group by j.model, j.resolution
      ) m
  )
  select jsonb_build_object(
           'timezone', v_tz,
           'days', p_days,
           'generated_at', now(),
           'windows', (select value from window_stats),
           'trend', coalesce((select value from trend), '[]'::jsonb),
           'by_model', coalesce((select value from by_model), '[]'::jsonb)
         )
    into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_dashboard_stats(integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats(integer) to service_role;
