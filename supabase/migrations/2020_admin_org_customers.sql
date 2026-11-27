-- 推广名单 on the admin enterprise page (/admin/orgs/[id]?tab=promo, Owner 2026-11-27): every
-- account bound to the org's affiliate account, one page at a time, newest binding first. Read
-- only; service_role only (the page checks the admin role before calling it).
--
-- A customer is any profile whose referred_by is the org's account (affiliates.org_id), whatever
-- brought them: a staff invite code (org_l1, level 1), a level-1 customer's invite (org_l2, level
-- 2), the org's own ?ref= partner link at signup ('signup', level 1, 2010) or a first purchase
-- through it ('first_checkout', level 1). Commission already counts all of them for the org.
-- Staff are never customers (Owner 2026-11-27: the staff link only joins the org's backend): an
-- account that is an active member of the org is left out, as in org_member_customers (1671).
--
-- Per row, computed for the page's rows only:
-- - contact: the full email or phone (admin page; never shown to the org).
-- - bonus: the org_signup_bonuses row (credits, when), else the org_signup_bonus_errors entry,
--   whether the account had paid before its binding (the bonus is never given then) and whether
--   it got its signup gift (2010 requires it on the ?ref= path; an account that never finished
--   signing in has none).
-- - paid_cents: what they paid since the binding, USD cents, pre-tax, net of refunds, a lost
--   dispute counting 0 (the same figure as org_member_customers, 1671).
-- - commission_cents: the org account's commission on their payments, every status but void.
-- - promo_credits: their purchase credits counted in the org's granted promotion sheets (the
--   reward itself is bonus_bp of a whole month's counted credits, decided per sheet).
-- total / total_l2: the number of customers and of level-2 ones among them, on every row.

create function public.admin_org_customers(p_org_id uuid, p_limit integer, p_offset integer)
returns table(
  user_id uuid, contact text, level smallint, source text,
  member_user_id uuid, member_contact text, via_user_id uuid, via_contact text,
  signed_up_at timestamptz, referred_at timestamptz,
  bonus_credits integer, bonus_at timestamptz, bonus_error text, paid_before boolean, has_signup_gift boolean,
  paid_cents bigint, commission_cents bigint, promo_credits bigint, total bigint, total_l2 bigint
)
language plpgsql stable security definer set search_path = '' set "TimeZone" = 'UTC' as $$
#variable_conflict use_column
declare
  v_account uuid;
begin
  if p_org_id is null or p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'INVALID_INPUT';
  end if;
  select a.user_id into v_account from public.affiliates a where a.org_id = p_org_id;
  if v_account is null then return; end if;

  return query
  with page as (
    select c.id, c.referred_source, c.referred_member, c.referred_via, c.referred_at, c.created_at,
           count(*) over () as total,
           count(*) filter (where c.referred_source = 'org_l2') over () as total_l2
      from public.profiles c
     where c.referred_by = v_account
       and not exists(select from public.org_members m where m.org_id = p_org_id and m.user_id = c.id and m.status = 'active')
     order by c.referred_at desc nulls last, c.id desc
     limit p_limit offset p_offset
  ),
  promo as (
    select l.customer_user_id as id, sum(l.credits)::bigint as credits
      from public.partner_promo_grants g
      join public.partner_promo_grant_lines l on l.grant_id = g.id
     where g.org_id = p_org_id and g.status = 'granted' and l.customer_user_id in (select id from page)
     group by l.customer_user_id
  )
  select pg.id,
         coalesce(nullif(u.email, ''), u.phone),
         case pg.referred_source when 'org_l2' then 2::smallint else 1::smallint end,
         pg.referred_source,
         pg.referred_member, coalesce(nullif(mu.email, ''), mu.phone),
         pg.referred_via, coalesce(nullif(vu.email, ''), vu.phone),
         pg.created_at, pg.referred_at,
         b.credits, b.created_at, e.error,
         exists(select from public.payments p where p.user_id = pg.id and p.created_at < pg.referred_at),
         exists(select from public.credit_ledger l where l.user_id = pg.id and l.idempotency_key = 'signup:' || pg.id
                  and l.kind = 'grant' and l.pool = 'free'),
         coalesce((
           select sum(case when p.amount_total = 0 or coalesce(ds.is_lost, false) then 0 else
                    div((p.amount_total - p.amount_tax)::numeric * (p.amount_total - p.amount_refunded), p.amount_total::numeric) end)
             from public.payments p
             left join lateral public._affiliate_dispute_state(p) ds on true
            where p.user_id = pg.id and p.currency = 'usd' and p.created_at >= pg.referred_at
         ), 0)::bigint,
         coalesce((
           select sum(ac.amount)
             from public.payments p
             join public.affiliate_commissions ac on ac.payment_id = p.id
            where p.user_id = pg.id and ac.affiliate_user_id = v_account and ac.status <> 'void'
         ), 0)::bigint,
         coalesce(pr.credits, 0),
         pg.total, pg.total_l2
    from page pg
    left join auth.users u on u.id = pg.id
    left join auth.users mu on mu.id = pg.referred_member
    left join auth.users vu on vu.id = pg.referred_via
    left join public.org_signup_bonuses b on b.user_id = pg.id and b.org_id = p_org_id
    left join public.org_signup_bonus_errors e on e.user_id = pg.id
    left join promo pr on pr.id = pg.id
   order by pg.referred_at desc nulls last, pg.id desc;
end;
$$;
revoke all on function public.admin_org_customers(uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_customers(uuid, integer, integer) to service_role;
