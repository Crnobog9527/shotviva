-- One report page or a single code's totals. Sum money separately for each settlement currency.
create function public.admin_list_codes(p_actor uuid, p_cursor jsonb default null,
  p_kind text default null, p_code_id uuid default null)
returns setof jsonb language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_kind not in ('invite','campaign') then raise exception 'INVALID_INPUT'; end if;
  return query
    with page as materialized (
      select c.id, c.code, c.kind, c.owner_user_id, c.note, c.invitee_credits, c.invitee_pool,
        c.discount_percent, c.discount_products, c.discount_duration, c.discount_months,
        c.discount_valid_days, c.starts_at, c.expires_at, c.max_redemptions, c.redemption_count,
        c.active, c.new_users_only, c.created_at
      from public.codes c
      where (p_kind is null or c.kind = p_kind) and (p_code_id is null or c.id = p_code_id)
        and (p_cursor is null or (c.created_at,c.id) < ((p_cursor->>'created_at')::timestamptz,(p_cursor->>'id')::uuid))
      order by c.created_at desc, c.id desc limit 30
    )
    select to_jsonb(c) || stats.value from page c cross join lateral (
      with attributed as materialized (
        -- A campaign has direct evidence in payments.code_id (including a late duplicate).
        select p.user_id, p.currency, p.amount_total, p.amount_tax, p.amount_refunded, p.amount_discount
        from public.payments p where c.kind = 'campaign' and p.code_id = c.id
        union all
        -- The invite code refers the account. Each successful redemption matches a different user.
        select p.user_id, p.currency, p.amount_total, p.amount_tax, p.amount_refunded, p.amount_discount
        from public.code_redemptions r join public.payments p
          on p.user_id = r.user_id and p.created_at >= r.created_at
        where c.kind = 'invite' and r.code_id = c.id and r.status = 'ok'
      ),
      sums as (
        select lower(a.currency) as currency,
          sum(a.amount_total::bigint - a.amount_tax - a.amount_refunded) as net_amount,
          sum(a.amount_discount) as discount_amount from attributed a group by lower(a.currency)
      )
      select jsonb_build_object(
        'purchasers', (select count(distinct a.user_id) from attributed a),
        'amounts', coalesce((select jsonb_object_agg(s.currency,
          jsonb_build_object('net',s.net_amount,'discount',s.discount_amount)) from sums s), '{}'::jsonb)
      ) as value
    ) stats order by c.created_at desc, c.id desc;
end;
$$;
revoke all on function public.admin_list_codes(uuid,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_list_codes(uuid,jsonb,text,uuid) to service_role;
