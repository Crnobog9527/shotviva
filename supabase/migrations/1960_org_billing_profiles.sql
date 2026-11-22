-- Enterprise invoice title (开票信息, ARCHITECTURE §6.5): the company legal name and tax ID that
-- Waffo puts on the invoice when the org's primary admin buys on Shotviva. One row per org, so
-- it follows the org: whoever is orgs.owner_user_id now reads and edits it, a former owner does
-- not. Private like every org table: RLS on, no policy, clients have no grant; the service role
-- only reads, and writes go through the 1961 functions, which check the owner themselves.
create table public.org_billing_profiles (
  org_id uuid primary key references public.orgs(id),
  legal_name text not null check (length(legal_name) between 2 and 200 and legal_name = btrim(legal_name) and legal_name !~ '[[:cntrl:]]'),
  tax_id text not null check (tax_id ~ '^[0-9A-Z][0-9A-Z./-]{2,39}$'),
  country text not null default 'CN' check (country ~ '^[A-Z]{2}$'),
  postcode text check (postcode ~ '^[0-9A-Za-z][0-9A-Za-z -]{0,15}$'),
  state text check (length(state) between 1 and 80 and state = btrim(state) and state !~ '[[:cntrl:]]'),
  invoice_email text check (length(invoice_email) <= 254 and invoice_email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'),
  updated_at timestamptz not null default now(),
  -- set null, so deleting a former owner's account never fails on this row.
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.org_billing_profiles enable row level security;
revoke all on public.org_billing_profiles from public, anon, authenticated, service_role;
grant select on public.org_billing_profiles to service_role;

-- Every save and clear, with what was saved, so a disputed invoice title can be traced to who
-- set it and when. Written only by the 1961 functions, in the same transaction as the change.
create table public.org_billing_profile_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  actor uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('save', 'clear')),
  profile jsonb,
  created_at timestamptz not null default now(),
  constraint org_billing_profile_events_profile check ((action = 'save') = (profile is not null))
);
create index org_billing_profile_events_org_idx on public.org_billing_profile_events(org_id, created_at desc, id desc);
alter table public.org_billing_profile_events enable row level security;
revoke all on public.org_billing_profile_events from public, anon, authenticated, service_role;
grant select on public.org_billing_profile_events to service_role;
revoke all on sequence public.org_billing_profile_events_id_seq from public, anon, authenticated, service_role;
