-- T27b: the support reply time per membership tier, in hours (ARCHITECTURE §6.2 「会员档位权益」,
-- Owner 2026-11-06: Starter 48, Pro 48, Max 24; no tier 48). The admin ticket list and the
-- overview to-do strip need it inside SQL to order and count by due time; the app reads
-- TIER_LIMITS[tier].supportHours (core/billing/tier-limits.ts). tests/db/support-sla.test.ts keeps the
-- two equal, the way the wishlist's 3x vote weight is kept.
create function public.support_reply_hours(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier when 'max' then 24 else 48 end;
$$;

revoke execute on function public.support_reply_hours(text) from public, anon, authenticated;
grant execute on function public.support_reply_hours(text) to service_role;
