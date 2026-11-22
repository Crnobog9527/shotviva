-- Monthly free promotion credits for enterprise channel partners (ARCHITECTURE §6.5 渠道商推广积分,
-- the Owner 2026-11-22). A channel partner is an enterprise org with its affiliate account on that a
-- platform admin has explicitly marked (orgs.promo_partner): not every org that earns commissions
-- gets a monthly grant. At the start of each UTC month a cron computes one pending grant sheet per
-- partner; nothing is granted until an admin confirms it. Granted credits land in the free pool of
-- the org owner's own account (watermarked, never the org pool, so org_allocate cannot move them)
-- and the part still unspent at the end of that month is taken back (1843).
--
-- This file only adds structure: a column with a default, new tables, and the ledger kinds and
-- audit actions widened from what they are now. Code running before the deploy never reads them.

alter table public.orgs add column promo_partner boolean not null default false;

-- Widen only: every ledger kind allowed now (read from the constraint as it is, so a kind another
-- migration added is never dropped) plus the grant and its month-end expiry.
do $$
declare
  v_kinds text[];
begin
  select array_agg(m[1] order by ord) into v_kinds
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.credit_ledger'::regclass and c.conname = 'credit_ledger_kind_check';
  if v_kinds is null or cardinality(v_kinds) < 10 then
    raise exception 'credit_ledger_kind_check not found or unreadable';
  end if;
  if not 'partner_promo' = any(v_kinds) then v_kinds := array_append(v_kinds, 'partner_promo'); end if;
  if not 'partner_promo_expire' = any(v_kinds) then v_kinds := array_append(v_kinds, 'partner_promo_expire'); end if;
  execute 'alter table public.credit_ledger drop constraint credit_ledger_kind_check';
  execute 'alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in ('
    || (select string_agg(quote_literal(k), ',' order by o) from unnest(v_kinds) with ordinality u(k, o)) || '))';
end;
$$;

-- The audit log gains the partner switch and the three decisions on a sheet, the same way 1820 did.
do $$
declare
  v_actions text[];
  v_new text;
begin
  select array_agg(m[1] order by ord) into v_actions
    from pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as t(m, ord)
   where c.conrelid = 'public.admin_audit_log'::regclass and c.conname = 'admin_audit_log_action_check';
  if v_actions is null or cardinality(v_actions) < 10 then
    raise exception 'admin_audit_log_action_check not found or unreadable';
  end if;
  foreach v_new in array array['partner_promo_set', 'partner_promo_confirm', 'partner_promo_reject', 'partner_promo_run'] loop
    if not v_new = any(v_actions) then v_actions := array_append(v_actions, v_new); end if;
  end loop;
  execute 'alter table public.admin_audit_log drop constraint admin_audit_log_action_check';
  execute 'alter table public.admin_audit_log add constraint admin_audit_log_action_check check (action in ('
    || (select string_agg(quote_literal(a), ',' order by o) from unnest(v_actions) with ordinality u(a, o)) || '))';
end;
$$;

-- One sheet per partner and grant month (period = the month the credits are for, `YYYY-MM`; it
-- counts the commissions confirmed in the month before). The unique key is what makes the cron and
-- the admin's "generate now" safe to repeat. While pending, every number is recomputed on each run
-- and `fingerprint` changes with them; a confirm checks it (stale-form guard). Once decided the row
-- is frozen. `detail` holds the per-customer breakdown and the clawback sources for the page.
create table public.partner_promo_grants (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'pending' check (status in ('pending', 'granted', 'rejected', 'lapsed')),
  recipient_user_id uuid not null references public.profiles(id),
  base integer not null check (base >= 0),
  bonus integer not null check (bonus >= 0),
  raw_credits bigint not null check (raw_credits >= 0),
  counted_credits bigint not null check (counted_credits >= 0),
  customer_cap bigint not null check (customer_cap >= 0),
  customers integer not null check (customers >= 0),
  capped_customers integer not null check (capped_customers >= 0),
  clawback_owed integer not null check (clawback_owed >= 0),
  clawback_applied integer not null check (clawback_applied >= 0 and clawback_applied <= clawback_owed),
  total integer not null check (total >= 0),
  detail jsonb not null default '{}'::jsonb,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  decision_note text check (length(decision_note) <= 500),
  expired_at timestamptz,
  expired_credits integer check (expired_credits >= 0),
  created_at timestamptz not null default now(),
  unique (org_id, period),
  check ((status = 'pending') = (decided_at is null))
);
-- The pending badge (admin nav and tab) and the month-end expiry run.
create index partner_promo_grants_pending_idx on public.partner_promo_grants(created_at) where status = 'pending';
create index partner_promo_grants_expiry_idx on public.partner_promo_grants(expires_at) where status = 'granted' and expired_at is null;
create index partner_promo_grants_list_idx on public.partner_promo_grants(period desc, id desc);
alter table public.partner_promo_grants enable row level security;
revoke all on public.partner_promo_grants from public, anon, authenticated, service_role;
grant select on public.partner_promo_grants to service_role;

-- The orders a sheet counted (one per payment): rewritten while the sheet is pending, frozen with
-- it. A granted sheet's lines are re-measured every month to find refunds made after confirmation
-- (the clawback), and keep a payment from ever being counted by a second sheet.
create table public.partner_promo_grant_lines (
  grant_id bigint not null references public.partner_promo_grants(id),
  payment_id bigint not null references public.payments(id),
  customer_user_id uuid not null references public.profiles(id),
  credits integer not null check (credits >= 0),
  confirmed_at timestamptz not null,
  primary key (grant_id, payment_id)
);
create index partner_promo_grant_lines_payment_idx on public.partner_promo_grant_lines(payment_id);
alter table public.partner_promo_grant_lines enable row level security;
revoke all on public.partner_promo_grant_lines from public, anon, authenticated, service_role;
grant select on public.partner_promo_grant_lines to service_role;

-- How much of an earlier granted sheet's bonus a later sheet took back (written only when the later
-- sheet is confirmed). What a source still owes is its bonus, minus its bonus re-measured today,
-- minus these rows: an amount a month could not cover is simply still owed the next month.
create table public.partner_promo_clawbacks (
  source_grant_id bigint not null references public.partner_promo_grants(id),
  applied_grant_id bigint not null references public.partner_promo_grants(id),
  credits integer not null check (credits > 0),
  primary key (source_grant_id, applied_grant_id)
);
create index partner_promo_clawbacks_applied_idx on public.partner_promo_clawbacks(applied_grant_id);
alter table public.partner_promo_clawbacks enable row level security;
revoke all on public.partner_promo_clawbacks from public, anon, authenticated, service_role;
grant select on public.partner_promo_clawbacks to service_role;

