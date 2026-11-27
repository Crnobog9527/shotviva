-- Enterprise signup bonus after a late signup gift (ARCHITECTURE §6.5). 2010 gives the org's
-- bonus on the ?ref= path only to an account that already got its signup gift, because the gift
-- carries the per-network and per-phone limits. Over the network's allowance (1480,
-- signup_gift_per_ip in 24 hours) an account is 'same_ip_pending': no gift at its first sign-in,
-- but it can claim one later with a verified phone or a Google account (claim_signup_gift). The
-- 2010 trigger runs once, at the binding, saw no gift and recorded 'blocked_no_signup_grant', so a
-- salesperson signing up several customers on one shop's WiFi left the later ones without the
-- bonus for good, even after they claimed the gift.
--
-- Now claim_signup_gift, right after it pays the gift, gives that account the org bonus once:
-- * only an account with that 2010 error row. The trigger checks the gift last, after the org
--   (active, affiliate switch on, account active, amount > 0) and the payment check, so the row
--   proves the binding passed everything else at that moment. Not the org_l1 invite path:
--   redeem_code refuses an account without the gift and never binds it.
-- * still true at the claim: bound the same way ('signup') to an active org account with the
--   switch on and the bonus on, not banned, no payment, not an active member of that org.
-- * the amount set at the binding, from the audit log as admin_org_signup_bonus_backfill reads it
--   (_org_setting_at; never set = 0, then nothing is given).
-- Same record row and ledger key as 2010 (org_signup_bonuses primary key, 'org_signup_bonus:<id>'),
-- so it can never pay twice or pay someone already paid; a repeated claim is 'not_pending' before
-- this runs. The error row is deleted once the bonus is given (the bonus row is the record). A
-- failure here never fails the gift: the bonus is skipped and its error kept on the error row.
--
-- Expand-only: one new private function and a create or replace of claim_signup_gift with the
-- same signature and result (1480's body plus one call). No table or constraint change.

create function public._org_signup_bonus_after_gift(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles; v_org uuid; v_now integer; v_credits integer;
begin
  begin
    if not exists(select from public.org_signup_bonus_errors e where e.user_id=p_user and e.error='blocked_no_signup_grant') then
      return;
    end if;
    -- claim_signup_gift holds this row's lock (as do the trigger and the back-fill).
    select * into p from public.profiles where id=p_user;
    if not found or p.referred_source is distinct from 'signup' or p.banned_at is not null then return; end if;
    select o.id,o.signup_bonus_credits into v_org,v_now from public.affiliates a
      join public.orgs o on o.id=a.org_id
      where a.user_id=p.referred_by and a.status='active' and o.status='active' and o.affiliate_enabled;
    if not found or v_now is null or v_now <= 0 then return; end if;
    if exists(select from public.payments where user_id=p_user) then return; end if;
    if exists(select from public.org_members m where m.org_id=v_org and m.user_id=p_user and m.status='active') then return; end if;
    v_credits := coalesce((public._org_setting_at(v_org,'signup_bonus_credits',p.referred_at,'0'::jsonb)->>'value')::integer,0);
    if v_credits <= 0 then return; end if;
    insert into public.org_signup_bonuses(user_id,org_id,member_user_id,credits)
      values(p_user,v_org,p.referred_member,v_credits) on conflict(user_id) do nothing;
    if not found then return; end if;
    perform public._apply_credit_change(p_user,'free','org_signup_bonus',v_credits,
      'Enterprise invite signup bonus','org_signup_bonus:' || p_user);
    delete from public.org_signup_bonus_errors where user_id=p_user;
  exception when others or query_canceled or assert_failure then
    -- Keep no exception DETAIL/CONTEXT (it can contain a whole row).
    begin
      update public.org_signup_bonus_errors set error=sqlstate || ': ' || left(sqlerrm,300), at=now() where user_id=p_user;
    exception when others or query_canceled or assert_failure then
      return;
    end;
  end;
end;
$$;
revoke all on function public._org_signup_bonus_after_gift(uuid) from public,anon,authenticated,service_role;

-- Same as 1480 except the call after the gift is paid.
create or replace function public.claim_signup_gift(p_user_id uuid, p_method text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_amount integer;
  v_today jsonb;
  v_key record;
  v_enabled boolean := false;
  v_change public.credit_change;
begin
  if p_user_id is null or (p_method is not null and p_method not in ('phone', 'google')) then
    raise exception 'INVALID_INPUT' using detail = 'unknown claim method';
  end if;

  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog', 0));
  perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_gift_cap', 0));
  select * into v_profile from public.profiles where id = p_user_id for update;
  -- Pending: over the allowance since 1480, a 1350 'same_ip', or an older same-IP refusal that
  -- stored nothing (an IP, no reason). Never paid already.
  if not found
     or not (coalesce(v_profile.signup_gift_refusal in ('same_ip_pending', 'same_ip'), false)
             or (v_profile.signup_gift_refusal is null and v_profile.signup_ip is not null))
     or exists (select 1 from public.credit_ledger where idempotency_key = 'signup:' || p_user_id::text) then
    return 'not_pending';
  end if;
  v_amount := public.signup_gift_amount(v_profile.created_at);
  if v_amount = 0 then
    return 'not_pending';
  end if;

  v_today := public.signup_gift_today();
  for v_key in
    select k.method, k.key_hash
      from public.signup_gift_identity_keys(p_user_id) k
     where p_method is null or k.method = p_method
     order by k.method desc  -- phone first
  loop
    if not (v_today->>('claim_' || v_key.method))::boolean then
      continue;
    end if;
    v_enabled := true;
    if exists (select 1 from public.signup_gift_claims c where c.key_hash = v_key.key_hash) then
      continue;
    end if;
    if (v_today->>'paused')::boolean then
      return 'paused';
    end if;
    if (v_today->>'granted')::integer >= (v_today->>'cap')::integer then
      return 'daily_cap';
    end if;

    insert into public.signup_gift_claims (key_hash, method, user_id) values (v_key.key_hash, v_key.method, p_user_id);
    update public.profiles set signup_gift_refusal = null where id = p_user_id;
    v_change := public._apply_credit_change(p_user_id, 'free', 'grant', v_amount, 'signup', 'signup:' || p_user_id::text);
    -- The account's other keys are spent too: one account, one gift, whatever it later links.
    insert into public.signup_gift_claims (key_hash, method, user_id)
    select k.key_hash, k.method, p_user_id from public.signup_gift_identity_keys(p_user_id) k
    on conflict (key_hash) do nothing;
    -- An org ?ref customer the 2010 trigger skipped for want of this gift gets the org bonus now.
    perform public._org_signup_bonus_after_gift(p_user_id);
    return 'granted';
  end loop;

  if not v_enabled then
    -- No enabled method with a key: say which is missing, the switch or the identity.
    if p_method is not null and not (v_today->>('claim_' || p_method))::boolean then
      return 'method_off';
    end if;
    if p_method is null and not (v_today->>'claim_phone')::boolean and not (v_today->>'claim_google')::boolean then
      return 'method_off';
    end if;
    return 'no_identity';
  end if;
  return 'already_used';
end;
$$;
