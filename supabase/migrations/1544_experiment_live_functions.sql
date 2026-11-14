-- What the proxy and the sign-in read and write for experiments (1540–1542). service_role only.

-- Per surface, the experiment that decides what visitors see: the running or paused one, else the
-- most recently ended one (which shows its winner). Read by the proxy, held per instance for a few
-- seconds (core/experiments/live-config.ts). Index experiments_live_surface_idx /
-- experiments_ended_surface_idx; the variants by their experiment_id foreign key scan (a handful).
create function public.experiments_live() returns jsonb
language sql stable security definer set search_path = '' as $$
  with live as (
    select e.* from public.experiments e where e.status in ('running', 'paused')
    union all
    select * from (
      select distinct on (e.surface) e.* from public.experiments e
      where e.status = 'ended'
        and not exists (select 1 from public.experiments l where l.surface = e.surface and l.status in ('running', 'paused'))
      order by e.surface, e.ended_at desc
    ) ended
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'surface', l.surface, 'status', l.status, 'winner', l.winner_variant_id,
    'variants', (
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'option', v.option_id, 'weight', v.weight, 'control', v.is_control,
        'archived', v.archived_at is not null, 'fallback', v.fallback_variant_id) order by v.id)
      from public.experiment_variants v where v.experiment_id = l.id)
  )), '[]'::jsonb)
  from live l
$$;
revoke all on function public.experiments_live() from public, anon, authenticated;
grant execute on function public.experiments_live() to service_role;

-- At a verified sign-in: the cookie's assignments (p_pairs: [{ experiment, current, first }])
-- are stored for experiments the account has no row for yet, while those experiments are running
-- or paused and both variants belong to them; then every live assignment of the account comes back
-- ([{ experiment, current, first }]) so the cookie can be rewritten from the account. A cookie
-- variant that has since been archived is stored as its fallback, with the reassignment recorded.
-- p_signup marks the rows of the sign-up itself (source 'signup').
create function public.experiment_sign_in(p_user uuid, p_pairs jsonb, p_signup boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.experiment_assignments (experiment_id, user_id, first_variant_id, current_variant_id, source, reassigned_at, reassigned_from)
  select e.id, p_user, f.id, coalesce(c.fallback_variant_id, c.id),
    case when p_signup then 'signup' else 'sign_in' end,
    case when c.archived_at is not null then now() end,
    case when c.archived_at is not null then c.id end
  from jsonb_array_elements(case when jsonb_typeof(p_pairs) = 'array' then p_pairs else '[]'::jsonb end) p
  join public.experiments e on e.id = (p->>'experiment')::bigint and e.status in ('running', 'paused')
  join public.experiment_variants c on c.id = (p->>'current')::bigint and c.experiment_id = e.id
  join public.experiment_variants f on f.id = (p->>'first')::bigint and f.experiment_id = e.id
  on conflict (experiment_id, user_id) do nothing;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('experiment', a.experiment_id, 'current', a.current_variant_id, 'first', a.first_variant_id)), '[]'::jsonb)
    from public.experiment_assignments a
    join public.experiments e on e.id = a.experiment_id and e.status in ('running', 'paused')
    where a.user_id = p_user
  );
end $$;
revoke all on function public.experiment_sign_in(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.experiment_sign_in(uuid, jsonb, boolean) to service_role;
