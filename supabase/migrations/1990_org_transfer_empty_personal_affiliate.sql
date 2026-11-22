-- 更换主管理员 (1930) when the new owner has an empty personal affiliate account (Owner 2026-11-23).
-- Org primary admins are fresh accounts with no history. 1930 refused any new owner holding an
-- affiliates row (ORG_NEW_OWNER_AFFILIATE: the org's row would collide on the user_id key), which
-- also blocked an account whose personal row was never used. Now, when the new owner's own row
-- (org_id null) is in the way and empty, it is deleted in the same transaction, before the org's
-- row moves, and the transfer goes on as in 1930. In the way: the org has an affiliate account
-- (its row moves onto the same key), or the row is open (pending/active, which an org owner may
-- not hold, 1642: ORG_PERSONAL_AFFILIATE, still the refusal there when it is not empty). A closed
-- row of an org without an account is left alone, as in 1930. The transfer's audit row names
-- what was removed ('removed_personal': slug, status, created_at, clicks).
--
-- Empty means nothing that is money, a customer, a team or a ban (control 2026-11-23: a suspended
-- or rejected row is closed, not history; its admin note and reject reason go with it):
-- * no affiliate_commissions, affiliate_payouts or affiliate_adjustments rows;
-- * no affiliate_rate_overrides (a negotiated rate is an agreement, kept);
-- * no profiles.referred_by on it (a bound customer) and no affiliates.parent_user_id on it (a
--   sub-affiliate);
-- * no affiliate_recompute_errors snapshot, resolved or not, naming it as owner or parent (a
--   payment whose commission is still to be written would otherwise land on the org's account);
-- * status is not 'banned' (a ban is a record the admin keeps).
-- Known edge: the new owner's user id now holds the org account, so an admin form still open on
-- the deleted personal dossier (adjust, set) would act on the org account. The audit row names
-- the removed slug so the admin can tell.
-- Click counters (affiliate_click_days) are not history: they carry no money and no customer.
-- They go with the row (ON DELETE CASCADE) and their total is in the audit row. Its application,
-- payout details and terms consent go too: a person in an org can never hold a personal account
-- (1642), so nothing there could be used again. A row with any of the above is refused with
-- ORG_NEW_OWNER_AFFILIATE_HISTORY (org with an account) and nothing is written. Every table
-- whose foreign key reaches affiliates(user_id) is in the list above or is affiliate_click_days;
-- a DB test reads the live catalogue and fails when a new one appears.
--
-- Race safety: the new owner's row and its click days are locked FOR UPDATE NOWAIT right after
-- the org's row (the 1930 lock order: the transfer never waits while it holds a lock). The
-- floor-budget advisory lock is now also tried when only that row exists, since its delete fires
-- the same statement trigger on affiliates. From then on
-- no commission, payout, adjustment, click, override, child or customer binding can reference it:
-- their foreign key check (KEY SHARE) or affiliate_bind's KEY SHARE waits for this transaction,
-- and one already in progress makes the lock fail with ORG_BUSY. The emptiness checks run after
-- the lock, so they see every committed reference. A recompute error naming the row can only be
-- written for a payment of a customer bound to it, or of a child's customer, both refused.
--
-- Expand-only: two new functions (_affiliate_has_history, the check; admin_org_picker_affiliate_history,
-- the picker's read of it) and create or replace of admin_org_transfer_owner with its signature,
-- identical to 1930 except the lock on the new owner's row, the check and delete, the advisory
-- lock condition and the 'removed_personal' key of its result and audit row.
-- ORG_NEW_OWNER_AFFILIATE stays for a row that is not personal (org_id set: an account of another
-- org, which ORG_MEMBER_EXISTS already refuses earlier).

-- True when the affiliates row of p_user has anything worth keeping (the list in the header). Also
-- true for a user without a row, so a caller can never read "empty" for a row it did not see.
create function public._affiliate_has_history(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select from public.affiliates a where a.user_id = p_user)
      or exists(select from public.affiliates a where a.user_id = p_user and a.status = 'banned')
      or exists(select from public.affiliate_commissions where affiliate_user_id = p_user)
      or exists(select from public.affiliate_payouts where affiliate_user_id = p_user)
      or exists(select from public.affiliate_adjustments where affiliate_user_id = p_user)
      or exists(select from public.affiliate_rate_overrides where user_id = p_user)
      or exists(select from public.profiles where referred_by = p_user)
      or exists(select from public.affiliates where parent_user_id = p_user)
      or exists(select from public.affiliate_recompute_errors e
                 where e.snapshot->>'owner' = p_user::text or e.snapshot->>'parent' = p_user::text);
$$;
revoke all on function public._affiliate_has_history(uuid) from public, anon, authenticated, service_role;

-- The admin user picker of 更换主管理员: which of these accounts hold a personal affiliate row
-- (org_id null) with history, so the transfer would refuse them. Read-only, service role only.
create function public.admin_org_picker_affiliate_history(p_users uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.user_id from public.affiliates a
   where a.user_id = any(p_users) and a.org_id is null and public._affiliate_has_history(a.user_id);
$$;
revoke all on function public.admin_org_picker_affiliate_history(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_picker_affiliate_history(uuid[]) to service_role;

-- p_input: {org_id, user_id (the new owner), expected_updated_at (orgs.updated_at the form saw)}.
-- Returns {applied: false} when user_id already owns the org (a repeat; nothing written, no audit
-- row, checked before the stale-form guard so a double click is harmless), else {applied: true,
-- updated_at, previous_owner, affiliate: null | {commissions, payouts, adjustments, customers},
-- removed_personal: null | {slug, status, created_at, clicks}} (the new owner's empty personal
-- affiliate row deleted by this transfer, 1990).
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
  p public.affiliates;
  v_has_personal boolean := false;
  v_removed jsonb := null;
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
    -- The new owner's own row, if any, right after the org's (1990): once held, nothing new can
    -- reference it, so the emptiness check below sees all its history. Its click counters too,
    -- which its delete cascades to (a click increment holds one without touching this row).
    select * into p from public.affiliates where user_id = v_new and user_id is distinct from v_account for update nowait;
    v_has_personal := found;
    if v_has_personal then
      perform 1 from public.affiliate_click_days where affiliate_user_id = v_new order by day for update nowait;
    end if;
    perform 1 from public.profiles
     where id in (select v_old union all select v_new union all
                  select c.id from public.profiles c where v_account is not null and c.referred_by = v_account)
     order by id for no key update nowait;
    perform 1 from public.org_members where org_id = o.id and user_id in (v_old, v_new) order by user_id for no key update nowait;
    -- Rows the writes reference through a foreign key: the admin (audit log) and the account's
    -- approver (the copied row).
    perform 1 from public.profiles where id in (p_actor, a.approved_by) order by id for key share nowait;
    -- The affiliates statement trigger refreshes the template floor budget under this lock.
    if (v_account is not null or v_has_personal) and not pg_try_advisory_xact_lock(hashtextextended('shotviva.template_floor_budget_cache', 0)) then
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

  -- The org's account is always its owner's row (1640/1643); refuse rather than move anything
  -- of someone else's if that ever stops being true.
  if v_account is not null and a.user_id <> v_old then raise exception 'ORG_AFFILIATE_MISMATCH'; end if;
  -- The new owner's own row (1990): cleared when it is in the way (the org's row moves onto its
  -- key, or it is open, which an org owner may not hold, 1642) and empty; refused otherwise.
  -- A closed row is left alone when the org has no account, as in 1930.
  if v_has_personal and (v_account is not null or p.status in ('pending', 'active')) then
    -- Only a personal row can be cleared; any other row is not this transfer's to remove.
    if p.org_id is not null then raise exception 'ORG_NEW_OWNER_AFFILIATE'; end if;
    if public._affiliate_has_history(v_new) then
      if v_account is not null then raise exception 'ORG_NEW_OWNER_AFFILIATE_HISTORY'; end if;
      raise exception 'ORG_PERSONAL_AFFILIATE';
    end if;
    v_removed := jsonb_build_object('slug', p.slug, 'status', p.status, 'created_at', p.created_at,
      'clicks', (select coalesce(sum(clicks), 0) from public.affiliate_click_days where affiliate_user_id = v_new));
    delete from public.affiliates where user_id = v_new and org_id is null;
    if not found then raise exception 'ORG_NEW_OWNER_AFFILIATE'; end if;
  end if;

  if v_account is not null then
    -- Never true after the delete above unless a row appeared that was not locked: refuse.
    if exists(select from public.affiliates where user_id = v_new) then raise exception 'ORG_NEW_OWNER_AFFILIATE'; end if;
    -- Free the unique slug and org_id on the old row, insert the copy under the new owner, re-point
    -- every reference, then drop the old row (nothing references it any more, so nothing cascades).
    update public.affiliates set slug = 'mv-' || substr(md5(gen_random_uuid()::text), 1, 20), org_id = null
      where user_id = a.user_id;
    a.user_id := v_new;
    -- The terms consent was the previous owner's own (case 7): the new owner re-accepts.
    a.terms_version := null;
    a.terms_accepted_at := null;
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
    jsonb_build_object('from', v_old, 'to', v_new, 'affiliate', v_moved, 'removed_personal', v_removed)::text);
  return jsonb_build_object('applied', true, 'updated_at', o.updated_at, 'previous_owner', v_old, 'affiliate', v_moved,
    'removed_personal', v_removed);
end;
$$;
revoke all on function public.admin_org_transfer_owner(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_transfer_owner(uuid, jsonb) to service_role;
