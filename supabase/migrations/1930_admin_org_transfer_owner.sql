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
-- Lock order: org row (FOR NO KEY UPDATE) -> both profiles in id order (FOR NO KEY UPDATE) -> the
-- org's affiliates row (FOR UPDATE), the order of admin_org_add_member and 1642.
--
-- Commission snapshots that still name the old account. affiliate_recompute_payment stores a
-- failed payment's snapshot in affiliate_recompute_errors and reuses it on every retry (the daily
-- run, an admin retry). Two ways one can name the moved-away account: an unresolved error from
-- before the transfer, and a payment written while the transfer runs (its snapshot read the old
-- referred_by, its commission insert then waits on the affiliates row lock and fails the foreign
-- key once the old row is gone; the recompute catches that and stores the stale snapshot, the
-- payment itself succeeds). Each move is recorded in affiliate_account_moves; a snapshot's owner
-- or parent with no affiliates row any more is resolved to the account its org has now
-- (_affiliate_snapshot_remap), in the transfer for existing errors and in every retry for the
-- racing ones. So the org still earns those commissions, on the new owner's account.
--
-- Expand-only: one new private table, two new helpers, the new admin function, a widened
-- audit-action check (read from the live constraint, as 1840 did, so other open migrations'
-- actions are kept), and create or replace of affiliate_recompute_payment identical to 1740
-- except one line (the remap of a retried snapshot; a no-op for every snapshot whose accounts
-- still exist, i.e. everything before this deploy).

create table public.affiliate_account_moves (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  from_user_id uuid not null,
  to_user_id uuid not null,
  moved_at timestamptz not null default now(),
  actor uuid not null
);
create index affiliate_account_moves_from_idx on public.affiliate_account_moves(from_user_id, id);
alter table public.affiliate_account_moves enable row level security;
revoke all on public.affiliate_account_moves from public, anon, authenticated, service_role;
grant select on public.affiliate_account_moves to service_role;

-- The account a snapshot's user id stands for now: itself while it has an affiliates row, else
-- the current account of the org it was last moved out of, else itself (nothing to remap).
create function public._affiliate_current_account(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p_user is null then null
    when exists(select from public.affiliates a where a.user_id = p_user) then p_user
    else coalesce((select a.user_id from public.affiliate_account_moves m join public.affiliates a on a.org_id = m.org_id
                    where m.from_user_id = p_user order by m.id desc limit 1), p_user) end;
$$;
revoke all on function public._affiliate_current_account(uuid) from public, anon, authenticated, service_role;

create function public._affiliate_snapshot_remap(p_snapshot jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_snapshot is null then null else p_snapshot || jsonb_strip_nulls(jsonb_build_object(
    'owner', public._affiliate_current_account((p_snapshot->>'owner')::uuid),
    'parent', public._affiliate_current_account((p_snapshot->>'parent')::uuid))) end;
$$;
revoke all on function public._affiliate_snapshot_remap(jsonb) from public, anon, authenticated, service_role;

-- Same as 1740 except the remap of a retried snapshot (the line after v_retry).
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
  v_snapshot:=public._affiliate_snapshot_remap(v_snapshot);
  if not (v_exists or v_retry or (p_new_payment and v_enabled)) then return; end if;
  -- Serializes manual/cron retries with the existing billing transaction on this payment.
  select p.* into strict v_payment from public.payments p where p.id=p_payment_id for update;
  if v_payment.amount_total=0 then return; end if;
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
  v_old uuid;
  o public.orgs;
  v_banned timestamptz;
  v_found boolean;
  v_current uuid;
  a public.affiliates;
  v_slug text;
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
  v_org_id := (p_input->>'org_id')::uuid;
  v_new := (p_input->>'user_id')::uuid;

  select * into o from public.orgs where id = v_org_id for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if o.owner_user_id = v_new then return jsonb_build_object('applied', false); end if;
  if (p_input->>'expected_updated_at')::timestamptz is distinct from o.updated_at then raise exception 'ORG_CHANGED'; end if;
  v_old := o.owner_user_id;

  perform 1 from public.profiles where id in (v_old, v_new) order by id for no key update;
  select true, banned_at into v_found, v_banned from public.profiles where id = v_new;
  if v_found is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_banned is not null then raise exception 'USER_BANNED'; end if;
  select org_id into v_current from public.org_members where user_id = v_new and status = 'active';
  if (v_current is not null and v_current <> o.id) or exists(select from public.orgs where owner_user_id = v_new) then
    raise exception 'ORG_MEMBER_EXISTS';
  end if;

  select * into a from public.affiliates where org_id = o.id for update;
  if found then
    if exists(select from public.affiliates where user_id = v_new) then raise exception 'ORG_NEW_OWNER_AFFILIATE'; end if;
    -- Free the unique slug and org_id on the old row, insert the copy under the new owner, re-point
    -- every reference, then drop the old row (nothing references it any more, so nothing cascades).
    v_slug := a.slug;
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
    insert into public.affiliate_account_moves(org_id, from_user_id, to_user_id, actor) values (o.id, v_old, v_new, p_actor);
    update public.affiliate_recompute_errors set snapshot = public._affiliate_snapshot_remap(snapshot)
      where resolved_at is null and (snapshot->>'owner' = v_old::text or snapshot->>'parent' = v_old::text);
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
