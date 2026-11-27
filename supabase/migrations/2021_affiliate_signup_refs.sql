-- A partner's link (?ref=, the sv_ref cookie) recorded on the account at email sign-up
-- (ARCHITECTURE §6.5). Binding happens at the account's first verified sign-in, and until now it
-- read only the cookie of the browser that opened the verification link: a visitor who signed up
-- on one device and verified on another lost the partner (and, for an org partner, the 2010
-- signup bonus). The sign-up server action now stores the partner's slug here, keyed by the
-- account Supabase returned, and the first verified sign-in falls back to it when its own browser
-- has no current cookie.
--
-- The row belongs to one sign-up attempt, the one whose confirmation email was clicked (review on
-- #961): anyone can submit the sign-up form for an address, so a row from an earlier attempt must
-- never outlive a later one.
--   * Every successful sign-up form for the address replaces the row (or clears it, when that
--     browser has no referral, or the account was not just created): the last attempt is the one
--     whose email is current.
--   * A row is taken only if it was written after the account's latest confirmation email was
--     sent (auth.users.confirmation_sent_at). A resent email (login page, "send again") makes it
--     stale, so the link clicked always belongs to the attempt that wrote the row.
--   * A row is taken only within the cookie's 60-day lifetime, by the row's own server time, never
--     the timestamp inside the (unsigned) cookie. Older rows are deleted unused.
--   * Only an account the Auth API has just created (≤ 10 minutes, unconfirmed, never signed in)
--     gets a row, so a form for someone else's existing address can only clear one.
--
-- Rules kept: affiliate_bind still resolves the slug, checks the switch, the active status, that
-- it is not the account's own, and one binding per account. The row is single use (take deletes
-- it). Service role only. Expand-only: a new table and two new functions, nothing existing changes.

create table public.affiliate_signup_refs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{3,24}$'),
  created_at timestamptz not null default now()
);

alter table public.affiliate_signup_refs enable row level security;
revoke all on table public.affiliate_signup_refs from public, anon, authenticated;
grant select, insert, update, delete on table public.affiliate_signup_refs to service_role;

-- After a successful sign-up form for `p_user`: replaces its row with `p_slug`, or clears it.
-- true when a row was stored; false when the row was cleared or nothing was stored (no slug, a
-- malformed one, an unknown account, or one that is confirmed, has signed in or was created more
-- than 10 minutes ago).
create function public.affiliate_signup_ref_store(p_user uuid, p_slug text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return false; end if;
  delete from public.affiliate_signup_refs where user_id = p_user;
  if p_slug is null or p_slug !~ '^[a-z0-9-]{3,24}$' then return false; end if;
  perform 1 from auth.users u
   where u.id = p_user and u.email_confirmed_at is null and u.phone_confirmed_at is null
     and u.last_sign_in_at is null and u.created_at >= now() - interval '10 minutes';
  if not found then return false; end if;
  insert into public.affiliate_signup_refs (user_id, slug) values (p_user, p_slug);
  return true;
end;
$$;

-- The stored slug, removed as it is read; null when there is none, it is older than 60 days or
-- it predates the account's latest confirmation email.
create function public.affiliate_signup_ref_take(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_at timestamptz; v_sent timestamptz;
begin
  delete from public.affiliate_signup_refs where user_id = p_user returning slug, created_at into v_slug, v_at;
  if v_slug is null then return null; end if;
  select u.confirmation_sent_at into v_sent from auth.users u where u.id = p_user;
  if v_at < now() - interval '60 days' or v_sent is null or v_at < v_sent then return null; end if;
  return v_slug;
end;
$$;

revoke execute on function public.affiliate_signup_ref_store(uuid, text) from public, anon, authenticated;
revoke execute on function public.affiliate_signup_ref_take(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_signup_ref_store(uuid, text) to service_role;
grant execute on function public.affiliate_signup_ref_take(uuid) to service_role;
