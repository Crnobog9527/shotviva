-- Enterprise signup bonus (ARCHITECTURE §6.5): a platform admin sets, per org, how many extra free
-- credits a new user gets when they sign up through any of that org's staff invite links or codes.
-- It is on top of the normal invitee reward (code_grant), lands in the free pool, and is given at
-- most once per user, at the amount configured at the moment the user is bound as the org's
-- level-1 customer (referred_source 'org_l1', E2 / 1644). Level 2 (org_l2, E6) gets nothing.
--
-- The grant hangs off profiles, not code_redemptions: the E2 attribution function is redefined
-- by card E6, so this never touches it. Every anti-abuse rule of the invite (same IP, signup
-- grant, one invite per user, the 7-day window, no payment yet) has already passed in redeem_code
-- before E2 binds anyone, so nothing here can be reached without them.

-- 0 = off. The hard cap stops a typo (e.g. 50000 for 500); raising it later only widens.
alter table public.orgs add column signup_bonus_credits integer not null default 0
  check (signup_bonus_credits between 0 and 5000);

-- Widen only: every existing kind plus the enterprise signup bonus.
alter table public.credit_ledger
  drop constraint credit_ledger_kind_check,
  add constraint credit_ledger_kind_check check (kind in
    ('grant','reserve','refund','purchase','admin_adjust','clawback','clawback_restore','code_grant','invite_reward',
     'org_allocate','org_reclaim','org_deposit','org_signup_bonus'));

-- One row per user who got the bonus: which org paid for it and how much (for reports). The
-- ledger row (idempotency key org_signup_bonus:<user>) is the credit itself.
create table public.org_signup_bonuses (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.orgs(id),
  member_user_id uuid references public.profiles(id) on delete set null,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now()
);
create index org_signup_bonuses_org_idx on public.org_signup_bonuses(org_id, created_at);
alter table public.org_signup_bonuses enable row level security;
revoke all on public.org_signup_bonuses from public,anon,authenticated,service_role;
grant select on public.org_signup_bonuses to service_role;

create table public.org_signup_bonus_errors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  error text not null,
  at timestamptz not null default now()
);
alter table public.org_signup_bonus_errors enable row level security;
revoke all on public.org_signup_bonus_errors from public,anon,authenticated,service_role;
grant select on public.org_signup_bonus_errors to service_role;

-- Runs inside the E2 attribution's profile update (itself inside redeem_code). It must never undo
-- the binding or the redemption: any error is caught and recorded, and the binding commits.
create function public._org_signup_bonus() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_credits integer;
begin
  begin
    select o.id,o.signup_bonus_credits into v_org,v_credits from public.affiliates a
      join public.orgs o on o.id=a.org_id
      where a.user_id=new.referred_by and a.status='active' and o.status='active' and o.affiliate_enabled;
    if not found or v_credits is null or v_credits <= 0 then return null; end if;
    -- A paid account is never a new user (redeem_code refuses it too; this is belt and braces).
    if exists(select from public.payments where user_id=new.id) then return null; end if;
    insert into public.org_signup_bonuses(user_id,org_id,member_user_id,credits)
      values(new.id,v_org,new.referred_member,v_credits) on conflict(user_id) do nothing;
    if not found then return null; end if;
    perform public._apply_credit_change(new.id,'free','org_signup_bonus',v_credits,
      'Enterprise invite signup bonus','org_signup_bonus:' || new.id);
  exception when others or query_canceled or assert_failure then
    -- Keep no exception DETAIL/CONTEXT (it can contain a whole row).
    begin
      insert into public.org_signup_bonus_errors(user_id,error)
        values(new.id,sqlstate || ': ' || left(sqlerrm,300)) on conflict(user_id) do nothing;
    exception when others or query_canceled or assert_failure then
      return null;
    end;
  end;
  return null;
end;
$$;
revoke all on function public._org_signup_bonus() from public,anon,authenticated,service_role;

-- Only the first binding of an unbound account to an org account at level 1. A later rebind, an
-- org_l2 binding or any other profile update never fires it.
create trigger org_signup_bonus after update of referred_source on public.profiles
  for each row when (new.referred_source='org_l1' and old.referred_source is null
    and old.referred_by is null and new.referred_by is not null)
  execute function public._org_signup_bonus();

-- Admin: set an org's bonus. Same optimistic check as admin_org_update (expected_updated_at) and
-- the same audit action; the new updated_at is returned for the next save.
create function public.admin_org_set_signup_bonus(p_actor uuid, p_org_id uuid, p_credits integer, p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql security definer set search_path='' as $$
declare o public.orgs; v_before integer;
begin
  perform public._org_require_admin(p_actor);
  if p_credits is null or p_credits < 0 or p_credits > 5000 or p_expected_updated_at is null then
    raise exception 'INVALID_INPUT';
  end if;
  select * into o from public.orgs where id=p_org_id for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if o.updated_at is distinct from p_expected_updated_at then raise exception 'ORG_CHANGED'; end if;
  v_before := o.signup_bonus_credits;
  update public.orgs set signup_bonus_credits=p_credits,updated_at=now() where id=p_org_id returning * into o;
  perform public._org_audit(p_actor,'org_update',p_org_id::text,
    jsonb_build_object('signup_bonus_credits',jsonb_build_object('before',v_before,'after',p_credits))::text);
  return o.updated_at;
end;
$$;
revoke all on function public.admin_org_set_signup_bonus(uuid,uuid,integer,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.admin_org_set_signup_bonus(uuid,uuid,integer,timestamptz) to service_role;
