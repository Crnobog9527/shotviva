-- An affiliate_rate_overrides row with both rates null is not an agreement (production
-- 2026-11-23). The admin's 单独佣金比例 form sends every product kind; clearing a kind's two
-- fields stored a row with l1_bp and l2_bp null instead of removing it. Every reader already
-- treats null as "use the default" (coalesce in _affiliate_snapshot and the floor budget,
-- `?? default` in the admin reads), so such a row changes no payout. But 1990's
-- _affiliate_has_history counted it, and an owner transfer onto an account whose cleared overrides
-- were the only reference still failed with ORG_NEW_OWNER_AFFILIATE_HISTORY.
--
-- * _affiliate_has_history: an override counts only when l1_bp or l2_bp is set. An all-null row
--   goes with the deleted personal row (ON DELETE CASCADE), like click days. Otherwise identical
--   to 1990. Race: the transfer locks the personal row FOR UPDATE NOWAIT before the check, so a
--   new override (its foreign key check takes KEY SHARE on that row) cannot appear. A rate update
--   on an existing row does not touch the key and so does not wait for that lock; the transfer
--   now also locks the row's overrides NOWAIT (below), so one in flight makes it ORG_BUSY and
--   none can start before the check reads them.
-- * _affiliate_overrides (the writer behind every admin affiliate form): a kind whose two rates
--   are null is deleted instead of stored; the others are upserted as before (0908).
-- * admin_org_transfer_owner: identical to 1990 plus one NOWAIT lock, on the personal row's
--   override rows, next to its click days (the cascade deletes them; a concurrent rate update
--   holds one without touching the affiliates row).
-- Existing all-null rows are left in place (no data rewrite here); the check and the readers
-- ignore them and the next save of that form removes them.
--
-- Expand-only: create or replace of three functions with their signatures and grants.

create or replace function public._affiliate_has_history(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select from public.affiliates a where a.user_id = p_user)
      or exists(select from public.affiliates a where a.user_id = p_user and a.status = 'banned')
      or exists(select from public.affiliate_commissions where affiliate_user_id = p_user)
      or exists(select from public.affiliate_payouts where affiliate_user_id = p_user)
      or exists(select from public.affiliate_adjustments where affiliate_user_id = p_user)
      or exists(select from public.affiliate_rate_overrides
                 where user_id = p_user and (l1_bp is not null or l2_bp is not null))
      or exists(select from public.profiles where referred_by = p_user)
      or exists(select from public.affiliates where parent_user_id = p_user)
      or exists(select from public.affiliate_recompute_errors e
                 where e.snapshot->>'owner' = p_user::text or e.snapshot->>'parent' = p_user::text);
$$;
revoke all on function public._affiliate_has_history(uuid) from public, anon, authenticated, service_role;

-- Same as 0908 except that a kind with both rates null is removed rather than stored.
create or replace function public._affiliate_overrides(p_user uuid,p_values jsonb) returns void language sql security definer set search_path='' as $$
  delete from public.affiliate_rate_overrides o
   using jsonb_to_recordset(coalesce(p_values,'[]'::jsonb)) r(product_kind text,l1_bp integer,l2_bp integer)
   where o.user_id=p_user and o.product_kind=r.product_kind and r.l1_bp is null and r.l2_bp is null;
  insert into public.affiliate_rate_overrides(user_id,product_kind,l1_bp,l2_bp)
    select p_user,r.product_kind,r.l1_bp,r.l2_bp from jsonb_to_recordset(p_values) r(product_kind text,l1_bp integer,l2_bp integer)
     where r.l1_bp is not null or r.l2_bp is not null
    on conflict(user_id,product_kind) do update set l1_bp=excluded.l1_bp,l2_bp=excluded.l2_bp;
$$;
revoke all on function public._affiliate_overrides(uuid,jsonb) from public,anon,authenticated,service_role;

-- Same as 1990 except the lock on the personal row's override rows.
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
      -- 1991: its override rows go with it too; an all-null one is not history.
      perform 1 from public.affiliate_rate_overrides where user_id = v_new order by product_kind for update nowait;
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
