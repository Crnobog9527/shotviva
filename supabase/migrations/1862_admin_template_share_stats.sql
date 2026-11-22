-- /admin/analytics' template collection block (ARCHITECTURE §5.1g): links made in [p_start, p_end),
-- by how many accounts, and how many of those are revoked by now. One statement on
-- template_shares_created_idx (1860). Called by the server with the service role after
-- requireAdmin; no client can execute it.

create function public.admin_template_share_stats(p_start timestamptz, p_end timestamptz)
returns table (links bigint, creators bigint, revoked bigint)
language sql
stable
set search_path = ''
as $$
  select count(*), count(distinct s.user_id), count(*) filter (where s.revoked_at is not null)
    from public.template_shares s
   where s.created_at >= p_start and s.created_at < p_end
$$;

revoke all on function public.admin_template_share_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_template_share_stats(timestamptz, timestamptz) to service_role;
