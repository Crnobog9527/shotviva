-- Staff accounts get no signup gift, ever (Owner 2026-11-22, ARCHITECTURE §6.5 员工账号). An
-- account that signs up through an org's staff link is marked with the stored refusal 'staff'.
-- A stored refusal stands everywhere the gift is paid: grant_credits refuses the signup key while
-- profiles.signup_gift_refusal is set, and claim_signup_gift only pays the same-IP refusals. So
-- the gift is not retried at a later sign-in, nor claimed with a phone or Google, nor paid when
-- the org later removes the account (Owner: no retroactive gift).
--
-- Expand-only: the refusal check gains one value (every stored value stays valid), plus one new
-- function. Code deployed before this never writes or reads 'staff'.

alter table public.profiles drop constraint profiles_signup_gift_refusal_check,
  add constraint profiles_signup_gift_refusal_check
    check (signup_gift_refusal in ('same_ip', 'same_ip_pending', 'daily_cap', 'paused', 'staff'));

-- Marks a staff-link signup before its first gift attempt. Returns false (nothing written) when
-- the account is missing or the gift was already paid: a paid gift is never taken back here.
create or replace function public.mark_staff_signup(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found or exists (select 1 from public.credit_ledger where idempotency_key = 'signup:' || p_user_id::text) then
    return false;
  end if;
  update public.profiles set signup_gift_refusal = 'staff' where id = p_user_id;
  return true;
end;
$$;
revoke all on function public.mark_staff_signup(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_staff_signup(uuid) to service_role;
