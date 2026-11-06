-- T33: admin_dashboard_stats reports real cost (ARCHITECTURE §10.0) next to the counts it
-- already returns. Same windows, Beijing days and single walk of generation_jobs_created_at_id_idx
-- as 0164; the rest of the body is unchanged.
--
-- Added per window, per trend day and per model × resolution:
--   cost_usd  sum of generation_jobs.cost_usd (succeeded and failed: the provider bills both)
--   uncosted  jobs with usage but no cost (a price was missing): shown as 「无法计算」
--   legacy    succeeded jobs with neither usage nor cost, i.e. settled before T33. The app
--             estimates them with the old per-resolution constant, labelled 「估算」. Windows
--             and days give them per resolution ({"1k": n, …}); model rows already are one.

create or replace function public.admin_dashboard_stats(p_days integer)
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
           coalesce(g.inputs ->> 'resolution', '1k') as resolution,
           g.cost_usd,
           g.provider_usage is not null and g.cost_usd is null as uncosted,
           g.status = 'succeeded' and g.provider_usage is null and g.cost_usd is null as legacy
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
             'new_paying_users', (select count(*) from first_purchases f where f.first_at >= w.since),
             'cost_usd', (select coalesce(sum(j.cost_usd), 0) from jobs j where j.created_at >= w.since),
             'uncosted', (select count(*) from jobs j where j.created_at >= w.since and j.uncosted),
             'legacy', (select coalesce(jsonb_object_agg(r.resolution, r.n), '{}'::jsonb)
                          from (select j.resolution, count(*) as n from jobs j
                                 where j.created_at >= w.since and j.legacy group by j.resolution) r)
           ) order by w.since desc) as value
      from windows w
  ),
  trend as (
    select jsonb_agg(jsonb_build_object(
             'day', to_char(d.day at time zone v_tz, 'YYYY-MM-DD'),
             'jobs', (select count(*) from jobs j where j.created_at >= d.day and j.created_at < d.day + interval '1 day'),
             'succeeded', (select count(*) from jobs j
                            where j.created_at >= d.day and j.created_at < d.day + interval '1 day' and j.status = 'succeeded'),
             'cost_usd', (select coalesce(sum(j.cost_usd), 0) from jobs j
                           where j.created_at >= d.day and j.created_at < d.day + interval '1 day'),
             'legacy', (select coalesce(jsonb_object_agg(r.resolution, r.n), '{}'::jsonb)
                          from (select j.resolution, count(*) as n from jobs j
                                 where j.created_at >= d.day and j.created_at < d.day + interval '1 day' and j.legacy
                                 group by j.resolution) r)
           ) order by d.day) as value
      from generate_series(v_start, v_today, interval '1 day') as d(day)
  ),
  by_model as (
    select jsonb_agg(jsonb_build_object(
             'model', m.model, 'resolution', m.resolution, 'jobs', m.jobs, 'succeeded', m.succeeded,
             'cost_usd', m.cost_usd, 'uncosted', m.uncosted, 'legacy', m.legacy
           ) order by m.jobs desc, m.model, m.resolution) as value
      from (
        select j.model, j.resolution, count(*) as jobs, count(*) filter (where j.status = 'succeeded') as succeeded,
               coalesce(sum(j.cost_usd), 0) as cost_usd,
               count(*) filter (where j.uncosted) as uncosted,
               count(*) filter (where j.legacy) as legacy
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
