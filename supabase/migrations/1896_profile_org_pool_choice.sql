-- 出图时让员工自选 (ARCHITECTURE §6.5 企业推广积分池, the Owner 2026-11-22): the pool a member of an
-- org last chose to pay with when they hold both kinds of org credits. Only the creation pages
-- read it, as the picker's default; reserve_credits writes it when it honours a choice. Adds one
-- nullable column; code running before the deploy never reads it.
alter table public.profiles
  add column org_pool_choice text check (org_pool_choice in ('paid', 'promo'));
