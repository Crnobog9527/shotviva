-- Enterprise promotion credits pool (ARCHITECTURE §6.5 企业推广积分池, the Owner 2026-11-22): a
-- channel partner's monthly promotion grant and ad-hoc top-ups go into the org, not the owner's own
-- account. The org now holds two balances: pool_credits (paid, as before) and promo_pool_credits
-- (free-pool credits: watermarked, demo-only, expiring at the end of the UTC month). The owner hands
-- both kinds to members with separate monthly allowances and one-off grants.
--
-- This file only adds structure: columns with defaults and the ledger kinds widened
-- from what they are now (read from the constraints, as 1840 did, so nothing another migration
-- added is dropped). Code running before the deploy never reads the new columns.

-- promo_expires_at: when the credits now in the promo pool (and held by members) expire; null when
-- the org has no live promotion month. Set by a grant, cleared by the expiry.
alter table public.orgs
  add column promo_pool_credits bigint not null default 0 check (promo_pool_credits >= 0),
  add column promo_expires_at timestamptz;

-- held_promo_credits: promotion credits the org moved into this member's free pool that still count
-- as the org's (spent before the member's own free credits; expire at month end). promo_allowance:
-- the most the member is given automatically from the promo pool each UTC month.
alter table public.org_members
  add column promo_allowance integer not null default 0 check (promo_allowance between 0 and 1000000000),
  add column held_promo_credits integer not null default 0 check (held_promo_credits >= 0);

-- Where a grant or top-up went: 'owner' (the owner's own free pool, every row before this
-- migration; it expires there at month end as before) or 'org' (the org promo pool, every row
-- confirmed or made after it).
alter table public.partner_promo_grants
  add column destination text not null default 'owner' check (destination in ('owner', 'org'));
alter table public.partner_promo_topups
  add column destination text not null default 'owner' check (destination in ('owner', 'org'));

-- A refund that lands after the member left: 'paid' (as before) or 'promo'. A promo return is only
-- put back into the promo pool while its month (period) is still the org's live one.
alter table public.org_pool_returns
  add column pool text not null default 'paid' check (pool in ('paid', 'promo')),
  add column period text check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

do $$
declare
  v_kinds text[];
  v_new text;
begin
  select array_agg(m[1] order by ord) into v_kinds
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.org_credit_ledger'::regclass and c.conname = 'org_credit_ledger_kind_check';
  if v_kinds is null or not 'allocate' = any(v_kinds) then raise exception 'org_credit_ledger_kind_check not found or unreadable'; end if;
  foreach v_new in array array['promo_grant', 'promo_allocate', 'promo_reclaim', 'promo_expire'] loop
    if not v_new = any(v_kinds) then v_kinds := array_append(v_kinds, v_new); end if;
  end loop;
  execute 'alter table public.org_credit_ledger drop constraint org_credit_ledger_kind_check';
  execute 'alter table public.org_credit_ledger add constraint org_credit_ledger_kind_check check (kind in ('
    || (select string_agg(quote_literal(k), ',' order by o) from unnest(v_kinds) with ordinality u(k, o)) || '))';

  select array_agg(m[1] order by ord) into v_kinds
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.credit_ledger'::regclass and c.conname = 'credit_ledger_kind_check';
  if v_kinds is null or not 'partner_promo_topup' = any(v_kinds) then raise exception 'credit_ledger_kind_check not found or unreadable'; end if;
  foreach v_new in array array['org_promo_allocate', 'org_promo_reclaim', 'org_promo_expire'] loop
    if not v_new = any(v_kinds) then v_kinds := array_append(v_kinds, v_new); end if;
  end loop;
  execute 'alter table public.credit_ledger drop constraint credit_ledger_kind_check';
  execute 'alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in ('
    || (select string_agg(quote_literal(k), ',' order by o) from unnest(v_kinds) with ordinality u(k, o)) || '))';
end;
$$;
