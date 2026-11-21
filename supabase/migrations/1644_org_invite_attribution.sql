-- Enterprise level-1 attribution (ARCHITECTURE §6.5): staff promote with their ordinary personal
-- invite code / link (T94). When an invite redemption succeeds and the inviter is an active member
-- (owner included) of an active org whose affiliate switch is on and whose org account is active,
-- the new customer is bound to the org account: referred_by = org account, referred_member = that
-- member, referred_source = 'org_l1'. First binding wins: a customer already bound to any account
-- is never rebound. A colleague in the same org is not the org's customer.
--
-- Like the affiliate payment trigger (0906), this must never undo the redemption: any error is
-- caught, recorded in org_attribution_errors and the redemption commits as usual. redeem_code has
-- already locked both profiles, so the profile update takes no new lock order.

create table public.org_attribution_errors (
  redemption_id uuid primary key references public.code_redemptions(id) on delete cascade,
  error text not null,
  at timestamptz not null default now()
);
alter table public.org_attribution_errors enable row level security;
revoke all on public.org_attribution_errors from public,anon,authenticated,service_role;
grant select on public.org_attribution_errors to service_role;

create function public._org_attribute_invite() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_account uuid;
begin
  begin
    select o.id,a.user_id into v_org,v_account from public.org_members m
      join public.orgs o on o.id=m.org_id
      join public.affiliates a on a.org_id=o.id
      where m.user_id=new.inviter_user_id and m.status='active' and o.status='active' and o.affiliate_enabled
        and a.status='active';
    if not found or v_account=new.user_id then return null; end if;
    if exists(select from public.org_members m where m.org_id=v_org and m.user_id=new.user_id and m.status='active') then
      return null;
    end if;
    update public.profiles set referred_by=v_account,referred_at=now(),referred_source='org_l1',
      referred_member=new.inviter_user_id,referred_via=null
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
revoke all on function public._org_attribute_invite() from public,anon,authenticated,service_role;

create trigger org_invite_attribution after insert on public.code_redemptions
  for each row when (new.kind='invite' and new.status='ok' and new.inviter_user_id is not null)
  execute function public._org_attribute_invite();
