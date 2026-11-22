-- Change an enterprise org's primary admin (主管理员, org_members.role = 'owner'; ARCHITECTURE §6.5).
-- Owner 2026-11-22: everything the org earned belongs to the org, never to whoever is its owner.
--
-- What is keyed to the owner's user_id today, and what this does with it:
-- * The org's enterprise affiliate account IS the owner's own affiliates row (PK user_id, org_id
--   set; 1640/1643). Commissions, payouts, adjustments, click days and rate overrides reference it
--   by affiliate_user_id / user_id, and the org's customers by profiles.referred_by. None of those
--   foreign keys cascade on update, and a removed ex-owner deleting their account would cascade-
--   delete the org's whole channel. So the row moves: it is copied to the new owner with every
--   column kept (slug = referral link, status, payout method and details, notes, approval), every
--   referencing row is re-pointed, and the old row is deleted, all in this one transaction.
--   Commission recompute (refunds, disputes) reads the stored affiliate_user_id, so moved rows
--   keep working; amounts, statuses, flags, holds and payout history are not touched.
-- * Everything else is resolved at read time from orgs.owner_user_id or keyed by org_id already:
--   pool, ledger, members' allowances and held credits, invite token, ref code, member invite
--   codes (redeem_code routes them to the org's current account), org_member_stats /
--   org_customer_counts / org_member_customers, payment accounts, promo sheets (the next run
--   writes the new recipient). referred_member keeps naming the person whose link brought a
--   customer (the old owner's own performance stays in the org's member stats).
-- * Not moved: the old owner's personal credits, purchases and personal invite code; promo
--   credits already granted into the old owner's own free pool before the org promo pool existed
--   (their rows keep recipient_user_id = the old owner, who still holds them).
--
-- Rules: the new owner is an unbanned account that is either an active member of this org or in
-- no org at all and owner of none. If the org has an affiliate account, the new owner must have no
-- affiliates row of their own (it would collide with the moved row and mix personal history into
-- the org's): ORG_NEW_OWNER_AFFILIATE. Without one, an open personal affiliate account is refused
-- as everywhere else (ORG_PERSONAL_AFFILIATE, 1642). The old owner stays an active member with
-- their allowance and held credits; the admin can remove them with the existing flow. Works on a
-- suspended org too (it is a correction). One owner per org: the old owner row is demoted in the
-- same statement sequence that promotes the new one.
--
-- Locks, and why the transfer can never be part of a deadlock: it waits only for the org row
-- (FOR UPDATE: owner_user_id is a unique key), its first lock, while it holds nothing. Every later lock is NOWAIT, so
-- once it holds anything it never waits for anyone; a row someone else holds makes it fail at
-- once with ORG_BUSY (a payment, refund, binding, invite, settlement or admin action is writing
-- for the org right now; the admin tries again a moment later). In order: the org's affiliates
-- row FOR UPDATE (after it, no new commission, payout, adjustment, click or customer binding can
-- reference the account: their foreign key or KEY SHARE waits for this transfer to end), then
-- the two owners' and every bound customer's profiles in id order, the two member rows, and
-- every row that references the account (commissions, payouts, adjustments, click days, rate
-- overrides, child accounts, unresolved retry errors), KEY SHARE on the profiles its new rows
-- reference (the admin, the account's approver), and the template floor budget's advisory lock
-- (its statement trigger on affiliates), tried once. The writes after that touch only rows
-- already held; key columns (payouts' unique key, click days' and rate overrides' primary keys,
-- the org's owner) are locked FOR UPDATE up front so no update upgrades a lock. Paths that meet the transfer wait for its commit and then see the new owner
-- (bindings re-resolve, case 6; a payment's stale snapshot is remapped on retry, case 3).
--
-- Commission snapshots that still name the old account. affiliate_recompute_payment stores a
-- failed payment's snapshot in affiliate_recompute_errors and reuses it on every retry (the daily
-- run, an admin retry). A user id alone cannot tell an org account from a later personal account
-- of the same person (allowed once they leave the org, 1642), so from now on a snapshot carries
-- the account's org: _affiliate_snapshot adds 'org' (affiliates.org_id, null for a personal
-- account). Every case that can name the old owner:
--   1. commission rows written before the transfer: moved row by row (recompute reads the row);
--   2. unresolved errors stored before the transfer that belong to this org's account (no 'org'
--      key, a null 'org', or this org): the transfer rewrites owner and parent from the old to
--      the new owner. At that moment the old owner's only row is the org's, and history from the
--      personal era of a converted row (1643) is the org's too (Owner 2026-11-22, option A). A
--      snapshot naming another org keeps its owner; the remap below sends it to that org;
--   3. a payment racing the transfer (snapshot read before the commit, insert fails the foreign
--      key after it, error stored with the stale snapshot): it carries 'org', and every retry
--      replaces its owner with that org's current account (_affiliate_snapshot_remap);
--   4. payments of the former owner's later personal account: 'org' is null, never remapped;
--   5. the former owner owning another org later, or the org moving again or back: 'org' names
--      the right org, and the remap reads its current account.
-- Snapshots without 'org' were stored before this migration, before any transfer was possible:
-- case 2 covers them.
--   6. a binding racing the transfer (affiliate_bind by slug, _org_attribute_invite by org):
--      both now lock the resolved account FOR KEY SHARE and, if it was moved away meanwhile,
--      resolve once more, so the customer is bound to the new owner instead of failing the
--      foreign key and staying unbound.
--
-- Expand-only: one new helper, the new admin function, a widened audit-action check (read from
-- the live constraint, as 1840 did, so other open migrations' actions are kept), and create or
-- replace of four functions with their signatures: _affiliate_snapshot identical to 1900 plus the
-- 'org' key (an extra key every reader ignores), affiliate_recompute_payment identical to 1740 plus
-- one line (the remap; a no-op for a snapshot without 'org' or whose org account is the owner),
-- affiliate_bind identical to 0904 and _org_attribute_invite identical to 1680 plus the lock and
-- one re-resolution (no-ops while no transfer runs).

-- Same as 1900 except the 'org' key.
create or replace function public._affiliate_snapshot(p_payment public.payments) returns jsonb
language sql stable security definer set search_path='' set "TimeZone" to 'UTC' as $$
  select jsonb_build_object('owner',a.user_id,'org',a.org_id,'inactive',a.status<>'active',
    'parent',case when a.status='active' and parent.team_enabled and parent.status='active' then parent.user_id end,
    'rate',case when customer.referred_source='org_l2' then coalesce(o.l2_bp,r.org_l2_bp) else coalesce(o.l1_bp,r.l1_bp) end,
    'bonus',coalesce(po.l2_bp,r.l2_bp),
    'same_ip',coalesce(customer.referred_source not in ('org_l1','org_l2'),true) and coalesce(customer.signup_ip=referrer.signup_ip,false),
    'confirm_after',p_payment.created_at+make_interval(days=>s.hold_days),
    'void',case when a.org_id is not null and exists(select from public.org_members m
      where m.org_id=a.org_id and m.user_id=customer.id and m.status='active') then 'org_member' end)
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

-- A retried org snapshot earns the org's current account; anything else is returned unchanged
-- (no 'org', a personal account's null 'org', or an org without an account row).
create function public._affiliate_snapshot_remap(p_snapshot jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p_snapshot || jsonb_build_object('owner', a.user_id)
      from public.affiliates a
     where jsonb_typeof(p_snapshot->'org') = 'string' and a.org_id = (p_snapshot->>'org')::uuid), p_snapshot);
$$;
revoke all on function public._affiliate_snapshot_remap(jsonb) from public, anon, authenticated, service_role;

-- Same as 0904 except the lock on the resolved account and one re-resolution (case 6).
create or replace function public.affiliate_bind(p_user uuid,p_slug text,p_source text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  if p_source not in ('signup','first_checkout') or p_source is null then return false; end if;
  if not (select enabled from public.affiliate_settings where singleton) then return false; end if;
  select user_id into v_owner from public.affiliates where slug=p_slug and status='active' and user_id<>p_user;
  if not found then return false; end if;
  -- An org owner transfer (1930) holds this row and then moves it to another user id: wait for
  -- it and resolve the slug once more.
  perform 1 from public.affiliates where user_id=v_owner for key share;
  if not found then
    select user_id into v_owner from public.affiliates where slug=p_slug and status='active' and user_id<>p_user;
    if not found then return false; end if;
  end if;
  -- Billing already takes the profile row lock in settle_checkout. Lock before observing payment history.
  perform 1 from public.profiles where id=p_user and referred_by is null for update;
  if not found then return false; end if;
  if p_source='first_checkout' and exists(select from public.payments where user_id=p_user) then return false; end if;
  update public.profiles set referred_by=v_owner,referred_at=now(),referred_source=p_source where id=p_user and referred_by is null;
  return found;
end;
$$;

-- Same as 1680 except the lock on the resolved account and one re-resolution (case 6).
create or replace function public._org_attribute_invite() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_account uuid; v_member uuid; v_via uuid; v_source text; v_try integer;
begin
  begin
    for v_try in 1..2 loop
      select o.id,a.user_id into v_org,v_account from public.org_members m
        join public.orgs o on o.id=m.org_id
        join public.affiliates a on a.org_id=o.id
        where m.user_id=new.inviter_user_id and m.status='active' and o.status='active' and o.affiliate_enabled
          and a.status='active';
      if found then
        v_source:='org_l1'; v_member:=new.inviter_user_id; v_via:=null;
      else
        select o.id,a.user_id,inviter.referred_member into v_org,v_account,v_member from public.profiles inviter
          join public.affiliates a on a.user_id=inviter.referred_by and a.org_id is not null
          join public.orgs o on o.id=a.org_id
          where inviter.id=new.inviter_user_id and inviter.referred_source='org_l1'
            and o.status='active' and o.affiliate_enabled and o.affiliate_levels=2 and a.status='active';
        if not found then return null; end if;
        v_source:='org_l2'; v_via:=new.inviter_user_id;
      end if;
      -- An org owner transfer (1930) holds the account row and then moves it to another user id:
      -- wait for it and resolve once more.
      perform 1 from public.affiliates where user_id=v_account for key share;
      exit when found;
      if v_try=2 then return null; end if;
    end loop;
    if v_account=new.user_id then return null; end if;
    if exists(select from public.org_members m where m.org_id=v_org and m.user_id=new.user_id and m.status='active') then
      return null;
    end if;
    update public.profiles set referred_by=v_account,referred_at=now(),referred_source=v_source,
      referred_member=v_member,referred_via=v_via
      where id=new.user_id and referred_by is null;
  exception when others or query_canceled or assert_failure then
    -- Keep no exception DETAIL/CONTEXT (it can contain a whole row).
    begin
      insert into public.org_attribution_errors(redemption_id,error)
        values(new.id,sqlstate || ': ' || left(sqlerrm,300)) on conflict(redemption_id) do nothing;
    exception when others or query_canceled or assert_failure then
      -- Even an unavailable error sink must never undo a successful redemption.
      return null;
    end;
  end;
  return null;
end;
$$;

-- Same as 1740 except the remap of a retried snapshot (the line after the payment lock).
create or replace function public.affiliate_recompute_payment(p_payment_id bigint,p_new_payment boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare
  v_payment public.payments; v_enabled boolean; v_open boolean; v_lost boolean; v_snapshot jsonb;
  v_exists boolean; v_retry boolean; v_missing boolean;
begin
  if p_payment_id is null then return; end if;
  select enabled into strict v_enabled from public.affiliate_settings where singleton;
  if p_new_payment and not v_enabled then return; end if;
  select exists(select from public.affiliate_commissions c where c.payment_id=p_payment_id) into v_exists;
  select e.snapshot into v_snapshot from public.affiliate_recompute_errors e where e.payment_id=p_payment_id and e.resolved_at is null;
  v_retry:=found;
  if not (v_exists or v_retry or (p_new_payment and v_enabled)) then return; end if;
  -- Serializes manual/cron retries with the existing billing transaction on this payment.
  select p.* into strict v_payment from public.payments p where p.id=p_payment_id for update;
  if v_payment.amount_total=0 then return; end if;
  if v_retry then v_snapshot:=public._affiliate_snapshot_remap(v_snapshot); end if;
  if not v_exists and v_snapshot is null then v_snapshot:=public._affiliate_snapshot(v_payment); end if;
  if not v_exists and v_snapshot is null then
    if v_retry then update public.affiliate_recompute_errors set resolved_at=now() where payment_id=p_payment_id and resolved_at is null; end if;
    return;
  end if;
  if v_payment.currency <> 'usd' then raise exception 'AFFILIATE_NON_USD_PAYMENT'; end if;
  select is_open,is_lost into strict v_open,v_lost from public._affiliate_dispute_state(v_payment);
  perform public._affiliate_write_commission(v_payment,v_snapshot,1::smallint,v_open,v_lost);
  perform public._affiliate_write_commission(v_payment,v_snapshot,2::smallint,v_open,v_lost);
  update public.affiliate_recompute_errors set resolved_at=now() where payment_id=p_payment_id and resolved_at is null;
  v_missing:=public._affiliate_fee_missing(v_payment);
  if v_missing and exists(select from public.affiliate_commissions c where c.payment_id=p_payment_id and c.status='confirmed') then
    perform public._affiliate_fee_alert_open(v_payment);
  elsif not v_missing then
    update public.affiliate_fee_alerts set resolved_at=now() where payment_id=p_payment_id and resolved_at is null;
  end if;
exception when others or query_canceled or assert_failure then
  -- Retain no sensitive exception DETAIL/CONTEXT (it can contain an entire failed row).
  begin
    insert into public.affiliate_recompute_errors(payment_id,error,snapshot)
      values(p_payment_id,sqlstate || ': ' || left(sqlerrm,300),v_snapshot)
      on conflict(payment_id) where resolved_at is null do update set error=excluded.error,
        snapshot=coalesce(affiliate_recompute_errors.snapshot,excluded.snapshot);
  exception when others or query_canceled or assert_failure then
    -- Even an unavailable error sink must never undo a successful payment/credit write.
    return;
  end;
end;
$$;

do $$
declare
  v_actions text[];
begin
  select array_agg(m[1] order by ord) into v_actions
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.admin_audit_log'::regclass and c.conname = 'admin_audit_log_action_check';
  if v_actions is null or cardinality(v_actions) < 10 then
    raise exception 'admin_audit_log_action_check not found or unreadable';
  end if;
  if not 'org_transfer_owner' = any(v_actions) then v_actions := array_append(v_actions, 'org_transfer_owner'); end if;
  execute 'alter table public.admin_audit_log drop constraint admin_audit_log_action_check';
  execute 'alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in ('
    || (select string_agg(quote_literal(a), ',' order by o) from unnest(v_actions) with ordinality u(a, o)) || '))';
end;
$$;

-- p_input: {org_id, user_id (the new owner), expected_updated_at (orgs.updated_at the form saw)}.
-- Returns {applied: false} when user_id already owns the org (a repeat; nothing written, no audit
-- row, checked before the stale-form guard so a double click is harmless), else {applied: true,
-- updated_at, previous_owner, affiliate: null | {commissions, payouts, adjustments, customers}}.
create or replace function public.admin_org_transfer_owner(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_org_id uuid;
  v_new uuid;
  v_expected timestamptz;
  v_account uuid;
  v_errors bigint[] := '{}';
  v_old uuid;
  o public.orgs;
  v_banned timestamptz;
  v_found boolean;
  v_current uuid;
  a public.affiliates;
  n_comm bigint; n_pay bigint; n_adj bigint; n_cust bigint;
  v_moved jsonb := null;
begin
  perform public._org_require_admin(p_actor);
  if p_input is null or jsonb_typeof(p_input) <> 'object'
     or coalesce(lower(p_input->>'org_id'), '') !~ v_uuid
     or coalesce(lower(p_input->>'user_id'), '') !~ v_uuid
     or jsonb_typeof(p_input->'expected_updated_at') is distinct from 'string' then
    raise exception 'INVALID_INPUT';
  end if;
  begin
    v_expected := (p_input->>'expected_updated_at')::timestamptz;
  exception when others then
    raise exception 'INVALID_INPUT';
  end;
  v_org_id := (p_input->>'org_id')::uuid;
  v_new := (p_input->>'user_id')::uuid;

  -- FOR UPDATE, not NO KEY UPDATE: owner_user_id is a unique key (orgs_owner_user_id_key), so the
  -- update below needs it, and taking it now (holding nothing yet) keeps that update from waiting.
  select * into o from public.orgs where id = v_org_id for update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if o.owner_user_id = v_new then return jsonb_build_object('applied', false); end if;
  if v_expected is distinct from o.updated_at then raise exception 'ORG_CHANGED'; end if;
  v_old := o.owner_user_id;

  -- Every other lock is taken NOWAIT (see the header): busy means a payment, refund, binding or
  -- settlement is writing for this org right now, and the admin simply tries again.
  begin
    select * into a from public.affiliates where org_id = o.id for update nowait;
    v_account := case when found then a.user_id end;
    perform 1 from public.profiles
     where id in (select v_old union all select v_new union all
                  select c.id from public.profiles c where v_account is not null and c.referred_by = v_account)
     order by id for no key update nowait;
    perform 1 from public.org_members where org_id = o.id and user_id in (v_old, v_new) order by user_id for no key update nowait;
    -- Rows the writes reference through a foreign key: the admin (audit log) and the account's
    -- approver (the copied row).
    perform 1 from public.profiles where id in (p_actor, a.approved_by) order by id for key share nowait;
    -- The affiliates statement trigger refreshes the template floor budget under this lock.
    if v_account is not null and not pg_try_advisory_xact_lock(hashtextextended('shotviva.template_floor_budget_cache', 0)) then
      raise exception using errcode = 'lock_not_available';
    end if;
    if v_account is not null then
      perform 1 from public.affiliate_commissions where affiliate_user_id = v_account order by id for no key update nowait;
      -- (affiliate_user_id, period) is a unique key: the update needs FOR UPDATE.
      perform 1 from public.affiliate_payouts where affiliate_user_id = v_account order by id for update nowait;
      perform 1 from public.affiliate_adjustments where affiliate_user_id = v_account order by id for no key update nowait;
      perform 1 from public.affiliate_click_days where affiliate_user_id = v_account order by day for update nowait;
      perform 1 from public.affiliate_rate_overrides where user_id = v_account order by product_kind for update nowait;
      perform 1 from public.affiliates where parent_user_id = v_account order by user_id for no key update nowait;
      -- Only these rows are rewritten below; one committed later carries 'org' (case 3).
      select coalesce(array_agg(id order by id), '{}') into v_errors from (
        select e.id from public.affiliate_recompute_errors e where e.resolved_at is null
          and (e.snapshot->>'owner' = v_account::text or e.snapshot->>'parent' = v_account::text)
          and (jsonb_typeof(e.snapshot->'org') is distinct from 'string' or e.snapshot->>'org' = o.id::text)
         order by e.id for no key update nowait) x;
    end if;
  exception when lock_not_available then
    raise exception 'ORG_BUSY';
  end;
  select true, banned_at into v_found, v_banned from public.profiles where id = v_new;
  if v_found is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_banned is not null then raise exception 'USER_BANNED'; end if;
  select org_id into v_current from public.org_members where user_id = v_new and status = 'active';
  if (v_current is not null and v_current <> o.id) or exists(select from public.orgs where owner_user_id = v_new) then
    raise exception 'ORG_MEMBER_EXISTS';
  end if;

  if v_account is not null then
    -- The org's account is always its owner's row (1640/1643); refuse rather than move anything
    -- of someone else's if that ever stops being true.
    if a.user_id <> v_old then raise exception 'ORG_AFFILIATE_MISMATCH'; end if;
    if exists(select from public.affiliates where user_id = v_new) then raise exception 'ORG_NEW_OWNER_AFFILIATE'; end if;
    -- Free the unique slug and org_id on the old row, insert the copy under the new owner, re-point
    -- every reference, then drop the old row (nothing references it any more, so nothing cascades).
    update public.affiliates set slug = 'mv-' || substr(md5(gen_random_uuid()::text), 1, 20), org_id = null
      where user_id = a.user_id;
    a.user_id := v_new;
    insert into public.affiliates select (a).*;
    update public.affiliate_commissions set affiliate_user_id = v_new where affiliate_user_id = v_old;
    get diagnostics n_comm = row_count;
    update public.affiliate_payouts set affiliate_user_id = v_new where affiliate_user_id = v_old;
    get diagnostics n_pay = row_count;
    update public.affiliate_adjustments set affiliate_user_id = v_new where affiliate_user_id = v_old;
    get diagnostics n_adj = row_count;
    update public.affiliate_click_days set affiliate_user_id = v_new where affiliate_user_id = v_old;
    update public.affiliate_rate_overrides set user_id = v_new where user_id = v_old;
    update public.affiliates set parent_user_id = v_new where parent_user_id = v_old;
    update public.profiles set referred_by = v_new where referred_by = v_old;
    get diagnostics n_cust = row_count;
    delete from public.affiliates where user_id = v_old;
    -- Unresolved retries stored before now named the moved row as it was: the org's account
    -- (case 2 above).
    update public.affiliate_recompute_errors set snapshot = snapshot
        || case when snapshot->>'owner' = v_old::text then jsonb_build_object('owner', v_new) else '{}'::jsonb end
        || case when snapshot->>'parent' = v_old::text then jsonb_build_object('parent', v_new) else '{}'::jsonb end
      where id = any(v_errors);
    v_moved := jsonb_build_object('commissions', n_comm, 'payouts', n_pay, 'adjustments', n_adj, 'customers', n_cust);
  elsif public._affiliate_personal_open(v_new) then
    raise exception 'ORG_PERSONAL_AFFILIATE';
  end if;

  update public.org_members set role = 'member' where org_id = o.id and user_id = v_old and role = 'owner';
  -- An active member keeps their allowance and held credits; a removed or new one starts clean,
  -- as admin_org_add_member does.
  insert into public.org_members(org_id, user_id, role) values (o.id, v_new, 'owner')
    on conflict (org_id, user_id) do update set role = 'owner',
      monthly_allowance = case when public.org_members.status = 'active' then public.org_members.monthly_allowance else 0 end,
      held_credits = case when public.org_members.status = 'active' then public.org_members.held_credits else 0 end,
      joined_at = case when public.org_members.status = 'active' then public.org_members.joined_at else now() end,
      status = 'active', removed_at = null;
  update public.orgs set owner_user_id = v_new, updated_at = now() where id = o.id returning * into o;

  perform public._org_audit(p_actor, 'org_transfer_owner', o.id::text,
    jsonb_build_object('from', v_old, 'to', v_new, 'affiliate', v_moved)::text);
  return jsonb_build_object('applied', true, 'updated_at', o.updated_at, 'previous_owner', v_old, 'affiliate', v_moved);
end;
$$;
revoke all on function public.admin_org_transfer_owner(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_transfer_owner(uuid, jsonb) to service_role;
