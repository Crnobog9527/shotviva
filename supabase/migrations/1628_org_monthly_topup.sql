-- Monthly top-up (ARCHITECTURE §6.5): every active member of every active org with an allowance
-- is brought up to it (not added on top, not taken back at month end; Owner 2026-11-21): the
-- grant is allowance - min(held_credits, credits). Members are served in join order until the
-- pool is empty; what the pool could not cover is recorded as `short` for the console. One
-- org_member_topups row per member and period, written with the grant, makes re-running a period
-- safe: nobody is topped up twice in one period. Each org runs in its own subtransaction: an
-- error in one org rolls back only that org's top-up, is reported in `failed_orgs` (and logged
-- by the cron route), and a re-run of the period tops up whoever was missed. The grant's
-- request id `org_topup:<period>:<org>:<member>` is reserved: the owner, member and admin
-- functions refuse ids with that prefix. Called by the cron route with the current UTC month;
-- only the service role may call it.
create or replace function public.org_monthly_topup(p_period text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orgs;
  m record;
  have integer;
  need integer;
  give integer;
  members integer := 0;
  granted bigint := 0;
  short_orgs integer := 0;
  org_short boolean;
  n_members integer;
  org_granted bigint;
  failed jsonb := '[]'::jsonb;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  for o in select * from public.orgs where status = 'active' order by created_at, id loop
  begin
    select * into o from public.orgs where id = o.id and status = 'active' for no key update;
    continue when not found;
    if public._org_settle_returns(o.id) > 0 then select * into o from public.orgs where id = o.id; end if;
    org_short := false;
    n_members := 0;
    org_granted := 0;
    for m in
      select mm.user_id, mm.monthly_allowance, mm.held_credits, p.credits
        from public.org_members mm join public.profiles p on p.id = mm.user_id
       where mm.org_id = o.id and mm.status = 'active' and mm.monthly_allowance > 0
         and not exists(select from public.org_member_topups t where t.org_id = o.id and t.user_id = mm.user_id and t.period = p_period)
       order by mm.joined_at, mm.user_id
    loop
      have := least(m.held_credits, m.credits);
      need := greatest(m.monthly_allowance - have, 0);
      give := least(need, o.pool_credits)::integer;
      if give > 0 then
        perform public._org_allocate(o, m.user_id, give, 'org_topup:' || p_period || ':' || o.id::text || ':' || m.user_id::text, null);
        o.pool_credits := o.pool_credits - give;
        org_granted := org_granted + give;
      end if;
      insert into public.org_member_topups(org_id, user_id, period, granted, short)
        values (o.id, m.user_id, p_period, give, need - give);
      n_members := n_members + 1;
      org_short := org_short or need > give;
    end loop;
    members := members + n_members;
    granted := granted + org_granted;
    if org_short then short_orgs := short_orgs + 1; end if;
  exception when others then
    failed := failed || jsonb_build_array(jsonb_build_object('org_id', o.id, 'error', sqlerrm));
  end;
  end loop;
  return jsonb_build_object('period', p_period, 'members', members, 'granted', granted, 'short_orgs', short_orgs,
    'failed_orgs', failed);
end;
$$;
revoke all on function public.org_monthly_topup(text) from public, anon, authenticated, service_role;
grant execute on function public.org_monthly_topup(text) to service_role;
