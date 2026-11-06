-- T50 (ARCHITECTURE §6.3): the subscriptions mirror also holds Waffo card subscriptions
-- (provider 'waffo', keyed by the Waffo order id ORD_…). A surrogate id becomes the primary key;
-- stripe_subscription_id stays unique, so settle_checkout's on conflict keeps working. Waffo's
-- statuses are written in the mirror's existing vocabulary (canceling = active + cancel at
-- period end), so the status check is unchanged. last_event_at orders Waffo's webhooks, which
-- carry no state we could re-read cheaply.
alter table public.subscriptions
  add column id bigint generated always as identity,
  add column provider text not null default 'stripe',
  add column waffo_order_id text,
  add column last_event_at timestamptz;

alter table public.subscriptions drop constraint subscriptions_pkey;
alter table public.subscriptions
  add constraint subscriptions_pkey primary key (id),
  add constraint subscriptions_stripe_subscription_id_key unique (stripe_subscription_id),
  add constraint subscriptions_waffo_order_id_key unique (waffo_order_id),
  add constraint subscriptions_provider_check check (provider in ('stripe', 'waffo')),
  add constraint subscriptions_waffo_order_id_check check (waffo_order_id ~ '^ORD_'),
  add constraint subscriptions_provider_ids_check check (
    (provider = 'stripe' and stripe_subscription_id is not null and waffo_order_id is null)
    or (provider = 'waffo' and waffo_order_id is not null and stripe_subscription_id is null)
  );
alter table public.subscriptions alter column stripe_subscription_id drop not null;

-- One Waffo subscription.* event (or our own cancel) → the mirror. Upsert by waffo_order_id;
-- the first event for an order must name its period end. An order belonging to another user or
-- product is refused. An event older than the last one applied changes nothing, and canceled is
-- final (ARCHITECTURE §6.2 「Waffo 卡订阅也进这张表」). Never touches credits or paid_until: those come from settle_waffo_order per charge.
-- Returns whether the row changed.
create function public.sync_waffo_subscription(
  p_user_id uuid,
  p_order_id text,
  p_product_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subscriptions;
begin
  if p_user_id is null or p_order_id is null or p_product_id is null or p_status is null
     or p_cancel_at_period_end is null or p_event_at is null then
    raise exception 'INVALID_INPUT' using detail = 'subscription fields are all required';
  end if;
  if p_status not in ('active', 'past_due', 'canceled') then
    raise exception 'INVALID_INPUT' using detail = 'unknown waffo mirror status';
  end if;

  select * into v_row from public.subscriptions where waffo_order_id = p_order_id for update;

  if not found then
    if p_current_period_end is null then
      raise exception 'INVALID_INPUT' using detail = 'a new waffo subscription needs its period end';
    end if;
    insert into public.subscriptions
      (provider, waffo_order_id, user_id, product_id, status, current_period_end, cancel_at_period_end, last_event_at)
    values
      ('waffo', p_order_id, p_user_id, p_product_id, p_status, p_current_period_end, p_cancel_at_period_end, p_event_at);
    return true;
  end if;

  if v_row.user_id <> p_user_id or v_row.product_id <> p_product_id then
    raise exception 'IDEMPOTENCY_CONFLICT' using detail = 'subscription belongs to another user or product';
  end if;
  if v_row.status = 'canceled' or (v_row.last_event_at is not null and p_event_at < v_row.last_event_at) then
    return false;
  end if;

  update public.subscriptions
     set status = p_status,
         current_period_end = coalesce(p_current_period_end, current_period_end),
         cancel_at_period_end = p_cancel_at_period_end,
         last_event_at = p_event_at,
         updated_at = now()
   where id = v_row.id;
  return true;
end;
$$;

revoke execute on function public.sync_waffo_subscription(uuid, text, text, text, timestamptz, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_waffo_subscription(uuid, text, text, text, timestamptz, boolean, timestamptz)
  to service_role;
