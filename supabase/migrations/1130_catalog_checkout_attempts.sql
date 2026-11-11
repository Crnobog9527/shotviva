-- The retry key and the provider request become immutable together, before calling the provider.
create table admin.catalog_checkout_attempts (
  token uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade, product_id text not null,
  revision integer not null, channel text not null check (channel in ('stripe','waffo')),
  request_hash text not null, price_id text not null, unit_cents integer not null, net_cents integer not null,
  credits integer not null, paid_days integer, method text not null, form text not null,
  expires_at timestamptz not null, params jsonb not null, provider_started boolean not null default false, session_id text, session_url text, settled_at timestamptz,
  foreign key(product_id,revision) references admin.catalog_product_versions(product_id,revision)
);
alter table admin.catalog_checkout_attempts enable row level security;
revoke all on admin.catalog_checkout_attempts from public,anon,authenticated,service_role;
create index catalog_attempt_user on admin.catalog_checkout_attempts(user_id);
create index catalog_attempt_version on admin.catalog_checkout_attempts(product_id,revision);
create index catalog_payable_price on admin.catalog_checkout_attempts(price_id,expires_at) where settled_at is null;
create unique index catalog_provider_session on admin.catalog_checkout_attempts(channel,session_id) where session_id is not null;

create function public.catalog_channel_price(p_product text,p_revision int,p_channel text,p_key text,p_recurring boolean,
  p_store text default null,p_mode text default null) returns text language plpgsql stable security definer set search_path='' as $$
declare
  v_id text;
begin
  if p_channel='stripe' then
    select price_id into v_id from admin.catalog_stripe_prices
      where product_id=p_product and revision=p_revision and lookup_key=p_key;
  elsif p_channel='waffo' then
    select case when p_recurring then recurring_id else one_time_id end into v_id from admin.catalog_waffo_bindings
      where product_id=p_product and revision=p_revision and store_id=p_store and mode=p_mode;
  else raise exception 'INVALID_INPUT';
  end if;
  if v_id is null and (p_revision<>2 or not exists(select from admin.product_terms_v2 where product_id=p_product)
      or (p_channel='stripe' and exists(select from admin.catalog_stripe_prices where product_id=p_product and revision=p_revision))
      or (p_channel='waffo' and exists(select from admin.catalog_waffo_bindings where product_id=p_product and revision=p_revision))) then
    raise exception 'CATALOG_CHANNEL_UNVERIFIED';
  end if;
  return v_id;
end
$$;

