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
-- org's affiliates row (FOR UPDATE), the order of admin_org_add_member and 1642. A payment that is
-- written for an org customer while the transfer runs waits on the affiliates row and then fails
-- its foreign key check, so its webhook retries and binds to the new owner (no commission is lost).
--
-- Expand-only: one new function and a widened audit-action check (read from the live constraint,
-- as 1840 did, so other open migrations' actions are kept). Nothing existing changes.

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
