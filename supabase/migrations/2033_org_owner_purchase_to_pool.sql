-- An org main admin's purchase goes straight into the org's paid pool (Owner 2026-11-27,
-- ARCHITECTURE §6.2 / §6.5).
--
-- Until now the credits of a subscription or credit pack bought by an org's main admin landed in
-- his own paid pool and he moved them with org_deposit (org_credit_ledger 'owner_deposit') by hand.
-- Now, when the buyer is, at settlement, the owner of an ACTIVE org (orgs.owner_user_id, with an
-- active org_members row of role 'owner'), the settlement deposits the purchased credits into that
-- org's pool in the same transaction, booked exactly as the manual deposit is:
--
--   credit_ledger      'purchase'  +N  purchase:<event> / renewal:<invoice>   (unchanged)
--   credit_ledger      'org_deposit' −N  org:pay:<that key>, reason org:<org id>
--   org_credit_ledger  'owner_deposit' +N  request_id pay:<that key>, member = actor = buyer
--
-- So the buyer's personal balance ends where it started, and everything that reads the purchase
-- row (current_tier, upgrades, _payment_granted_credits, _end_membership_after_refund, the success
-- page, invite and affiliate effects on the payments row) works as before. The membership itself
-- (paid_until, current_tier and its perks) stays on the buyer's account; only the credits move.
-- A suspended org, or a buyer who is not (or no longer) the main admin when the payment settles,
-- keeps today's behaviour: the credits go to the personal pool. Staff still cannot buy (checkout
-- route, ORG_MEMBER_CHECKOUT); if a staff payment ever settles it is personal, as today.
--
-- Money rules: the deposit runs only when the purchase row was inserted now (credit_change.applied),
-- so a webhook replay credits neither pool again; its keys are unique (credit_ledger idempotency
-- key, org_credit_ledger request_id). Lock order: the org row (FOR NO KEY UPDATE) is taken first,
-- before the profile, which is the order of every org function (org -> profile -> org_members).
--
-- Refunds, disputes and the admin's 「扣回剩余积分」 follow the credits: for a payment whose credits
-- went to an org pool (found by its owner_deposit row, _payment_credits_org) they are taken back
-- from that org's paid pool — whatever the org's status now — never below 0 (orgs_pool_credits_check);
-- what the members were already allocated is not reached for, and the rest is written off on the
-- payment (clawback_shortfall), as for a personal purchase whose credits were spent. A won dispute
-- gives its share back to the same pool. New org_credit_ledger kinds: 'payment_clawback' and
-- 'payment_clawback_restore'. refund_eligibility: for such a payment "credits used" means the org
-- allocated from its pool after the payment (or the buyer spent / deposited by hand); the automatic
-- deposits themselves never count.
--
-- Lock order: wherever an org row and a profile are both taken, the org row comes first
-- (purchase_terms, renewal_terms, checkout_terms before the subscription mirror, and
-- open_payment_dispute before it bans the buyer); refunds take payment -> org -> profile.
--
-- Expand-only: a wider check constraint, new internal functions, and create or replace (same
-- signatures) of purchase_terms, renewal_terms, checkout_terms, clawback_payment_credits,
-- admin_clawback_payment, payment_clawback_preview (two extra keys), refund_eligibility,
-- open_payment_dispute, close_payment_dispute, org_pool_month (two extra keys under paid) and
-- _org_replayed (refuses the new reserved request-id prefixes). Code from before this deploy calls
-- the same functions and gets the new routing; its screens just do not say where the credits went.

alter table public.org_credit_ledger drop constraint org_credit_ledger_kind_check;
alter table public.org_credit_ledger add constraint org_credit_ledger_kind_check check (kind = any (array[
  'bank_grant', 'owner_deposit', 'allocate', 'reclaim', 'admin_adjust',
  'promo_grant', 'promo_allocate', 'promo_reclaim', 'promo_expire',
  'payment_clawback', 'payment_clawback_restore'])) not valid;
alter table public.org_credit_ledger validate constraint org_credit_ledger_kind_check;

-- The purchase row's key for a payment: the same keys as _payment_granted_credits.
create function public._payment_grant_key(p_payment public.payments) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_payment.stripe_session_id is not null then 'purchase:' || p_payment.stripe_session_id
    when p_payment.stripe_invoice_id is not null then 'renewal:' || p_payment.stripe_invoice_id
    when p_payment.waffo_payment_id is not null then 'purchase:' || p_payment.waffo_payment_id
  end
$$;
revoke all on function public._payment_grant_key(public.payments) from public, anon, authenticated, service_role;

-- The org whose pool received this payment's credits at settlement, or null (personal).
create function public._payment_credits_org(p_payment public.payments) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.org_id from public.org_credit_ledger l
   where l.request_id = 'pay:' || public._payment_grant_key(p_payment)
     and l.kind = 'owner_deposit' and l.member_user_id = p_payment.user_id
