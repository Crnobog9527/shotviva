-- Results of one experiment for /admin/experiments, per variant. Same rules as the funnel tab
-- (#639 admin_funnel_cohort): admin accounts left out; a first image = a succeeded generation job,
-- a payment = any payments row. Each person counts against the variant they saw first
-- (first_variant_id), whatever they were moved to later; only accounts whose sign-up wrote the row
-- (source 'signup') count as sign-ups, and only images and payments after that count.
-- Visitors come from PostHog (experiment_exposure events), not from here.
-- `now_on` = accounts whose current variant this is (any source); `moved` = accounts moved off it.
-- Indexes: experiment_assignments primary key (experiment_id, …), generation_jobs_user_id_created_at_idx,
-- payments_user_id_created_at_idx; the variants by experiment_id (a handful).
create function public.admin_experiment_results(p_id bigint)
returns table (variant_id bigint, signups bigint, first_generations bigint, payments bigint, now_on bigint, moved bigint)
language sql stable security definer set search_path = '' as $$
  with people as (
    select a.* from public.experiment_assignments a
    join public.profiles p on p.id = a.user_id and p.role <> 'admin'
    where a.experiment_id = p_id
  ),
  signed as (
    select a.user_id, a.first_variant_id, a.assigned_at,
      exists (select 1 from public.generation_jobs j where j.user_id = a.user_id and j.status = 'succeeded' and j.created_at >= a.assigned_at) as generated,
      exists (select 1 from public.payments m where m.user_id = a.user_id and m.created_at >= a.assigned_at) as paid
    from people a where a.source = 'signup'
  )
  select v.id,
    (select count(*) from signed s where s.first_variant_id = v.id),
    (select count(*) from signed s where s.first_variant_id = v.id and s.generated),
    (select count(*) from signed s where s.first_variant_id = v.id and s.paid),
    (select count(*) from people a where a.current_variant_id = v.id),
    (select count(*) from people a where a.reassigned_from = v.id)
  from public.experiment_variants v
  where v.experiment_id = p_id
  order by v.id
$$;
revoke all on function public.admin_experiment_results(bigint) from public, anon, authenticated;
grant execute on function public.admin_experiment_results(bigint) to service_role;
