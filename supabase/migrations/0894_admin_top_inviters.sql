-- Rank invitation cohorts by successful joins in the chosen period. The related purchase and
-- ledger rows remain attributable even when a buyer pays in a different month.
create function public.admin_top_inviters(p_actor uuid, p_days integer default 30)
returns table(inviter_user_id uuid, invited bigint, purchasers bigint, earned bigint)
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_days is not null and p_days <> 30 then raise exception 'INVALID_INPUT'; end if;
  return query
    select r.inviter_user_id, count(*),
      count(*) filter (where exists (select 1 from public.payments p where p.user_id = r.user_id and p.created_at >= r.created_at)),
      coalesce(sum(l.delta), 0)
    from public.code_redemptions r
    left join public.credit_ledger l on l.idempotency_key = 'invite:' || r.id::text
    where r.inviter_user_id is not null and r.status = 'ok'
      and (p_days is null or r.created_at >= now() - interval '30 days')
    group by r.inviter_user_id order by 2 desc, 3 desc, 4 desc, 1 limit 50;
end;
$$;
revoke all on function public.admin_top_inviters(uuid,integer) from public, anon, authenticated;
grant execute on function public.admin_top_inviters(uuid,integer) to service_role;
