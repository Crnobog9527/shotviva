-- Who the signed-in caller is, in one read per request (ARCHITECTURE §7「会话校验」): the Auth
-- account, its profile, and whether the session named in the JWT is still live. The app checks
-- the JWT signature itself (getClaims against the project's JWKS) and calls this instead of Auth's
-- GET /user plus a profiles read, so a signed-in page costs no Auth round trip.
-- Same refusals as GET /user: a deleted account, an Auth-level ban (banned_until), and a session
-- that was signed out, revoked or timed out (auth.sessions row gone or past not_after) return no
-- row. profiles.banned_at (our ban, ARCHITECTURE §7) is returned, not refused: banned accounts
-- still sign in. Only adds a function; the code on the site today does not call it.
create function public.session_identity()
returns table (
  id uuid,
  email text,
  phone text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  app_metadata jsonb,
  user_metadata jsonb,
  role text,
  banned_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.phone::text, u.email_confirmed_at, u.phone_confirmed_at,
    coalesce(u.raw_app_meta_data, '{}'::jsonb), coalesce(u.raw_user_meta_data, '{}'::jsonb),
    p.role, p.banned_at
  from auth.users u
  -- Primary keys on both sides. A JWT without session_id (never one Auth issues to a user) matches nothing.
  join auth.sessions s on s.id = (auth.jwt() ->> 'session_id')::uuid and s.user_id = u.id
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid()
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
    and (s.not_after is null or s.not_after > now())
$$;

revoke execute on function public.session_identity() from public, anon;
grant execute on function public.session_identity() to authenticated;