create function public.resume_catalog_checkout(p_user uuid,p_token uuid,p_hash text,p_channel text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a admin.catalog_checkout_attempts;
begin
  select * into a from admin.catalog_checkout_attempts where token=p_token;
  if not found then return null; end if;
  if (a.user_id,a.request_hash,a.channel) is distinct from (p_user,p_hash,p_channel)
    or a.expires_at<=now() then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('params',a.params,'session_id',a.session_id,'session_url',a.session_url);
end
$$;

-- Re-read the buyer's eligibility and the reserved coupon in the quote transaction.
-- Campaigns compete with membership rates on the list amount, with Stripe's cent rounding.
create function admin.catalog_buyer_terms(p_user uuid,p_product text,p_list int,p_token uuid,
  p_channel text,p_unit int,p_net int,p_percent int,p_params jsonb) returns void
language plpgsql set search_path='' as $$
declare
  tier text;
  member_cents integer := p_list;
  coupon_cents integer;
  discount jsonb;
  product_tier text;
  plan_rank integer := admin.catalog_membership_rank(p_product);
  tiers text[] := array['starter','pro','max'];
begin
  perform 1 from public.profiles where id=p_user and banned_at is null for share;
  if not found then raise exception 'USER_BANNED'; end if;
  tier := public.current_tier(p_user);
  select c.tier into strict product_tier from admin.catalog_products c where c.product_id=p_product;
  if plan_rank>0 and (array_position(tiers,tier)>array_position(tiers,product_tier)
      or exists(select from public.subscriptions where user_id=p_user and status in ('active','trialing','past_due','unpaid','paused')
        and admin.catalog_membership_rank(product_id)>=plan_rank)) then raise exception 'DOWNGRADE_NOT_ALLOWED'; end if;
  if p_product in ('pack_m','pack_l') then
    member_cents := ((p_list::bigint * case tier when 'starter' then 95 when 'pro' then 90 when 'max' then 85 else 100 end +50)/100)::integer;
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
revoke all on function admin.catalog_buyer_terms(uuid,text,int,uuid,text,int,int,int,jsonb) from public,anon,authenticated,service_role;

create function public.lock_catalog_checkout(p_user uuid,p_token uuid,p_hash text,p_product text,p_revision int,
  p_channel text,p_key text,p_price text,p_unit int,p_net int,p_percent int,p_method text,p_form text,p_params jsonb,
  p_store text default null,p_mode text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v admin.catalog_product_versions;
  v_bound text;
  v_retry jsonb;
  v_expiry timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_token::text,0));
  v_retry := public.resume_catalog_checkout(p_user,p_token,p_hash,p_channel);
  if v_retry is not null then return v_retry; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.catalog.economics',0));
  perform 1 from public.system_settings where key='pricing_catalog_version' and value='"v2"' for share;
  if not found then raise exception 'CODE_CHECKOUT_OFFER_CHANGED'; end if;
  select ver.* into v from admin.catalog_products p join admin.catalog_product_versions ver
    on (p.product_id,p.published_revision)=(ver.product_id,ver.revision)
    where p.product_id=p_product and p.published_revision=p_revision and ver.listed for share of p;
  if not found then raise exception 'CODE_CHECKOUT_OFFER_CHANGED'; end if;
  v_bound := public.catalog_channel_price(p_product,p_revision,p_channel,p_key,p_form='subscription',p_store,p_mode);
  if v_bound is not null and v_bound<>p_price then raise exception 'CODE_CHECKOUT_OFFER_CHANGED'; end if;
  if p_unit<=0 or p_net<=0 or p_unit>v.usd_cents or p_net>p_unit then raise exception 'INVALID_INPUT'; end if;
  perform admin.catalog_buyer_terms(p_user,p_product,v.usd_cents,p_token,p_channel,p_unit,p_net,p_percent,p_params);
  perform admin.assert_catalog_checkout(p_product,p_revision,p_net,p_percent);
  v_expiry := case when p_channel='stripe' then to_timestamp((p_params->>'expires_at')::bigint)
    else now()+interval '30 minutes' end;
  insert into admin.catalog_checkout_attempts(token,user_id,product_id,revision,channel,request_hash,price_id,
    unit_cents,net_cents,credits,paid_days,method,form,expires_at,params)
    values (p_token,p_user,p_product,p_revision,p_channel,p_hash,p_price,p_unit,p_net,
      v.credits,v.paid_days,p_method,p_form,v_expiry,p_params);
  return public.resume_catalog_checkout(p_user,p_token,p_hash,p_channel);
end
$$;

-- Waffo does not expose a retrieve-by-idempotency-key API. If the first POST
-- times out, keep this attempt in flight instead of opening another payable session.
create function public.claim_waffo_catalog_session(p_user uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  a admin.catalog_checkout_attempts;
begin
  select * into strict a from admin.catalog_checkout_attempts
    where token=p_token and user_id=p_user and channel='waffo' and expires_at>now() for update;
  if a.session_url is not null then return jsonb_build_object('url',a.session_url); end if;
  if a.provider_started then return jsonb_build_object('pending',true); end if;
  update admin.catalog_checkout_attempts set provider_started=true where token=p_token;
  return jsonb_build_object('claimed',true);
end $$;
revoke all on function public.claim_waffo_catalog_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_waffo_catalog_session(uuid,uuid) to service_role;

create function public.attach_catalog_session(p_user uuid,p_token uuid,p_session text,p_url text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update admin.catalog_checkout_attempts set session_id=p_session,session_url=p_url,
    params=(params #- '{metadata,buyer_ip}') #- '{metadata,buyer_ua}'
    where token=p_token and user_id=p_user and (session_id is null or session_id=p_session);
  if not found then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return true;
end
$$;
revoke all on function public.resume_catalog_checkout(uuid,uuid,text,text),public.attach_catalog_session(uuid,uuid,text,text),
  public.catalog_channel_price(text,int,text,text,boolean,text,text),public.lock_catalog_checkout(uuid,uuid,text,text,int,text,text,text,int,int,int,text,text,jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.resume_catalog_checkout(uuid,uuid,text,text),public.attach_catalog_session(uuid,uuid,text,text),
  public.catalog_channel_price(text,int,text,text,boolean,text,text),public.lock_catalog_checkout(uuid,uuid,text,text,int,text,text,text,int,int,int,text,text,jsonb,text,text)
  to service_role;
