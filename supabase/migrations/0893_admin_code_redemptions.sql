-- For the invitations tab, omit p_code_id to page blocked_same_ip records across all codes.
create function public.admin_code_redemptions(p_actor uuid, p_code_id uuid default null, p_cursor jsonb default null)
returns setof jsonb language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    with page as materialized (
      select r.id, r.code_id, r.user_id, r.inviter_user_id, r.context, r.status,
        r.credits_granted, r.inviter_rewarded_at, r.inviter_reward_payment_id, r.discount_expires_at,
        r.discount_used_payment_id, r.discount_void_at, r.created_at
      from public.code_redemptions r
      where (r.code_id = p_code_id or (p_code_id is null and r.status = 'blocked_same_ip'))
        and (p_cursor is null or (r.created_at,r.id) < ((p_cursor->>'created_at')::timestamptz,(p_cursor->>'id')::uuid))
      order by r.created_at desc, r.id desc limit 30
    )
    select to_jsonb(r) || jsonb_build_object('code', c.code,
      'reward_payment_status', reward.status, 'reward_payment_refunded', reward.amount_refunded,
      'discount_conflict_payments', coalesce((
        select jsonb_agg(p.id order by p.id) from public.payments p
        where p.code_id = r.code_id and p.user_id = r.user_id and p.code_discount_conflict
      ), '[]'::jsonb))
    from page r left join public.codes c on c.id = r.code_id
    left join public.payments reward on reward.id = r.inviter_reward_payment_id
    order by r.created_at desc, r.id desc;
end;
$$;
revoke all on function public.admin_code_redemptions(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_code_redemptions(uuid,uuid,jsonb) to service_role;
