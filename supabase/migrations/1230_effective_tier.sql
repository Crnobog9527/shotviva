-- The tier that decides tier-gated features (batch size, multi-template batches, batch ZIPs,
-- concurrency, rate window, feature_access). An unbanned admin gets Max regardless of plan so
-- the Owner can use every feature on their own account; everyone else gets current_tier().
-- Billing (pack discounts, upgrades, membership cards), support reply time and wishlist vote
-- weight keep reading current_tier(): admins still pay credits and buy plans like anyone.
create function public.effective_tier(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin' and p.banned_at is null)
      then 'max'
    else public.current_tier(p_user_id)
  end;
$$;
revoke all on function public.effective_tier(uuid) from public, anon, authenticated;
grant execute on function public.effective_tier(uuid) to service_role;
