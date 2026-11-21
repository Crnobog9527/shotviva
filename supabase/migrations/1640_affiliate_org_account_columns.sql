-- Enterprise affiliate (ARCHITECTURE §6.5, card E2). Columns only; the functions follow in 1641–1646.
--
-- affiliates.org_id: set means this row is the org's enterprise affiliate account. It is the org
-- owner's own affiliates row (user_id = orgs.owner_user_id), so commissions, holds, statements and
-- payout fees run through the existing program unchanged. One account per org.
alter table public.affiliates add column org_id uuid references public.orgs(id);
create unique index affiliates_org_id_idx on public.affiliates(org_id) where org_id is not null;

-- referred_by keeps pointing at the account that earns (the org account for org customers).
-- referred_member: the org member whose invite brought the customer (kept after they leave, as
-- history). referred_via: for a level-2 customer, the level-1 customer who invited them (E6).
-- The partial indexes serve the ON DELETE SET NULL when a profile is deleted.
alter table public.profiles
  add column referred_member uuid references public.profiles(id) on delete set null,
  add column referred_via uuid references public.profiles(id) on delete set null;
create index profiles_referred_member_idx on public.profiles(referred_member) where referred_member is not null;
create index profiles_referred_via_idx on public.profiles(referred_via) where referred_via is not null;

-- Widen only: every existing source plus the two enterprise levels.
alter table public.profiles drop constraint profiles_referred_source_check,
  add constraint profiles_referred_source_check check (referred_source in ('signup','first_checkout','admin','org_l1','org_l2'));
