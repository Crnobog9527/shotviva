-- Admin 「漏斗」 tab (ARCHITECTURE §16.2c): the people who signed up in [p_start, p_end), and for
-- each of them when they got a first image and when they first paid, both followed up to now (an
-- old period's last sign-ups are not cut off at its end).
-- The app buckets them by Beijing day or week, splits them by language and source, and joins the
-- PostHog visitor counts; the page only ever draws totals. The ids never leave the server: they
-- are what lets the PostHog half of the tab find each person's first page view.
--
-- locale: auth.users.raw_user_meta_data.locale as written at sign-up (en | zh); null for older and
-- Google accounts, which the app then fills from PostHog. graylum: the account was linked from
-- Graylum (partner_links.linked_at, revoked or not); a Graylum job needs that link first (§14.3),
-- so the jobs table is not searched for one. referred: bound to a
-- promoter (profiles.referred_by), which wins over anything PostHog saw (as in §16.2b).
-- Admin accounts are left out. The test site has its own database.
--
-- Security definer because auth.users is not readable by service_role through PostgREST;
-- execute is granted to service_role only.
-- Indexes: profiles_created_at_idx (cohort), generation_jobs_user_id_created_at_idx (first image),
-- payments_user_id_created_at_idx (first payment), partner_links_pkey, auth.users
-- primary key. No new index.

create function public.admin_funnel_cohort(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end
     or p_end - p_start > interval '93 days' or p_end > now() + interval '5 minutes' then
    raise exception 'INVALID_INPUT' using detail = 'one ordered period of at most 93 days, not in the future';
  end if;

  return jsonb_build_object(
    'timezone', 'Asia/Shanghai',
    'admin_ids', coalesce((select jsonb_agg(pr.id order by pr.id) from public.profiles pr where pr.role = 'admin'), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pr.id,
               'signed_at', pr.created_at,
               'locale', case when u.raw_user_meta_data ->> 'locale' in ('en', 'zh') then u.raw_user_meta_data ->> 'locale' end,
               'graylum', exists (select from public.partner_links pl
                                   where pl.user_id = pr.id and pl.partner = 'graylum' and pl.linked_at is not null),
               'referred', pr.referred_by is not null,
               'first_image_at', (select g.created_at from public.generation_jobs g
                                   where g.user_id = pr.id and g.status = 'succeeded'
                                     and g.created_at >= pr.created_at
                                   order by g.created_at limit 1),
               'first_paid_at', (select pm.created_at from public.payments pm
                                  where pm.user_id = pr.id and pm.created_at >= pr.created_at
                                  order by pm.created_at limit 1)
             ) order by pr.created_at, pr.id)
        from public.profiles pr
        left join auth.users u on u.id = pr.id
       where pr.role <> 'admin' and pr.created_at >= p_start and pr.created_at < p_end
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_funnel_cohort(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_funnel_cohort(timestamptz, timestamptz) to service_role;
