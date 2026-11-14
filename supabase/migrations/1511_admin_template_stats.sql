-- Admin 「模板」 tab (ARCHITECTURE §16.2c): per template, what happened to its finished jobs created
-- in [p_start, p_end): uses, people, successes and failures, the top failure codes, redraws, real
-- cost and credits charged (split by pool, so the app can work out a margin for admins at run
-- time), favourites, and the uses of the last 14 days for the 「没人用」 flag. Jobs still running
-- are left out; so are admin accounts. Every live template is listed, used or not, plus any
-- template id that only old jobs still carry.
--
-- Redraw: a job is a redraw when the same person made a job with the same template at most
-- p_redraw_minutes earlier, that earlier job not in the same batch (one batch's cells are not
-- redraws of each other); photo edits (parent_job_id) never are. The pages of one poster set are
-- made one after another, so a poster job only follows an earlier job of the same set and page;
-- a poster job that names the job it redraws (inputs.poster.redraw_of) always is a redraw. The earlier job may fall just before
-- p_start, so the scan starts p_redraw_minutes early.
--
-- Security definer because template_favorites is closed to service_role reads of other users;
-- execute is granted to service_role only.
-- Indexes: generation_jobs_created_at_id_idx (period and 14-day scans), profiles primary key,
-- template_favorites_template_id_idx, template_categories and template_series primary keys.
-- No new index.

create function public.admin_template_stats(
  p_start timestamptz,
  p_end timestamptz,
  p_redraw_minutes integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gap interval;
begin
  if p_start is null or p_end is null or p_start >= p_end
     or p_end - p_start > interval '93 days' or p_end > now() + interval '5 minutes'
     or p_redraw_minutes is null or p_redraw_minutes < 1 or p_redraw_minutes > 1440 then
    raise exception 'INVALID_INPUT' using detail = 'one ordered period of at most 93 days, not in the future; redraw gap 1–1440 minutes';
  end if;
  v_gap := make_interval(mins => p_redraw_minutes);

  return (
    with staff as (
      select pr.id from public.profiles pr where pr.role = 'admin'
    ),
    scanned as (
      select g.id, g.user_id, g.template_id, g.status, g.error_code, g.created_at, g.batch_id,
             g.parent_job_id, g.credits_cost, g.credit_pool, g.cost_usd,
             coalesce(g.inputs -> 'poster' ? 'redraw_of', false) as poster_redraw,
             lag(g.created_at) over w as prev_at,
             lag(g.batch_id) over w as prev_batch
        from public.generation_jobs g
       where g.created_at >= p_start - v_gap and g.created_at < p_end and g.status <> 'running'
         and not exists (select from staff s where s.id = g.user_id)
      window w as (partition by g.user_id, g.template_id, g.inputs -> 'poster' ->> 'set_id', g.inputs -> 'poster' ->> 'part'
                   order by g.created_at, g.id)
    ),
    jobs as (
      select x.*,
             x.poster_redraw or (
               x.parent_job_id is null and x.prev_at is not null and x.created_at - x.prev_at <= v_gap
               and (x.batch_id is null or x.prev_batch is distinct from x.batch_id)
             ) as redraw
        from scanned x
       where x.created_at >= p_start
    ),
    per_template as (
      select j.template_id,
             count(*) as uses,
             count(distinct j.user_id) as users,
             count(*) filter (where j.status = 'succeeded') as succeeded,
             count(*) filter (where j.status = 'failed') as failed,
             count(*) filter (where j.redraw) as redraws,
             count(*) filter (where j.cost_usd is not null) as costed,
             coalesce(sum(j.cost_usd), 0) as cost_usd,
             coalesce(sum(j.cost_usd) filter (where j.credit_pool = 'paid'), 0) as paid_cost_usd,
             coalesce(sum(j.cost_usd) filter (where j.credit_pool = 'free'), 0) as free_cost_usd,
             coalesce(sum(j.credits_cost) filter (where j.status = 'succeeded'), 0) as credits,
             coalesce(sum(j.credits_cost) filter (where j.status = 'succeeded' and j.credit_pool = 'paid'), 0) as paid_credits
        from jobs j
       group by j.template_id
    ),
    errors as (
      select e.template_id, jsonb_agg(jsonb_build_object('code', e.code, 'count', e.n) order by e.n desc, e.code) as top
        from (
          select j.template_id, coalesce(j.error_code, 'UNKNOWN') as code, count(*) as n,
                 row_number() over (partition by j.template_id order by count(*) desc, coalesce(j.error_code, 'UNKNOWN')) as rank
            from jobs j
           where j.status = 'failed'
           group by j.template_id, coalesce(j.error_code, 'UNKNOWN')
        ) e
       where e.rank <= 3
       group by e.template_id
    ),
    recent as (
      select g.template_id, count(*) as uses_14d
        from public.generation_jobs g
       where g.created_at >= now() - interval '14 days' and g.status <> 'running'
         and not exists (select from staff s where s.id = g.user_id)
       group by g.template_id
    ),
    favourites as (
      select f.template_id, count(*) as total, count(*) filter (where f.created_at >= p_start and f.created_at < p_end) as added
        from public.template_favorites f
       where not exists (select from staff s where s.id = f.user_id)
       group by f.template_id
    ),
    ids as (
      select t.id from public.templates t where t.deleted_at is null
      union
      select p.template_id from per_template p
    )
    select jsonb_build_object(
      'timezone', 'Asia/Shanghai',
      'redraw_minutes', p_redraw_minutes,
      'templates', coalesce(jsonb_agg(jsonb_build_object(
        'template_id', i.id,
        'name', t.name,
        'name_zh', t.translations -> 'zh' ->> 'name',
        'category_key', t.category_key,
        'category_name', c.name_zh,
        'subcategory_key', t.subcategory_key,
        'series_id', t.series_id,
        'series_name', s.name_zh,
        'live', coalesce(t.is_active and t.deleted_at is null and 'web' = any (t.visible_in), false),
        'uses', coalesce(p.uses, 0),
        'users', coalesce(p.users, 0),
        'succeeded', coalesce(p.succeeded, 0),
        'failed', coalesce(p.failed, 0),
        'redraws', coalesce(p.redraws, 0),
        'costed', coalesce(p.costed, 0),
        'cost_usd', coalesce(p.cost_usd, 0),
        'paid_cost_usd', coalesce(p.paid_cost_usd, 0),
        'free_cost_usd', coalesce(p.free_cost_usd, 0),
        'credits', coalesce(p.credits, 0),
        'paid_credits', coalesce(p.paid_credits, 0),
        'errors', coalesce(e.top, '[]'::jsonb),
        'uses_14d', coalesce(r.uses_14d, 0),
        'favourites', coalesce(f.total, 0),
        'favourites_added', coalesce(f.added, 0)
      ) order by coalesce(p.uses, 0) desc, i.id), '[]'::jsonb)
    )
      from ids i
      left join public.templates t on t.id = i.id
      left join public.template_series s on s.id = t.series_id
      left join public.template_categories c on c.key = t.category_key
      left join per_template p on p.template_id = i.id
      left join errors e on e.template_id = i.id
      left join recent r on r.template_id = i.id
      left join favourites f on f.template_id = i.id
  );
end;
$$;

revoke execute on function public.admin_template_stats(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.admin_template_stats(timestamptz, timestamptz, integer) to service_role;
