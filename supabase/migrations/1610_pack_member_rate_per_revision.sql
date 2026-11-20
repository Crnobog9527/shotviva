-- 1610: the M / L pack member rate belongs to the catalogue revision (ARCHITECTURE §6.2, Owner
-- 2026-11-21 pricing: Starter full price, Pro 95%, Max 90%; was 95 / 90 / 85).
--
-- The rate was a constant in catalog_price_forms (1125), catalog_buyer_terms (1130) and the app.
-- Bound Stripe member Prices and checkout attempts belong to a revision, so changing the
-- constant would re-price the revision already on sale and make its bound Prices unpayable. Each
-- version now stores what the member pays, in percent of the list price, ordered
-- starter, pro, max. Versions that exist when this runs keep 95 / 90 / 85; drafts saved later get
-- 100 / 95 / 90, so the new rate goes live per pack when its new revision is published, together
-- with the Stripe Prices it is checked against.
--
-- Expand-only: one column with a default (its check only covers that column), two functions
-- replaced with the same signatures, one new read function. Code live before the deploy keeps
-- quoting 95 / 90 / 85, which is still the rate of every published revision.
--
-- validate_catalog_terms (1127) and the floor budget (1568-1570) keep their conservative 85%
-- (the deepest member discount any revision has had): neither binds, Max yearly does.

alter table admin.catalog_product_versions
  add column pack_member_pay_pct smallint[] not null default '{95,90,85}'
    constraint catalog_versions_pack_member_pay_pct_check
    check (cardinality(pack_member_pay_pct) = 3 and 50 <= all(pack_member_pay_pct) and 100 >= all(pack_member_pay_pct));
alter table admin.catalog_product_versions alter column pack_member_pay_pct set default '{100,95,90}';

-- Same forms and keys as 1125; the member amounts come from the revision.
create or replace function admin.catalog_price_forms(p_product text,p_revision integer)
returns table(lookup_key text,usd_cents integer,stripe_product text) language sql stable set search_path='' as $$
  select p.product_id||f.suffix,round(v.usd_cents::numeric*f.percentage/100)::integer,
    'shotviva_'||case when p.tier='pack' then p.product_id else p.tier end
    from admin.catalog_products p join admin.catalog_product_versions v using(product_id)
    cross join lateral (
      select '_v2',100 union all select '_recurring_v2',100 where p.kind<>'pack'
      union all select '_v2_starter',v.pack_member_pay_pct[1] where p.product_id in ('pack_m','pack_l')
      union all select '_v2_pro',v.pack_member_pay_pct[2] where p.product_id in ('pack_m','pack_l')
      union all select '_v2_max',v.pack_member_pay_pct[3] where p.product_id in ('pack_m','pack_l')
    ) f(suffix,percentage) where p.product_id=p_product and v.revision=p_revision
$$;

-- Body of 1130 with the member rate read from the published revision, which lock_catalog_checkout
-- has just locked and matched to the requested one.
create or replace function admin.catalog_buyer_terms(p_user uuid,p_product text,p_list int,p_token uuid,
  p_channel text,p_unit int,p_net int,p_percent int,p_params jsonb) returns void
language plpgsql set search_path='' as $$
declare
  tier text;
  member_cents integer := p_list;
  coupon_cents integer;
  discount jsonb;
  product_tier text;
  pay_pct smallint[];
  plan_rank integer := admin.catalog_membership_rank(p_product);
  tiers text[] := array['starter','pro','max'];
begin
  perform 1 from public.profiles where id=p_user and banned_at is null for share;
  if not found then raise exception 'USER_BANNED'; end if;
  tier := public.current_tier(p_user);
  select c.tier,v.pack_member_pay_pct into strict product_tier,pay_pct from admin.catalog_products c
    join admin.catalog_product_versions v on (v.product_id,v.revision)=(c.product_id,c.published_revision)
    where c.product_id=p_product;
  if plan_rank>0 and (array_position(tiers,tier)>array_position(tiers,product_tier)
      or exists(select from public.subscriptions where user_id=p_user and status in ('active','trialing','past_due','unpaid','paused')
        and admin.catalog_membership_rank(product_id)>=plan_rank)) then raise exception 'DOWNGRADE_NOT_ALLOWED'; end if;
  if p_product in ('pack_m','pack_l') and array_position(tiers,tier) is not null then
    member_cents := ((p_list::bigint * pay_pct[array_position(tiers,tier)] +50)/100)::integer;
  end if;
  if p_channel='stripe' then discount := public.checkout_discount(p_user,p_product); end if;
  coupon_cents := p_list-((p_list::bigint*(discount->>'percent')::int+50)/100)::integer;
  if discount is not null and (plan_rank>0 or coupon_cents<member_cents) then
    if (p_list,coupon_cents,(discount->>'percent')::int,discount->>'code_id',discount->>'stripe_coupon_id') is distinct from
       (p_unit,p_net,p_percent,p_params#>>'{metadata,code_id}',p_params#>>'{discounts,0,coupon}') or not exists(
         select from public.code_redemptions where id=(discount->>'redemption_id')::uuid and checkout_token=p_token
           and checkout_prepared and checkout_expires_at>now()) then raise exception 'CODE_CHECKOUT_OFFER_CHANGED'; end if;
  elsif p_percent is not null or (p_unit,p_net) is distinct from (member_cents,member_cents) then
    raise exception 'CODE_CHECKOUT_OFFER_CHANGED';
  end if;
end $$;

-- Member rates of every M / L pack version, so the app quotes a revision with its own rate.
create function public.read_catalog_member_rates()
returns table(product_id text,revision integer,starter_pct integer,pro_pct integer,max_pct integer)
language sql stable security definer set search_path='' as $$
  select v.product_id,v.revision,v.pack_member_pay_pct[1]::integer,v.pack_member_pay_pct[2]::integer,v.pack_member_pay_pct[3]::integer
    from admin.catalog_product_versions v where v.product_id in ('pack_m','pack_l')
   order by v.product_id,v.revision
$$;
revoke all on function public.read_catalog_member_rates() from public,anon,authenticated;
grant execute on function public.read_catalog_member_rates() to service_role;
