-- Admin binding of customers who already paid (Owner 2026-11-27, ARCHITECTURE §6.5 后台手动绑定).
-- A channel partner (a personal affiliate or an enterprise's affiliate account) sometimes brings a
-- customer who bought before the binding existed (paid at the counter, signed up without the link).
-- The admin can bind such a customer by hand and, optionally, give the partner the commission on
-- the customer's payments of the last N days.
--
-- 1. admin_affiliate_bind_customer(actor, input): the admin binding with checks admin_affiliate_rebind
--    (0909/1642) never had. It refuses a partner that is not an active affiliate account, a customer
--    who is banned or an active member of the target enterprise (commission would be void as
--    org_member anyway), and binding an account to itself. It writes the same profile fields as the
--    rebind (referred_source 'admin', referred_at now(), referred_member and referred_via cleared:
--    an admin binding is nobody's staff invite, so no colleague's 员工业绩 and no level-2 chain).
--    Binding again to the partner the customer already has changes nothing on the profile (the
--    source and referred_at, which starts the commission_months term, stay), so a second run only
--    does the back-dating below. Back-dating runs only for a new binding or a customer whose
--    binding is already an admin one: a customer the same partner got through a link or an invite
--    code (signup, first_checkout, org_l1, org_l2) is refused AFFILIATE_BACKDATE_NOT_ADMIN.
--
--    Back-dated commissions (backdate_days 1..90, 0 = none): the customer's payments created in the
--    last N days and before the binding (referred_at) that carry no commission at all get one,
--    through the same affiliate_recompute_payment(…, true) a new payment runs, so rates, fees,
--    refunds, disputes, the same_ip hold, the org_member void, the level-2 parent bonus and the
--    hold days (confirm_after = the payment's own created_at + hold_days, as for any payment: the
--    hold is the refund/dispute window of that payment, which has already been running) are exactly
--    the normal ones. _affiliate_snapshot's commission_months test is
--    `payment.created_at <= referred_at + months`, which a payment before the binding always passes,
--    and once a commission row exists every later recompute keeps its owner, rate and confirm_after
--    from the row, so these commissions stay stable. A payment that already has a commission (the
--    previous partner's, or this one's from an earlier run) is skipped: never taken over, never
--    paid twice (commissions are also unique per (payment_id, level)). Payments after the binding
--    get commissions from the payment trigger as usual and are not touched here.
--    The candidate payments are locked before the profile, the order the billing writes use
--    (payment row, then profile), so the binding does not deadlock with a refund.
--
-- 2. _partner_promo_calc (2011): customers an admin bound to the enterprise account count for the
--    channel partner promotion bonus too, but only their payments made at or after the binding
--    (payment.created_at >= referred_at); back-dated commissions earn the partner the commission,
--    not promotion credits. The same date test now applies to every counted source (org_l1,
--    signup, first_checkout): their normal commissions come from payments after the binding, so
--    2011's counts are unchanged, and no back-dated payment can count whatever the source. Nothing else changes (one sheet per org and month, idempotency key
--    partner_promo:<grant id>, a payment a granted sheet of another month counted is never counted
--    again). On 2026-11-27 production had no customer with referred_source 'admin', so there is no
--    earlier admin binding that could start counting retroactively and no cut-off date is needed.
--
-- No enterprise signup bonus: both bonus triggers (1690 org_l1, 2010 signup) fire only when
-- referred_source changes to org_l1 / signup from an empty binding, the after-gift path (2023) and
-- the back-fill (admin_org_signup_bonus_backfill) only for 'signup'; 'admin' matches none.
--
-- Expand-only: one new function (service_role only) and a create or replace of an internal
-- function with the same signature. Code running before the deploy never calls the new function.

