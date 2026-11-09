-- The default gift policy is a private setting, shared by admin reads and every writer.
insert into public.system_settings (key, value)
values ('code_gift_policy', '{"maxCreditsPerCode":1000,"requirePaidGiftCap":true}')
on conflict (key) do nothing;

-- Retain the positive-amount and positive-cap invariants while allowing the configured
-- maximum and the requirement for a cap to vary. Existing rows all satisfy both checks.
alter table public.codes
  drop constraint codes_invitee_credits_check,
  add constraint codes_invitee_credits_check check (invitee_credits > 0),
  drop constraint codes_check4,
  add constraint codes_check4 check (invitee_pool <> 'paid' or max_redemptions is null or max_redemptions > 0);

create function public._enforce_code_gift_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  policy jsonb;
  max_credits numeric;
begin
  if new.invitee_credits is null then return new; end if;
  if tg_op = 'UPDATE' then
    if row(old.invitee_credits, old.invitee_pool, old.max_redemptions) is not distinct from
       row(new.invitee_credits, new.invitee_pool, new.max_redemptions) then return new; end if;
  end if;

  select value into policy from public.system_settings where key = 'code_gift_policy' for share;
  if jsonb_typeof(policy->'maxCreditsPerCode') is distinct from 'number'
    or jsonb_typeof(policy->'requirePaidGiftCap') is distinct from 'boolean' then
    raise exception 'INVALID_CODE_GIFT_POLICY';
  end if;
  max_credits := (policy->>'maxCreditsPerCode')::numeric;
  if max_credits <= 0 or max_credits <> trunc(max_credits) or max_credits > 2147483647 then
    raise exception 'INVALID_CODE_GIFT_POLICY';
  end if;
  if new.invitee_credits > max_credits then raise exception 'CODE_GIFT_LIMIT'; end if;
  if new.invitee_pool = 'paid' and new.max_redemptions is null and (policy->>'requirePaidGiftCap')::boolean then
    raise exception 'CODE_GIFT_CAP_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public._enforce_code_gift_policy() from public, anon, authenticated, service_role;
create trigger codes_enforce_gift_policy
  before insert or update of invitee_credits, invitee_pool, max_redemptions on public.codes
  for each row execute function public._enforce_code_gift_policy();