$$;
revoke all on function public._payment_credits_org(public.payments) from public, anon, authenticated, service_role;

-- At settlement, before the profile is locked: the active org the buyer is the main admin of,
-- with its row locked (FOR NO KEY UPDATE, as org_deposit). An owner transfer or a suspension
-- holding the row makes this wait and then read the committed owner and status.
create function public._org_purchase_pool(p_user uuid, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if p_user is null or p_key is null or length('pay:' || p_key) > 200 then return null; end if;
  select o.id into v_org from public.orgs o where o.owner_user_id = p_user and o.status = 'active' for no key update;
  if v_org is null or not exists (select 1 from public.org_members m
      where m.org_id = v_org and m.user_id = p_user and m.status = 'active' and m.role = 'owner') then
    return null;
  end if;
  return v_org;
end $$;
revoke all on function public._org_purchase_pool(uuid, text) from public, anon, authenticated, service_role;

-- Right after the purchase row was inserted: move those credits into the org pool, booked as a
-- manual org_deposit is. Returns the buyer's balance after it (the credit_change callers get).
create function public._org_purchase_deposit(p_org uuid, p_user uuid, p_key text, p_credits integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_request text := 'pay:' || p_key;
  v_pool bigint;
  v_change public.credit_change;
begin
  if p_org is null or coalesce(p_credits, 0) <= 0
     or exists (select 1 from public.org_credit_ledger where request_id = v_request) then
    return (select credits from public.profiles where id = p_user);
  end if;
  v_change := public._apply_credit_change(p_user, 'paid', 'org_deposit', -p_credits, 'org:' || p_org::text, 'org:' || v_request);
  update public.orgs set pool_credits = pool_credits + p_credits, updated_at = now() where id = p_org returning pool_credits into v_pool;
  insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, reference, note, actor)
    values (p_org, 'owner_deposit', p_credits, v_pool, p_user, v_request, left(p_key, 200), '购买直接存入企业积分池', p_user);
  return v_change.credits;
end $$;
revoke all on function public._org_purchase_deposit(uuid, uuid, text, integer) from public, anon, authenticated, service_role;

-- Takes up to p_owed of a payment's credits back from the org pool they went to (never below 0).
-- Returns what it took, or −1 when this request id already settled (a replay).
create function public._org_payment_clawback(p_org uuid, p_payment public.payments, p_owed integer, p_request text,
  p_note text, p_actor uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_pool bigint;
  v_take integer;
begin
  select pool_credits into v_pool from public.orgs where id = p_org for no key update;
  if not found then return 0; end if;
  if exists (select 1 from public.org_credit_ledger where request_id = p_request) then return -1; end if;
  v_take := least(p_owed, greatest(v_pool, 0))::integer;
  if v_take > 0 then
    update public.orgs set pool_credits = pool_credits - v_take, updated_at = now() where id = p_org returning pool_credits into v_pool;
    insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, reference, note, actor)
      values (p_org, 'payment_clawback', -v_take, v_pool, p_payment.user_id, p_request, 'payment:' || p_payment.id, left(p_note, 2000), p_actor);
  end if;
  return v_take;
end $$;
revoke all on function public._org_payment_clawback(uuid, public.payments, integer, text, text, uuid) from public, anon, authenticated, service_role;

-- Request ids of the org side: at most 200 characters, so a long ref is hashed.
create function public._org_payment_request(p_prefix text, p_ref text) returns text
language sql immutable set search_path = '' as $$
  select case when length(p_prefix || p_ref) <= 200 then p_prefix || p_ref else p_prefix || md5(p_ref) end
$$;
revoke all on function public._org_payment_request(text, text) from public, anon, authenticated, service_role;

-- Reserved prefixes: pay: (automatic deposits) and payment_clawback (their clawbacks / restores).
create or replace function public._org_replayed(p_request text, p_org uuid, p_kind text, p_delta bigint, p_member uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare prior public.org_credit_ledger;
begin
  if p_request is null or length(p_request) not between 1 and 200 or starts_with(p_request, 'org_topup:')
     or starts_with(p_request, 'org_return:') or starts_with(p_request, 'org_promo_') or starts_with(p_request, 'partner_promo')
     or starts_with(p_request, 'pay:') or starts_with(p_request, 'payment_clawback') then
    raise exception 'INVALID_INPUT';
  end if;
  select * into prior from public.org_credit_ledger where request_id = p_request;
  if not found then return false; end if;
  if prior.org_id <> p_org or prior.kind <> p_kind or prior.delta <> coalesce(p_delta, prior.delta) or prior.member_user_id is distinct from p_member then
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;
  return true;
end;
$$;

create or replace function admin.purchase_terms(p_v2 boolean, p_user_id uuid, p_product_id text, p_event_id text)
returns public.credit_change
language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_change public.credit_change;
  v_paid_until timestamptz;
  v_held text;
  v_key text := 'purchase:' || p_event_id;
  v_org uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'event_id is required';
  end if;

  -- 2033: an active org's main admin buys into the org pool. The org row first (org -> profile).
  v_org := public._org_purchase_pool(p_user_id, v_key);

  v_product := admin.catalog_settlement_product(p_v2,p_user_id,p_product_id,v_key);

  if v_product.days is not null then
    -- Locked now so the read and the write below see the same paid_until.
    select paid_until into v_paid_until from public.profiles where id = p_user_id for update;
    if v_paid_until > now() then
      select product_id into v_held
        from public.credit_ledger
       where user_id = p_user_id
         and pool = 'paid'
         and delta > 0
         and product_id is not null
         and admin.catalog_membership_rank(product_id)>0
         and not exists (
           select 1 from public.payments p
            where p.user_id = p_user_id
              and p.status in ('refunded', 'partially_refunded')
              and idempotency_key in ('purchase:' || p.stripe_session_id, 'renewal:' || p.stripe_invoice_id, 'purchase:' || p.waffo_payment_id)
         )
       order by created_at desc, id desc
       limit 1;
    end if;
  end if;

  if v_held is null
     or admin.catalog_membership_rank(v_product.id) <= admin.catalog_membership_rank(v_held) then
    v_change := public._apply_credit_change(
      p_user_id, 'paid', 'purchase', v_product.credits, 'purchase ' || v_product.id,
      v_key, null, v_product.id, v_product.days
    );
    if v_change.applied and v_org is not null then
      v_change.credits := public._org_purchase_deposit(v_org, p_user_id, v_key, v_product.credits);
    end if;
    return v_change;
  end if;

  -- The upgrade: grant without days, then set paid_until from the payment.
  v_change := public._apply_credit_change(
    p_user_id, 'paid', 'purchase', v_product.credits, 'purchase ' || v_product.id,
    v_key, null, v_product.id, null
  );
  if not v_change.applied then
    return v_change;
  end if;

  update public.profiles
     set paid_until = greatest(paid_until, now() + make_interval(days => v_product.days))
   where id = p_user_id
  returning paid_until into v_change.paid_until;

  -- The row was inserted just above in this transaction; record where paid_until landed, as
  -- every membership grant does (apply_subscription_renewal does the same).
  update public.credit_ledger
     set paid_until_after = v_change.paid_until
   where idempotency_key = v_key;

  if v_org is not null then
    v_change.credits := public._org_purchase_deposit(v_org, p_user_id, v_key, v_product.credits);
  end if;

  return v_change;
end;
$$;

create or replace function admin.renewal_terms(p_v2 boolean, p_user_id uuid, p_product_id text, p_invoice_id text,
  p_period_end timestamptz, p_amount_total integer, p_currency text, p_amount_tax integer, p_method text,
  p_charge_id text default null)
returns public.credit_change
language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_change public.credit_change;
  v_key text := 'renewal:' || p_invoice_id;
  v_org uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  if p_invoice_id is null or p_invoice_id not like 'in\_%' then
    raise exception 'INVALID_INPUT' using detail = 'invoice id is required';
  end if;
  if p_period_end is null then
    raise exception 'INVALID_INPUT' using detail = 'period end is required';
  end if;
  if p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  -- 2033: an active org's main admin's renewal credits go to the org pool. The org row first.
  v_org := public._org_purchase_pool(p_user_id, v_key);

  -- Only memberships renew; packs are always one-time.
  v_product := admin.catalog_settlement_product(p_v2,p_user_id,p_product_id,v_key);
  if v_product.days is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  v_change := public._apply_credit_change(
    p_user_id, 'paid', 'purchase', v_product.credits, 'renewal ' || v_product.id,
    v_key, null, v_product.id, null
  );
  if not v_change.applied then
    return v_change;
  end if;

  update public.profiles
     set paid_until = greatest(paid_until, p_period_end)
   where id = p_user_id
  returning paid_until into v_change.paid_until;

  -- The row was inserted just above in this transaction; record where paid_until landed, as
  -- membership purchases do.
  update public.credit_ledger
     set paid_until_after = v_change.paid_until
   where idempotency_key = v_key;

  if v_org is not null then
    v_change.credits := public._org_purchase_deposit(v_org, p_user_id, v_key, v_product.credits);
  end if;

  insert into public.payments
    (user_id, product_id, channel, stripe_invoice_id, stripe_charge_id,
     amount_total, amount_tax, currency, method)
  values
    (p_user_id, p_product_id, 'stripe', p_invoice_id, p_charge_id,
     p_amount_total, p_amount_tax, lower(p_currency), p_method);

  return v_change;
end;
$$;

create or replace function public.clawback_payment_credits(p_payment_id bigint, p_ref text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_granted integer;
  v_due integer;
  v_owed integer;
  v_balance integer;
  v_take integer := 0;
  v_key text;
  v_org uuid;
begin
  if p_payment_id is null or p_ref is null or length(p_ref) = 0 or p_reason is null or length(p_reason) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'payment id, ref and reason are required';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  v_granted := public._payment_granted_credits(v_payment);
  v_due := case
    when v_payment.status = 'disputed' then v_granted
    when v_payment.amount_refunded >= v_payment.amount_total then
      case when v_payment.amount_refunded > 0 or v_payment.status = 'refunded' then v_granted else 0 end
    else (v_granted::bigint * v_payment.amount_refunded / v_payment.amount_total)::integer
  end;
  v_owed := greatest(0, v_due - v_payment.credits_clawed_back - v_payment.clawback_shortfall);

  if v_owed > 0 then
    v_org := public._payment_credits_org(v_payment);
    if v_org is not null then
      -- 2033: the credits went to an org pool at settlement; they come back from there.
      v_take := public._org_payment_clawback(v_org, v_payment, v_owed,
        public._org_payment_request('payment_clawback:' || p_payment_id || ':', p_ref), p_reason, null);
      if v_take < 0 then
        v_take := 0;
        v_owed := 0;
      end if;
    else
      select credits into v_balance from public.profiles where id = v_payment.user_id for update;
      -- Only the member's own credits: the org-held share (1629 keeps it at most credits) is the org's.
      v_balance := coalesce(v_balance, 0) - coalesce((select m.held_credits from public.org_members m
        where m.user_id = v_payment.user_id and m.status = 'active'), 0);
      v_take := least(v_owed, greatest(v_balance, 0));
      if v_take > 0 then
        v_key := 'clawback:' || p_payment_id || ':' || p_ref;
        if not (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback', -v_take, p_reason, v_key)).applied then
          -- This ref already settled its share (nothing left to do for it).
          v_take := 0;
          v_owed := 0;
        else
          update public.credit_ledger set payment_id = p_payment_id where idempotency_key = v_key;
        end if;
      end if;
    end if;
    update public.payments
       set credits_clawed_back = credits_clawed_back + v_take,
           clawback_shortfall = clawback_shortfall + (v_owed - v_take)
     where id = p_payment_id
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'granted', v_granted,
    'taken', v_take,
    'written_off', v_owed - v_take,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall
  );
end;
$$;

create or replace function public.admin_clawback_payment(p_payment_id bigint, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_granted integer;
  v_balance integer;
  v_take integer;
  v_key text;
  v_org uuid;
  v_note text;
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  v_granted := public._payment_granted_credits(v_payment);
  v_org := public._payment_credits_org(v_payment);
  v_key := 'clawback:' || p_payment_id || ':admin:' || (v_payment.credits_clawed_back + v_payment.clawback_shortfall);
  v_note := '后台扣回付款 #' || p_payment_id || ' 的剩余积分 · 操作人 ' || p_actor::text;

  if v_org is not null then
    -- 2033: from the org pool the purchase went to.
    v_take := greatest(0, v_granted - v_payment.credits_clawed_back - v_payment.clawback_shortfall);
    if v_take > 0 then
      v_take := greatest(0, public._org_payment_clawback(v_org, v_payment, v_take, 'payment_' || v_key, v_note, p_actor));
    end if;
    if v_take > 0 then
      update public.payments set credits_clawed_back = credits_clawed_back + v_take
       where id = p_payment_id
      returning * into v_payment;
      insert into public.admin_audit_log (action, user_id, reason, target_id)
      values ('clawback_payment', v_payment.user_id, '从企业积分池扣回 ' || v_take || ' 积分 · 操作人 ' || p_actor::text, p_payment_id::text);
    end if;
  else
    select credits into v_balance from public.profiles where id = v_payment.user_id for update;
    -- Only the member's own credits: the org-held share is the org's (1629 keeps it at most credits).
    v_balance := coalesce(v_balance, 0) - coalesce((select m.held_credits from public.org_members m
        where m.user_id = v_payment.user_id and m.status = 'active'), 0);
    v_take := greatest(0, least(coalesce(v_balance, 0), v_granted - v_payment.credits_clawed_back - v_payment.clawback_shortfall));

    if v_take > 0 then
      if (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback', -v_take, v_note, v_key)).applied then
        update public.credit_ledger set payment_id = p_payment_id where idempotency_key = v_key;
        update public.payments set credits_clawed_back = credits_clawed_back + v_take
         where id = p_payment_id
        returning * into v_payment;
        insert into public.admin_audit_log (action, user_id, reason, target_id)
        values ('clawback_payment', v_payment.user_id, '扣回 ' || v_take || ' 积分 · 操作人 ' || p_actor::text, p_payment_id::text);
      else
        v_take := 0;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'taken', v_take,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall
  );
end;
$$;

create or replace function public.payment_clawback_preview(p_payment_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_granted integer;
  v_balance integer;
  v_held integer;
  v_org public.orgs;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  v_granted := public._payment_granted_credits(v_payment);
  select * into v_org from public.orgs where id = public._payment_credits_org(v_payment);
  if v_org.id is not null then
    -- 2033: the purchase went to this org's pool; that is what a clawback takes from.
    v_balance := least(v_org.pool_credits, 2147483647)::integer;
    v_held := 0;
  else
    select credits into v_balance from public.profiles where id = v_payment.user_id;
    v_held := coalesce((select m.held_credits from public.org_members m
        where m.user_id = v_payment.user_id and m.status = 'active'), 0);
  end if;
  return jsonb_build_object(
    'payment_id', v_payment.id,
    'user_id', v_payment.user_id,
    'product_id', v_payment.product_id,
    'granted', v_granted,
    'credits_clawed_back', v_payment.credits_clawed_back,
    'clawback_shortfall', v_payment.clawback_shortfall,
    'balance', coalesce(v_balance, 0),
    'org_held', v_held,
    'available', greatest(0, least(coalesce(v_balance, 0) - v_held, v_granted - v_payment.credits_clawed_back - v_payment.clawback_shortfall)),
    'org_id', v_org.id,
    'org_name', v_org.name
  );
end;
$$;

create or replace function public.refund_eligibility(p_payment_id bigint, p_asked_at timestamptz)
returns table(first_purchase boolean, within_7_days boolean, no_credits_used boolean, suggested_cents integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_org uuid;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  v_org := public._payment_credits_org(v_payment);

  first_purchase := not exists (
    select 1 from public.payments q
     where q.user_id = v_payment.user_id
       and q.id < v_payment.id
       and (q.product_id like 'pack\_%') = (v_payment.product_id like 'pack\_%')
  );
  within_7_days := coalesce(p_asked_at, now()) - v_payment.created_at <= interval '7 days';
  -- A manual deposit into the org pool counts as using the credits (1630); the automatic deposit
  -- of a purchase (2033, org:pay:…) does not. When this payment's credits went to an org pool,
  -- any allocation from that pool after the payment counts as using them.
  no_credits_used := not exists (
    select 1 from public.credit_ledger l
     where l.user_id = v_payment.user_id and l.kind in ('reserve','org_deposit') and l.created_at > v_payment.created_at
       and not (l.kind = 'org_deposit' and starts_with(l.idempotency_key, 'org:pay:'))
  ) and (v_org is null or not exists (
    select 1 from public.org_credit_ledger o
     where o.org_id = v_org and o.kind = 'allocate' and o.created_at > v_payment.created_at
  ));
  suggested_cents := greatest(0, least(
    round((v_payment.amount_total - v_payment.amount_tax) * 0.94)::integer + v_payment.amount_tax,
    v_payment.amount_total - v_payment.amount_refunded
  ));
  return next;
end;
$$;

create or replace function public.close_payment_dispute(p_dispute_id text, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $_$
declare
  v_row public.payment_disputes;
  v_open public.payment_disputes;
  v_payment public.payments;
  v_first boolean := false;
  v_superseded boolean := false;
  v_kept boolean := p_status in ('won', 'warning_closed');
  v_key text := 'clawback_restore:' || p_dispute_id;
  v_org uuid;
  v_request text;
  v_pool bigint;
begin
  if p_dispute_id is null or p_status is null or p_status !~ '^[a-z_]{1,40}$' then
    raise exception 'INVALID_INPUT' using detail = 'dispute id and status are required';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if not found then
    return null;
  end if;
  if v_row.payment_id is null then
    -- A purchase can now attach this orphan while close is running. Re-read
    -- after its charge lock before choosing the payment to lock and restore.
    perform pg_advisory_xact_lock(hashtextextended(v_row.stripe_charge_id, 914));
    select * into strict v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  end if;
  if v_row.payment_id is not null then
    select * into v_payment from public.payments where id = v_row.payment_id for update;
  end if;
  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id for update;

  if v_row.closed_at is null then
    v_first := true;
    update public.payment_disputes set closed_status = p_status, closed_at = now()
     where stripe_dispute_id = p_dispute_id
    returning * into v_row;

    if v_row.payment_id is not null then
      select * into v_open from public.payment_disputes
       where payment_id = v_row.payment_id and closed_at is null
       order by created_at desc, stripe_dispute_id desc
       limit 1
       for update;
      if found then
        v_superseded := true;
        if v_kept then
          update public.payment_disputes
             set credits_clawed_back = credits_clawed_back + v_row.credits_clawed_back,
                 clawback_shortfall = clawback_shortfall + v_row.clawback_shortfall
           where stripe_dispute_id = v_open.stripe_dispute_id;
          update public.payment_disputes set credits_clawed_back = 0, clawback_shortfall = 0
           where stripe_dispute_id = p_dispute_id
          returning * into v_row;
        end if;
      elsif v_kept and not exists (
        select 1 from public.payment_disputes d
         where d.payment_id = v_row.payment_id
           and d.stripe_dispute_id <> p_dispute_id
           and d.closed_status not in ('won', 'warning_closed')
      ) then
        if v_row.credits_clawed_back > 0 then
          v_org := public._payment_credits_org(v_payment);
          if v_org is not null then
            -- 2033: the share was taken from the org pool the purchase went to; it goes back there.
            v_request := public._org_payment_request('payment_clawback_restore:', p_dispute_id);
            perform 1 from public.orgs where id = v_org for no key update;
            if not exists (select 1 from public.org_credit_ledger where request_id = v_request) then
              update public.orgs set pool_credits = pool_credits + v_row.credits_clawed_back, updated_at = now()
               where id = v_org returning pool_credits into v_pool;
              insert into public.org_credit_ledger(org_id, kind, delta, pool_after, member_user_id, request_id, reference, note)
                values (v_org, 'payment_clawback_restore', v_row.credits_clawed_back, v_pool, v_payment.user_id, v_request,
                  'payment:' || v_payment.id, '拒付胜诉还回 ' || p_dispute_id);
            end if;
          elsif (public._apply_credit_change(v_payment.user_id, 'paid', 'clawback_restore', v_row.credits_clawed_back,
                  '拒付胜诉还回 ' || p_dispute_id, v_key)).applied then
            update public.credit_ledger set payment_id = v_payment.id where idempotency_key = v_key;
          end if;
        end if;
        update public.payments
           set credits_clawed_back = greatest(0, credits_clawed_back - v_row.credits_clawed_back),
               clawback_shortfall = greatest(0, clawback_shortfall - v_row.clawback_shortfall),
               status = case
                 when status <> 'disputed' then status
                 when amount_total > 0 and amount_refunded >= amount_total then 'refunded'
                 when amount_refunded > 0 then 'partially_refunded'
                 else 'paid'
               end
         where id = v_payment.id;
        update public.payment_disputes set credits_restored = v_row.credits_clawed_back
         where stripe_dispute_id = p_dispute_id
        returning * into v_row;
        perform public.clawback_payment_credits(v_payment.id, 'dispute_closed:' || p_dispute_id, '退款扣回 ' || p_dispute_id);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'first_close', v_first,
    -- Another dispute on the payment is still open and now decides (the Owner hears when it closes).
    'superseded', v_superseded,
    'kept', v_row.closed_status in ('won', 'warning_closed'),
    'closed_status', v_row.closed_status,
    'credits_restored', v_row.credits_restored,
    'user_id', v_row.user_id,
    'payment_id', v_row.payment_id,
    'product_id', v_payment.product_id,
    'amount', v_row.amount,
    'currency', v_row.currency
  );
end;
$_$;

-- Lock order (review of #981): the org row comes before the profile everywhere. A dispute bans
-- the buyer (profile lock) before it claws back; for an org-pool payment the org row is now
-- locked right after the payment, before the ban.
create or replace function public.open_payment_dispute(p_dispute_id text, p_charge_id text, p_amount integer,
  p_currency text, p_reason text, p_due_by timestamptz, p_managed_default boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.payment_disputes;
  v_payment public.payments;
  v_managed boolean;
  v_profile public.profiles;
  v_claw jsonb;
begin
  if p_dispute_id is null or p_charge_id is null or p_amount is null or p_currency is null
     or p_reason is null or p_managed_default is null then
    raise exception 'INVALID_INPUT' using detail = 'dispute id, charge id, amount, currency, reason and the default are required';
  end if;

  select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
  if found then
    return public._payment_dispute_answer(v_row, false);
  end if;

  -- Locked first: every T71 path locks the payment before the profile (and before other
  -- disputes of it), so a refund and a dispute arriving together cannot deadlock.
  select * into v_payment from public.payments where stripe_charge_id = p_charge_id for update;
  -- 2033: credits that went to an org pool are clawed back from it; its row before the profile.
  if v_payment.id is not null then
    perform 1 from public.orgs where id = public._payment_credits_org(v_payment) for no key update;
  end if;
  v_managed := case
    when v_payment.id is null then p_managed_default
    when v_payment.method = 'cn_card' then false
    when v_payment.method = 'card' then coalesce(
      v_payment.managed_payments,
      (select p.managed_payments from public.payments p
        where p.user_id = v_payment.user_id and p.product_id = v_payment.product_id
          and p.channel = 'stripe' and p.stripe_session_id is not null
          and p.created_at <= v_payment.created_at
        order by p.created_at desc limit 1),
      p_managed_default)
    else p_managed_default
  end;

  insert into public.payment_disputes
    (stripe_dispute_id, stripe_charge_id, payment_id, user_id, amount, currency, reason, responder, due_by)
  values
    (p_dispute_id, p_charge_id, v_payment.id, v_payment.user_id, p_amount, lower(p_currency), p_reason,
     case when v_managed then 'stripe' else 'shotviva' end, p_due_by)
  on conflict (stripe_dispute_id) do nothing
  returning * into v_row;
  if not found then
    -- A concurrent delivery inserted it first; that one bans and claws back.
    select * into v_row from public.payment_disputes where stripe_dispute_id = p_dispute_id;
    return public._payment_dispute_answer(v_row, false);
  end if;

  if v_row.user_id is not null then
    select * into v_profile from public.profiles where id = v_row.user_id for update;
    if found and v_profile.role <> 'admin' and v_profile.banned_at is null then
      perform public.admin_ban_user(v_row.user_id, '拒付');
      update public.payment_disputes set auto_banned_at = now()
       where stripe_dispute_id = p_dispute_id
      returning * into v_row;
    end if;
  end if;

  if v_row.payment_id is not null then
    -- record_payment_issue marks it first; set here too so the clawback asks for everything.
    update public.payments set status = 'disputed' where id = v_row.payment_id and status <> 'disputed';
    v_claw := public.clawback_payment_credits(v_row.payment_id, 'dispute:' || p_dispute_id, '拒付扣回 ' || p_dispute_id);
    update public.payment_disputes
       set credits_clawed_back = (v_claw ->> 'taken')::integer,
           clawback_shortfall = (v_claw ->> 'written_off')::integer
     where stripe_dispute_id = p_dispute_id
    returning * into v_row;
  end if;

  return public._payment_dispute_answer(v_row, true);
end;
$$;

-- Same reason: the org row before the subscription mirror (and the profile purchase_terms locks).
create or replace function admin.checkout_terms(p_v2 boolean, p_user_id uuid, p_product_id text, p_session_id text,
  p_amount_total integer, p_currency text, p_amount_tax integer, p_method text, p_invoice_id text default null,
  p_charge_id text default null, p_subscription_id text default null, p_subscription_status text default null,
  p_current_period_end timestamptz default null, p_cancel_at_period_end boolean default null)
returns public.credit_change
language plpgsql security definer set search_path = '' as $$
declare
  v_change public.credit_change;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0));
  if p_amount_total is null or p_amount_tax is null or p_currency is null or p_method is null then
    raise exception 'INVALID_INPUT' using detail = 'payment fields are all required';
  end if;

  -- 2033: lock the buyer's active org first (purchase_terms takes the same lock again).
  perform public._org_purchase_pool(p_user_id, 'purchase:' || p_session_id);

  if p_subscription_id is not null then
    if p_subscription_status is null or p_current_period_end is null or p_cancel_at_period_end is null then
      raise exception 'INVALID_INPUT' using detail = 'subscription fields are all required';
    end if;
    insert into public.subscriptions
      (stripe_subscription_id, user_id, product_id, status, current_period_end, cancel_at_period_end)
    values
      (p_subscription_id, p_user_id, p_product_id, p_subscription_status, p_current_period_end, p_cancel_at_period_end)
    on conflict (stripe_subscription_id) do update
       set status = excluded.status,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = now()
     where public.subscriptions.user_id = excluded.user_id
       and public.subscriptions.product_id = excluded.product_id;
    if not found then
      raise exception 'IDEMPOTENCY_CONFLICT' using detail = 'subscription belongs to another user or product';
    end if;
  end if;

  v_change := admin.purchase_terms(p_v2, p_user_id, p_product_id, p_session_id);

  if v_change.applied then
    insert into public.payments
      (user_id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id,
       amount_total, amount_tax, currency, method)
    values
      (p_user_id, p_product_id, 'stripe', p_session_id, p_invoice_id, p_charge_id,
       p_amount_total, p_amount_tax, lower(p_currency), p_method);
  end if;

  return v_change;
end;
$$;

-- The month panel counts the purchase clawbacks and their restores (review of #981).
create or replace function public.org_pool_month(p_owner uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $_$
declare
  o public.orgs;
  v_start timestamptz;
  v_end timestamptz;
  v_paid jsonb;
  v_promo jsonb;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  select * into o from public.orgs where owner_user_id = p_owner;
  if not found then raise exception 'NOT_ORG_OWNER'; end if;
  v_start := ((p_period || '-01')::timestamp) at time zone 'UTC';
  v_end := v_start + interval '1 month';
  select jsonb_build_object(
      'balance', o.pool_credits,
      'in', coalesce(sum(l.delta) filter (where l.kind in ('bank_grant', 'owner_deposit')), 0),
      'allocated', coalesce(-sum(l.delta) filter (where l.kind = 'allocate'), 0),
      'reclaimed', coalesce(sum(l.delta) filter (where l.kind = 'reclaim'), 0),
      'adjusted', coalesce(sum(l.delta) filter (where l.kind = 'admin_adjust'), 0),
      -- 2033: taken back for refunds and disputes of purchases that went to the pool, and given
      -- back when a dispute was won.
      'clawed_back', coalesce(-sum(l.delta) filter (where l.kind = 'payment_clawback'), 0),
      'restored', coalesce(sum(l.delta) filter (where l.kind = 'payment_clawback_restore'), 0))
    into v_paid
    from public.org_credit_ledger l where l.org_id = o.id and l.created_at >= v_start and l.created_at < v_end;
  select jsonb_build_object(
      'balance', case when o.promo_expires_at > now() then o.promo_pool_credits else 0 end,
      'expires_at', case when o.promo_expires_at > now() then o.promo_expires_at end,
      'granted', coalesce(sum(l.delta) filter (where l.kind = 'promo_grant' and l.created_at >= v_start and l.created_at < v_end), 0),
      'allocated', coalesce(-sum(l.delta) filter (where l.kind = 'promo_allocate' and l.created_at >= v_start and l.created_at < v_end), 0),
      'reclaimed', coalesce(sum(l.delta) filter (where l.kind = 'promo_reclaim' and l.created_at >= v_start and l.created_at < v_end), 0),
      'expired', coalesce(-sum(l.delta) filter (where l.kind = 'promo_expire' and l.request_id like 'org_promo_expire:' || p_period || ':%'), 0)
        -- Scoped to the org's members (credit_ledger_user_id_created_at_idx), never a ledger-wide scan.
        + coalesce((select -sum(c.delta) from public.org_members om join public.credit_ledger c on c.user_id = om.user_id
                     where om.org_id = o.id and c.created_at >= v_start
                       and c.kind = 'org_promo_expire' and c.idempotency_key like 'org_promo_expire:' || p_period || ':' || o.id::text || ':%'), 0),
      'held', case when o.promo_expires_at > now() then
        coalesce((select sum(least(m.held_promo_credits, p.free_credits)) from public.org_members m join public.profiles p on p.id = m.user_id
                   where m.org_id = o.id and m.status = 'active'), 0) else 0 end)
    into v_promo
    from public.org_credit_ledger l
   where l.org_id = o.id and l.kind like 'promo_%' and l.created_at >= v_start and l.created_at < v_end + interval '8 days';
  return jsonb_build_object('period', p_period, 'paid', v_paid, 'promo', v_promo);
end;
$_$;

-- Owner 2026-11-28: purchases whose credits went to an org pool have no self-service refund.
-- The buyer contacts support; the platform admin handles it by hand (admin clawback, then the
-- refund in Stripe / Waffo), and the refund and dispute webhooks work as for any payment.
-- refund_eligibility keeps its columns (its return type can't change in place); the reason is
-- this separate check, used by the refund request below and shown to the admin.
create function public.payment_refund_block(p_payment_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select case when public._payment_credits_org(p) is not null then 'org_pool_purchase' end
    from public.payments p where p.id = p_payment_id
$$;
revoke all on function public.payment_refund_block(bigint) from public, anon, authenticated;
grant execute on function public.payment_refund_block(bigint) to service_role;

create or replace function public.create_support_ticket(p_user_id uuid, p_type text, p_body text, p_payment_id bigint,
  p_job_id uuid, p_ticket_id uuid default null, p_images jsonb default '[]'::jsonb) returns public.support_tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets;
  v_message_id uuid;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if p_type is null or p_type not in ('feedback', 'image_issue', 'billing', 'refund', 'account', 'other') then
    raise exception 'INVALID_INPUT' using detail = 'unknown ticket type';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be 1 to 2000 characters';
  end if;
  if p_type = 'refund' and p_payment_id is null then
    raise exception 'INVALID_INPUT' using detail = 'a refund request needs a payment';
  end if;
  if p_payment_id is not null and p_type not in ('billing', 'refund') then
    raise exception 'INVALID_INPUT' using detail = 'only billing and refund tickets take a payment';
  end if;
  if p_job_id is not null and p_type <> 'image_issue' then
    raise exception 'INVALID_INPUT' using detail = 'only image issues take a work';
  end if;

  -- Someone else's id reads the same as a missing one, so nothing leaks about other accounts.
  if p_payment_id is not null and not exists (
    select 1 from public.payments p where p.id = p_payment_id and p.user_id = p_user_id
  ) then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  -- 2033 (Owner 2026-11-28): no self-service refund request for an org-pool purchase; a billing
  -- ticket about it is still fine.
  if p_type = 'refund' and public.payment_refund_block(p_payment_id) is not null then
    raise exception 'ORG_POOL_REFUND';
  end if;
  if p_job_id is not null and not exists (
    select 1 from public.generation_jobs j where j.id = p_job_id and j.user_id = p_user_id
  ) then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if (select count(*) from public.support_tickets t
       where t.user_id = p_user_id and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.support_tickets (id, user_id, type, payment_id, job_id)
  values (coalesce(p_ticket_id, gen_random_uuid()), p_user_id, p_type, p_payment_id, p_job_id)
  returning * into v_ticket;

  insert into public.support_ticket_messages (ticket_id, author, body)
  values (v_ticket.id, 'user', btrim(p_body))
  returning id into v_message_id;

  perform public.attach_ticket_images(v_ticket.id, p_user_id, v_message_id, p_images);
  return v_ticket;
end;
$$;