create or replace function public.admin_affiliate_bind_customer(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid; v_owner uuid; v_reason text := nullif(trim(p_input->>'reason'), ''); v_days integer;
  v_profile public.profiles; v_account public.affiliates; v_changed boolean; v_bound_at timestamptz;
  v_payment bigint; v_created integer := 0; v_already integer := 0; v_taken integer := 0; v_missed integer := 0;
begin
  perform public._affiliate_require_admin(p_actor);
  if p_input is null or jsonb_typeof(p_input) <> 'object' or v_reason is null or length(v_reason) > 2000
     or coalesce(p_input->>'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_input->>'affiliate_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_input->>'backdate_days', '0') !~ '^[0-9]{1,2}$' then
    raise exception 'INVALID_INPUT';
  end if;
  v_user := (p_input->>'user_id')::uuid;
  v_owner := (p_input->>'affiliate_user_id')::uuid;
  v_days := coalesce(p_input->>'backdate_days', '0')::integer;
  if v_days > 90 or v_user = v_owner then raise exception 'INVALID_INPUT'; end if;
  if v_days > 0 and not (select s.enabled from public.affiliate_settings s where s.singleton) then
    raise exception 'AFFILIATE_PROGRAM_OFF';
  end if;

  -- Payment rows first, then the profile: the order billing writes take them.
  if v_days > 0 then
    perform 1 from public.payments p where p.user_id = v_user and p.created_at >= now() - make_interval(days => v_days)
      order by p.id for update;
  end if;
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_profile.banned_at is not null then raise exception 'USER_BANNED'; end if;
  select * into v_account from public.affiliates where user_id = v_owner;
  if not found or v_account.status <> 'active' then raise exception 'AFFILIATE_NOT_ACTIVE'; end if;
  if v_account.org_id is not null and exists(select from public.org_members m
       where m.org_id = v_account.org_id and m.user_id = v_user and m.status = 'active') then
    raise exception 'AFFILIATE_ORG_MEMBER';
  end if;

  v_changed := v_profile.referred_by is distinct from v_owner;
  if v_changed then
    update public.profiles set referred_by = v_owner, referred_source = 'admin', referred_at = now(),
      referred_member = null, referred_via = null where id = v_user;
    v_bound_at := now();
  else
    -- Already this partner's customer: keep how and when (the commission term runs from referred_at).
    -- Back-dating only extends an admin binding; a customer this partner got through a link or an
    -- invite code is not back-dated (its pre-binding payments were never this partner's sale).
    if v_days > 0 and v_profile.referred_source is distinct from 'admin' then
      raise exception 'AFFILIATE_BACKDATE_NOT_ADMIN';
    end if;
    v_bound_at := coalesce(v_profile.referred_at, now());
  end if;

  if v_days > 0 then
    for v_payment in select p.id from public.payments p
       where p.user_id = v_user and p.created_at >= now() - make_interval(days => v_days)
         and p.created_at < v_bound_at and p.amount_total > 0 and p.currency = 'usd'
       order by p.id loop
      if exists(select from public.affiliate_commissions c where c.payment_id = v_payment and c.level = 1 and c.affiliate_user_id = v_owner) then
        v_already := v_already + 1;
      elsif exists(select from public.affiliate_commissions c where c.payment_id = v_payment) then
        v_taken := v_taken + 1;
      else
        perform public.affiliate_recompute_payment(v_payment, true);
        if exists(select from public.affiliate_commissions c where c.payment_id = v_payment and c.level = 1 and c.affiliate_user_id = v_owner) then
          v_created := v_created + 1;
        else
          v_missed := v_missed + 1;
        end if;
      end if;
    end loop;
  end if;

  perform public._affiliate_audit(p_actor, 'rebind', v_user::text,
    concat(coalesce(v_profile.referred_by::text, '∅'), ' → ', v_owner::text,
      case when v_changed then '' else ' (unchanged)' end,
      case when v_days > 0 then concat(' backdate ', v_days, 'd: created ', v_created, ', already ', v_already,
        ', other partner ', v_taken, ', failed ', v_missed) else '' end,
      ' ', v_reason));
  return jsonb_build_object('changed', v_changed, 'previous', v_profile.referred_by, 'bound_at', v_bound_at,
    'backdate_days', v_days, 'created', v_created, 'already', v_already, 'other_partner', v_taken, 'failed', v_missed);
end;
$$;
revoke all on function public.admin_affiliate_bind_customer(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_affiliate_bind_customer(uuid, jsonb) to service_role;

-- 2011's sheet, plus admin-bound customers; every counted payment is made at or after its customer's binding.
create or replace function public._partner_promo_calc(p_org uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month date;
  v_start timestamptz;
  v_end timestamptz;
  v_recipient uuid;
  v_account uuid;
  v_rules jsonb := public._partner_promo_rules();
  v_lines jsonb;
  v_bonus jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_owed integer := 0;
  v_gross integer;
  v_left integer;
  v_take integer;
  o record;
  v_result jsonb;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_INPUT'; end if;
  v_month := (p_period || '-01')::date;
  v_start := (v_month - interval '1 month')::timestamp at time zone 'UTC';
  v_end := v_month::timestamp at time zone 'UTC';
  select owner_user_id into v_recipient from public.orgs where id = p_org;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  select a.user_id into v_account from public.affiliates a where a.org_id = p_org;

  select coalesce(jsonb_agg(jsonb_build_object('payment_id', x.payment_id, 'customer', x.customer, 'credits', x.credits,
                                               'confirmed_at', x.confirmed_at) order by x.payment_id), '[]'::jsonb)
    into v_lines
    from (
      select c.payment_id, p.user_id as customer, public._partner_promo_payment_credits(p) as credits, c.confirmed_at
        from public.affiliate_commissions c
        join public.payments p on p.id = c.payment_id
        join public.profiles cu on cu.id = p.user_id
       where v_account is not null and c.affiliate_user_id = v_account and c.level = 1 and c.status = 'confirmed'
         and c.confirmed_at >= v_start and c.confirmed_at < v_end
         and cu.referred_by = v_account
         and cu.referred_source in ('org_l1', 'signup', 'first_checkout', 'admin')
         and p.created_at >= cu.referred_at
         and not exists(select from public.partner_promo_grant_lines l join public.partner_promo_grants g on g.id = l.grant_id
                         where l.payment_id = c.payment_id and g.status = 'granted' and g.period <> p_period)
    ) x
   where x.credits > 0;
  v_bonus := public._partner_promo_bonus(v_lines);

  v_gross := (v_rules->>'base')::integer + (v_bonus->>'bonus')::integer;
  v_left := v_gross;
  for o in select * from public._partner_promo_owed(p_org, p_period) where owed > 0 loop
    v_take := least(o.owed, v_left);
    v_left := v_left - v_take;
    v_owed := v_owed + o.owed;
    v_sources := v_sources || jsonb_build_array(jsonb_build_object('grant_id', o.grant_id, 'period', o.period,
                                                                   'owed', o.owed, 'applied', v_take));
  end loop;

  v_result := jsonb_build_object(
    'org_id', p_org, 'period', p_period, 'recipient', v_recipient,
    'window_start', v_start, 'window_end', v_end,
    'expires_at', (v_month + interval '1 month')::timestamp at time zone 'UTC',
    'base', (v_rules->>'base')::integer, 'bonus_bp', (v_rules->>'bonus_bp')::integer,
    'customer_cap_bp', (v_rules->>'customer_cap_bp')::integer,
    'bonus', (v_bonus->>'bonus')::integer, 'raw', (v_bonus->>'raw')::bigint, 'counted', (v_bonus->>'counted')::bigint,
    'cap', (v_bonus->>'cap')::bigint, 'customers', (v_bonus->>'customers')::integer,
    'capped_customers', (v_bonus->>'capped_customers')::integer, 'min_customers', (v_bonus->>'min_customers')::integer,
    'per', v_bonus->'per', 'lines', v_lines, 'sources', v_sources,
    'clawback_owed', v_owed, 'clawback_applied', v_gross - v_left, 'total', v_left);
  return v_result || jsonb_build_object('fingerprint', md5(v_result::text));
end;
$$;
revoke all on function public._partner_promo_calc(uuid, text) from public, anon, authenticated, service_role;
