-- Widen the permanent order FK target to accept new SKUs. All previous IDs remain valid.
alter table public.products drop constraint products_id_check,
  add constraint products_id_check check (
    id ~ '^[a-z][a-z0-9]{0,47}_(monthly|yearly)$' or id ~ '^pack_[a-z][a-z0-9]{0,47}$');

create function admin.catalog_membership_rank(p_id text) returns integer
language sql stable security definer set search_path='' as $$
  select coalesce((select (array_position(array['starter','pro','max'],tier)-1)*2
    + case kind when 'yearly' then 2 else 1 end
    from admin.catalog_products where product_id=p_id and kind<>'pack'),0)
$$;
revoke all on function admin.catalog_membership_rank(text) from public,anon,authenticated,service_role;

create or replace function public.affiliate_can_apply(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select s.enabled and case s.apply_min_level when 'none' then true else exists (
    select 1 from public.payments p join admin.catalog_products c on c.product_id=p.product_id
     where p.user_id=p_user and p.amount_total>p.amount_refunded and c.kind<>'pack'
       and array_position(array['starter','pro','max'],c.tier) >=
         coalesce(array_position(array['starter','pro','max'],s.apply_min_level),1)
  ) end from public.affiliate_settings s where s.singleton
$$;

-- Old contracts without revision metadata predate manual publication. Use the seeded v1/v2
-- terms, including delisted SKUs. New identities supply labels/type for account/receipt pages;
-- their actual grants are resolved from the locked attempt, not from this identity lookup.
create function public.read_contract_catalog(p_version text)
returns table(product_id text,tier text,kind text,revision integer,usd_cents integer,credits integer,
              paid_days integer,listed boolean,name_en text,name_zh text)
language sql stable security definer set search_path='' as $$
  select p.product_id,p.tier,p.kind,v.revision,v.usd_cents,v.credits,v.paid_days,v.listed,v.name_en,v.name_zh
    from admin.catalog_products p left join admin.product_terms_v2 seed on seed.product_id=p.product_id
    join admin.catalog_product_versions v on v.product_id=p.product_id
      and v.revision=case when seed.product_id is not null then case p_version when 'v2' then 2 when 'v1' then 1 end
        when p_version='v2' then p.published_revision end
   order by p.product_id
$$;
revoke all on function public.read_contract_catalog(text) from public,anon,authenticated;
grant execute on function public.read_contract_catalog(text) to service_role;

create function public.read_catalog_offers(p_version text)
returns table(product_id text,tier text,kind text,revision integer,usd_cents integer,credits integer,
              paid_days integer,listed boolean,name_en text,name_zh text,benefit_en text,benefit_zh text)
language sql stable security definer set search_path='' as $$
  select r.*,v.benefit_en,v.benefit_zh from public.read_product_catalog(p_version) r
    join admin.catalog_product_versions v on (v.product_id,v.revision)=(r.product_id,r.revision)
   order by v.sort_order,r.product_id
$$;
revoke all on function public.read_catalog_offers(text) from public,anon,authenticated;
grant execute on function public.read_catalog_offers(text) to service_role;

CREATE OR REPLACE FUNCTION "public"."_membership_end_without_refunded"("p_user_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_end timestamptz;
  v_held text;
  r record;
begin
  for r in
    select l.idempotency_key, l.created_at, l.paid_until_after, l.product_id, pr.days
      from public.credit_ledger l
      join public.products pr on pr.id = l.product_id
     where l.user_id = p_user_id
       and l.pool = 'paid'
       and l.kind = 'purchase'
       and l.delta > 0
       and pr.days is not null
       and not exists (
         select 1 from public.payments p
          where p.user_id = p_user_id
            and p.status <> 'paid'
            and l.idempotency_key in ('purchase:' || p.stripe_session_id, 'renewal:' || p.stripe_invoice_id, 'purchase:' || p.waffo_payment_id)
       )
     order by l.created_at, l.id
  loop
    if r.idempotency_key like 'renewal:%' then
      v_end := greatest(v_end, least(r.paid_until_after, r.created_at + make_interval(days => r.days + 3)));
    elsif v_end > r.created_at
          and admin.catalog_membership_rank(r.product_id) > admin.catalog_membership_rank(v_held) then
      v_end := greatest(v_end, r.created_at + make_interval(days => r.days));
    else
      v_end := greatest(v_end, r.created_at) + make_interval(days => r.days);
    end if;
    v_held := r.product_id;
  end loop;
  return v_end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."_affiliate_snapshot"("p_payment" "public"."payments") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    SET "TimeZone" TO 'UTC'
    AS $$
  select jsonb_build_object('owner',a.user_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',coalesce(o.l1_bp,r.l1_bp),'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',coalesce(customer.signup_ip=referrer.signup_ip,false),
    'confirm_after',p_payment.created_at+make_interval(days=>s.hold_days))
    from public.profiles customer join public.affiliates a on a.user_id=customer.referred_by
    join public.profiles referrer on referrer.id=a.user_id
    cross join public.affiliate_settings s
    join admin.catalog_products sku on sku.product_id=p_payment.product_id
    join public.affiliate_rates r on r.product_kind=sku.kind
    left join public.affiliates parent on parent.user_id=a.parent_user_id
    left join public.affiliate_rate_overrides o on (o.user_id,o.product_kind)=(a.user_id,r.product_kind)
    left join public.affiliate_rate_overrides po on (po.user_id,po.product_kind)=(parent.user_id,r.product_kind)
    where s.singleton and customer.id=p_payment.user_id
      and (s.commission_months is null or case
        -- A term extending beyond the payment year always covers this sale. Avoid overflowing
        -- timestamp arithmetic for long terms accepted by the integer setting.
        when s.commission_months > 12 * (1 + extract(year from p_payment.created_at) - extract(year from customer.referred_at)) then true
        else p_payment.created_at <= customer.referred_at + make_interval(months => s.commission_months)
      end);
$$;
