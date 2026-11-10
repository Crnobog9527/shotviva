-- One final disposition per quoted renewal, in the same transaction as its grant or billing ticket.
create table admin.waffo_renewal_periods (
  order_id text not null,
  period_number integer not null check (period_number > 1),
  payment_id text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.products(id),
  ticket_id uuid,
  primary key (order_id, period_number)
);
alter table admin.waffo_renewal_periods enable row level security;
revoke all on admin.waffo_renewal_periods from public, anon, authenticated, service_role;
create index waffo_renewal_periods_user_idx on admin.waffo_renewal_periods(user_id);
create index waffo_renewal_periods_product_idx on admin.waffo_renewal_periods(product_id);

create function public.settle_waffo_renewal_v2(
  p_user_id uuid, p_product_id text, p_order_id text, p_period integer, p_payment_id text,
  p_quoted integer, p_charged integer, p_tax integer, p_subtotal integer, p_currency text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ticket uuid;
  v_prior admin.waffo_renewal_periods;
  v_change public.credit_change;
  v_review boolean;
begin
  if p_quoted is null or p_quoted <= 0 or p_product_id like 'pack_%' then
    raise exception 'INVALID_INPUT';
  end if;
  v_review := p_currency is distinct from 'usd' or p_charged is null
    or p_tax < 0 or p_tax is null or p_charged - p_tax <> p_quoted
    or (p_subtotal is not null and p_subtotal <> p_quoted);
  if v_review then v_ticket := gen_random_uuid(); end if;

  insert into admin.waffo_renewal_periods(order_id, period_number, payment_id, user_id, product_id, ticket_id)
  values(p_order_id, p_period, p_payment_id, p_user_id, p_product_id, v_ticket)
  on conflict (order_id, period_number) do nothing;
  if not found then
    select * into strict v_prior from admin.waffo_renewal_periods
      where order_id = p_order_id and period_number = p_period;
    if v_prior.user_id <> p_user_id or v_prior.product_id <> p_product_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('outcome', case when v_prior.ticket_id is null then 'replayed' else 'review' end);
  end if;

  -- A payment applied by the previous deployment already has its final disposition.
  if exists(select from public.payments where waffo_payment_id = p_payment_id
    and user_id = p_user_id and product_id = p_product_id and waffo_order_id = p_order_id) then
    update admin.waffo_renewal_periods set ticket_id = null where order_id = p_order_id and period_number = p_period;
    return jsonb_build_object('outcome','replayed');
  end if;
  if not v_review then
    v_change := public.settle_waffo_order_v2(p_user_id,p_product_id,p_payment_id,p_order_id,p_charged,p_currency,p_tax,'card');
    return jsonb_build_object('outcome',case when v_change.applied then 'applied' else 'replayed' end);
  end if;

  insert into public.support_tickets(id, user_id, type) values (v_ticket, p_user_id, 'billing');
  insert into public.support_ticket_messages(ticket_id, author, body) values (v_ticket, 'admin',
    format('Waffo renewal undergoing manual review. Order %s, period %s, payment %s, product %s. Original quote: %s USD cents. Charged: %s %s minor units, tax: %s, listed subtotal: %s. Credits pending.',
      p_order_id, p_period, p_payment_id, p_product_id, p_quoted, coalesce(p_charged::text,'unknown'),
      coalesce(p_currency,'unknown'), p_tax, coalesce(p_subtotal::text,'unknown')));
  return jsonb_build_object('outcome','review','ticket_id',v_ticket);
end;
$$;
revoke all on function public.settle_waffo_renewal_v2(uuid,text,text,integer,text,integer,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.settle_waffo_renewal_v2(uuid,text,text,integer,text,integer,integer,integer,integer,text) to service_role;
