-- Keep each charge, including additional payment IDs for a period, for reconciliation.
create table admin.waffo_renewal_periods (
  payment_id text primary key,
  order_id text not null,
  period_number integer not null check (period_number > 1),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.products(id),
  quoted_cents integer not null check (quoted_cents > 0),
  charged_cents integer,
  tax_cents integer,
  subtotal_cents integer,
  currency text,
  review_reason text check (review_reason in ('amount_mismatch', 'duplicate_payment')),
  ticket_id uuid unique
);
create unique index waffo_renewal_primary_period_idx on admin.waffo_renewal_periods(order_id, period_number)
  where review_reason is distinct from 'duplicate_payment';
alter table admin.waffo_renewal_periods enable row level security;
revoke all on admin.waffo_renewal_periods from public, anon, authenticated, service_role;
create index waffo_renewal_periods_user_idx on admin.waffo_renewal_periods(user_id);
create index waffo_renewal_periods_product_idx on admin.waffo_renewal_periods(product_id);

create function public.settle_waffo_renewal_v2(
  p_user_id uuid, p_product_id text, p_order_id text, p_period integer, p_payment_id text,
  p_quoted integer, p_charged integer, p_tax integer, p_subtotal integer, p_currency text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prior admin.waffo_renewal_periods;
  v_reason text;
  v_ticket uuid;
  v_change public.credit_change;
  v_previously_paid boolean;
begin
  if p_quoted is null or p_quoted <= 0 or p_product_id like 'pack_%' then
    raise exception 'INVALID_INPUT';
  end if;
  -- Serialize competing payment IDs as well as redeliveries for this period.
  perform pg_advisory_xact_lock(hashtextextended('waffo-renewal:' || p_order_id || ':' || p_period, 0));
  select * into v_prior from admin.waffo_renewal_periods where payment_id = p_payment_id;
  if found then
    if (v_prior.user_id, v_prior.product_id, v_prior.order_id, v_prior.period_number)
      is distinct from (p_user_id, p_product_id, p_order_id, p_period) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('outcome',case when v_prior.review_reason is null then 'replayed' else 'review' end);
  end if;

  select * into v_prior from admin.waffo_renewal_periods where order_id=p_order_id and period_number=p_period
    and review_reason is distinct from 'duplicate_payment';
  if found then
    if (v_prior.user_id,v_prior.product_id) is distinct from (p_user_id,p_product_id) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    v_reason := 'duplicate_payment';
  end if;
  select exists(select from public.payments where waffo_payment_id=p_payment_id and user_id=p_user_id
    and product_id=p_product_id and waffo_order_id=p_order_id) into v_previously_paid;
  if v_reason is null and not v_previously_paid and (p_currency is distinct from 'usd' or p_charged is null
    or p_tax is null or p_tax < 0 or p_charged-p_tax <> p_quoted
    or (p_subtotal is not null and p_subtotal <> p_quoted)) then
    v_reason := 'amount_mismatch';
  end if;
  if v_reason is not null then v_ticket := gen_random_uuid(); end if;
  insert into admin.waffo_renewal_periods(payment_id,order_id,period_number,user_id,product_id,
    quoted_cents,charged_cents,tax_cents,subtotal_cents,currency,review_reason,ticket_id)
  values(p_payment_id,p_order_id,p_period,p_user_id,p_product_id,p_quoted,p_charged,p_tax,p_subtotal,p_currency,v_reason,v_ticket);

  if v_ticket is not null then
    insert into public.support_tickets(id,user_id,type) values(v_ticket,p_user_id,'billing');
    insert into public.support_ticket_messages(ticket_id,author,body) values(v_ticket,'admin',
      E'我们正在核对你这期续费的扣款，核对完成后会在这张工单里通知你。\nWe’re checking the charge for this renewal. We’ll update you here once we’ve reviewed it.');
    return jsonb_build_object('outcome','review','ticket_id',v_ticket,'reason',v_reason);
  end if;
  if v_previously_paid then return jsonb_build_object('outcome','replayed'); end if;
  v_change := public.settle_waffo_order_v2(p_user_id,p_product_id,p_payment_id,p_order_id,p_charged,p_currency,p_tax,'card');
  return jsonb_build_object('outcome',case when v_change.applied then 'applied' else 'replayed' end);
end;
$$;
revoke all on function public.settle_waffo_renewal_v2(uuid,text,text,integer,text,integer,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.settle_waffo_renewal_v2(uuid,text,text,integer,text,integer,integer,integer,integer,text) to service_role;
