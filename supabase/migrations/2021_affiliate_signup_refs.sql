-- A partner's link (?ref=, the httpOnly sv_ref cookie) recorded on the account at email sign-up
-- (ARCHITECTURE §6.5). Binding happens at the account's first verified sign-in, and until now it
-- read only the cookie of the browser that opened the verification link: a visitor who signed up
-- on one device and verified on another lost the partner (and, for an org partner, the 2010
-- signup bonus). The sign-up server action now stores the validated cookie value here, keyed by
-- the new account, and the first verified sign-in takes it when its own browser has no cookie.
--
-- Rules kept:
--   * The value is the server-side cookie (`<slug>.<unix seconds>`), never anything the client
--     sends in the form or in user_metadata. Only its shape is stored; affiliate_bind still
--     resolves the slug, checks the switch, the active status and that it is not the account's own.
--   * Only an account the Auth API has just created, still unconfirmed and never signed in, can get
--     a row (so a later sign-up form for someone else's address cannot attach a partner to an
--     account that already exists), and only one row: the first one stored stays.
--   * The row is single use: affiliate_signup_ref_take deletes it as it returns it. Binding stays
--     on the account's genuine first verified sign-in only, so nothing here can bind later.
--   * Service role only. Expand-only: a new table and two new functions, nothing existing changes.

create table public.affiliate_signup_refs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ref text not null check (ref ~ '^[a-z0-9-]{3,24}\.[0-9]{1,12}$'),
  created_at timestamptz not null default now()
);

alter table public.affiliate_signup_refs enable row level security;
revoke all on table public.affiliate_signup_refs from public, anon, authenticated;
grant select, insert, delete on table public.affiliate_signup_refs to service_role;

-- Stores `p_ref` for a just-created, unconfirmed account. false when it stores nothing: a malformed
-- value, an unknown account, one that is confirmed, has signed in or was created more than 10
-- minutes ago, or one that already has a row.
create function public.affiliate_signup_ref_store(p_user uuid, p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_ref is null or p_ref !~ '^[a-z0-9-]{3,24}\.[0-9]{1,12}$' then return false; end if;
  perform 1 from auth.users u
   where u.id = p_user and u.email_confirmed_at is null and u.phone_confirmed_at is null
     and u.last_sign_in_at is null and u.created_at >= now() - interval '10 minutes';
  if not found then return false; end if;
  insert into public.affiliate_signup_refs (user_id, ref) values (p_user, p_ref) on conflict (user_id) do nothing;
  return found;
end;
$$;

-- The stored value, removed as it is read. null when there is none.
create function public.affiliate_signup_ref_take(p_user uuid) returns text
language sql security definer set search_path = '' as $$
  delete from public.affiliate_signup_refs where user_id = p_user returning ref
$$;

revoke execute on function public.affiliate_signup_ref_store(uuid, text) from public, anon, authenticated;
revoke execute on function public.affiliate_signup_ref_take(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_signup_ref_store(uuid, text) to service_role;
grant execute on function public.affiliate_signup_ref_take(uuid) to service_role;
