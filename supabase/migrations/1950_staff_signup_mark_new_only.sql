-- mark_staff_signup (1940) only for a real staff-link sign-up (Codex P1 on #841). An existing
-- account that signs in through a staff link, say one whose gift is pending under the per-network
-- allowance (same_ip_pending, 1480), must keep its eligibility. So the function now marks only a
-- new account: never paid the gift, holding no other refusal, and either on its first verified
-- sign-in (no signup IP stored yet: the app calls this before recording it) or created in the
-- last 24 hours. A pending account is never turned into a permanent 'staff' one, and an older
-- account that later signs in through a staff link keeps whatever it had.
--   true   the account is marked 'staff' now, or already was
--   false  nothing written: no such account, not new, the gift was already paid, or another
--          refusal stands
--
-- Same signature and grants; only the body changes. Code from before the deploy calls it the
-- same way and ignores the answer.
create or replace function public.mark_staff_signup(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_refusal text;
  v_created timestamptz;
  v_ip inet;
begin
  if p_user_id is null then raise exception 'INVALID_INPUT'; end if;
  select signup_gift_refusal, created_at, signup_ip into v_refusal, v_created, v_ip
    from public.profiles where id = p_user_id for update;
  if not found then return false; end if;
  if v_refusal = 'staff' then return true; end if;
  if v_refusal is not null
     or (v_ip is not null and v_created <= now() - interval '24 hours')
     or exists (select 1 from public.credit_ledger where idempotency_key = 'signup:' || p_user_id::text) then
    return false;
  end if;
  update public.profiles set signup_gift_refusal = 'staff' where id = p_user_id;
  return true;
end;
$$;
revoke all on function public.mark_staff_signup(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_staff_signup(uuid) to service_role;
