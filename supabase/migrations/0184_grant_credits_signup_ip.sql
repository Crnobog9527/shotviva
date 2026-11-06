-- T25: the same-IP rule on the signup gift (ARCHITECTURE §7, Owner 2026-11-06: on at launch).
-- Only the signup grant (idempotency key 'signup:<own id>') is checked; activity grants and
-- every other caller behave as before. Signature unchanged.
--
-- The account is refused the gift when another account with the same signup_ip received its
-- signup gift less than 24 hours before this account was created, or at any time after. The
-- window is anchored on this account's created_at, not on now(), so the answer never flips:
-- the grant is retried on every verified sign-in (core/auth/free-credits.ts), and a refused
-- account must not collect the gift a day later. A refusal writes nothing (the ledger has no
-- zero rows) and answers applied = false; the account can still sign up and pay.
--
-- Two accounts on one IP verifying at the same moment would both see no earlier gift, so the
-- check and the grant run under a transaction lock on the IP. Lookups: the caller's profile by
-- primary key, then profiles_signup_ip_created_at_idx (0180) for the same-IP accounts and
-- credit_ledger_idempotency_key_key for each one's signup row.

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_pool text
)
returns public.credit_change
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be positive';
  end if;

  if p_idempotency_key = 'signup:' || p_user_id::text then
    select * into v_profile from public.profiles where id = p_user_id;
    if found and v_profile.signup_ip is not null then
      perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_ip:' || host(v_profile.signup_ip), 0));
      if not exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key)
         and exists (
           select 1
             from public.profiles other
             join public.credit_ledger l on l.idempotency_key = 'signup:' || other.id::text
            where other.signup_ip = v_profile.signup_ip
              and other.id <> p_user_id
              and l.created_at > v_profile.created_at - interval '24 hours'
         ) then
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;
    end if;
  end if;

  return public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;
