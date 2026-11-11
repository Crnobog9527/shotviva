-- Authenticated provider receipts bind a single event to one frozen quote. An invoice may
-- arrive before the checkout notification. Both carry the attempt on subscription metadata.
create table admin.catalog_contracts (
  channel text not null, subscription_id text not null, token uuid not null references admin.catalog_checkout_attempts(token) on delete cascade,
  primary key(channel,subscription_id), unique(token)
);
create table admin.catalog_receipts (
  event_key text primary key, token uuid not null references admin.catalog_checkout_attempts(token) on delete cascade,
  initial_payment boolean not null
);
create unique index catalog_single_initial_payment on admin.catalog_receipts(token) where initial_payment;
create index catalog_receipt_attempt on admin.catalog_receipts(token);
alter table admin.catalog_receipts enable row level security;
alter table admin.catalog_contracts enable row level security;
revoke all on admin.catalog_contracts,admin.catalog_receipts from public,anon,authenticated,service_role;

create function public.catalog_receipt(p_token uuid,p_user uuid,p_product text,p_revision int,p_channel text,p_price text,
  p_unit int,p_credits int,p_ref text,p_contract text,p_renewal boolean,p_net int,p_discounted boolean,p_record boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a admin.catalog_checkout_attempts;
  c admin.catalog_products;
  k text;
begin
  select * into strict a from admin.catalog_checkout_attempts where token=p_token for update;
  if (a.user_id,a.product_id,a.revision,a.channel,a.price_id,a.unit_cents,a.credits)
    is distinct from (p_user,p_product,p_revision,p_channel,p_price,p_unit,p_credits) then
    raise exception 'CATALOG_RECEIPT_MISMATCH'; end if;
  if (a.form='subscription') is distinct from (p_contract is not null) or (p_renewal and p_contract is null)
    then raise exception 'CATALOG_CONTRACT_MISMATCH'; end if;
  if p_channel='stripe' and p_net is distinct from
    (case when p_renewal and not p_discounted then a.unit_cents else a.net_cents end)
    then raise exception 'CATALOG_PAID_AMOUNT_MISMATCH'; end if;
  if p_channel='stripe' and not p_renewal then
    if a.session_id is not null and a.session_id<>p_ref then raise exception 'CATALOG_SESSION_MISMATCH'; end if;
    if p_record then update admin.catalog_checkout_attempts set session_id=p_ref where token=p_token; end if;
  end if;
  if p_record and p_contract is not null then
    insert into admin.catalog_contracts(channel,subscription_id,token) values (p_channel,p_contract,p_token)
      on conflict(channel,subscription_id) do nothing;
    if not exists(select from admin.catalog_contracts where channel=p_channel and subscription_id=p_contract and token=p_token)
      then raise exception 'CATALOG_CONTRACT_MISMATCH'; end if;
  end if;
  k := case when p_renewal and p_channel='stripe' then 'renewal:' else 'purchase:' end || p_ref;
  if p_record then
    insert into admin.catalog_receipts(event_key,token,initial_payment) values(k,p_token,not p_renewal)
      on conflict do nothing;
    if not exists(select from admin.catalog_receipts where event_key=k and token=p_token and initial_payment=not p_renewal)
      then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  end if;
  select * into strict c from admin.catalog_products where product_id=p_product;
  return jsonb_build_object('id',p_product,'tier',c.tier,'interval',
    case c.kind when 'monthly' then 'month' when 'yearly' then 'year' end,
    'paidDays',a.paid_days,'credits',a.credits,'priceUsd',a.unit_cents::numeric/100);
end
$$;

create function public.catalog_legacy_price(p_product text,p_key text,p_price text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from admin.catalog_stripe_prices where product_id=p_product and revision=2
    and lookup_key=p_key and price_id=p_price);
$$;

revoke all on function public.catalog_receipt(uuid,uuid,text,int,text,text,int,int,text,text,boolean,int,boolean,boolean),
  public.catalog_legacy_price(text,text,text) from public,anon,authenticated;
grant execute on function public.catalog_receipt(uuid,uuid,text,int,text,text,int,int,text,text,boolean,int,boolean,boolean),
  public.catalog_legacy_price(text,text,text) to service_role;
