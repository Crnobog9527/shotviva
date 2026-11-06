-- T27: in-site support tickets (ARCHITECTURE §10 「站内工单」, docs/proposals/admin-roadmap.md A8).
-- Users read their own tickets through RLS; every write goes through the service-role functions
-- in 0221 / 0222 / 0223. A refund request is one ordinary ticket type, decided by hand: nothing
-- here moves money.
--
-- Status: open (waiting for the Owner) -> replied (the Owner answered) -> closed. A user's
-- message puts any ticket back to open.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  -- Deleting an account deletes its tickets (the privacy policy says so).
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('feedback', 'image_issue', 'billing', 'refund', 'account', 'other')),
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  -- Both must be the author's own (checked by create_support_ticket). No ON DELETE action on the
  -- payment: payments only disappear with the account, whose cascade removes the ticket in the
  -- same statement, so the end-of-statement check never fires.
  payment_id bigint references public.payments (id),
  -- If the work's row is ever removed, the ticket stays without it.
  job_id uuid references public.generation_jobs (id) on delete set null,
  refund_decision text check (refund_decision in ('approved', 'rejected')),
  refund_amount_cents integer check (refund_amount_cents > 0),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  -- When the author last looked at the ticket. Their own messages set it too, so "unread" is
  -- simply last_message_at > user_seen_at: only an Owner message can move past it.
  user_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint support_tickets_refund_payment check (type <> 'refund' or payment_id is not null),
  constraint support_tickets_payment_type check (payment_id is null or type in ('billing', 'refund')),
  constraint support_tickets_job_type check (job_id is null or type = 'image_issue'),
  constraint support_tickets_decision_type check (refund_decision is null or type = 'refund'),
  constraint support_tickets_decision_amount check (
    (refund_decision = 'approved') = (refund_amount_cents is not null)
  ),
  constraint support_tickets_closed check ((status = 'closed') = (closed_at is not null))
);

-- My tickets (keyset on created_at, id), the unread dot, the 5-per-24h limit and the
-- account-deletion cascade on user_id.
create index support_tickets_user_id_created_at_idx
  on public.support_tickets (user_id, created_at desc, id desc);

-- The admin's open list (keyset on last_message_at, id), the nav count and the overview to-do.
create index support_tickets_open_last_message_idx
  on public.support_tickets (last_message_at desc, id desc)
  where status = 'open';

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author text not null check (author in ('user', 'admin')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- A ticket's thread in order; also the cascade from support_tickets.
create index support_ticket_messages_ticket_id_created_at_idx
  on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

-- Flat ownership checks (AGENTS §5.1 rule 7). Messages have no user_id of their own, so they
-- follow their ticket: one lookup by primary key through the policy above.
create policy "support_tickets_select_own" on public.support_tickets
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "support_ticket_messages_select_own" on public.support_ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
       where t.id = ticket_id and t.user_id = (select auth.uid())
    )
  );

revoke all on public.support_tickets from anon, authenticated, service_role;
revoke all on public.support_ticket_messages from anon, authenticated, service_role;
grant select on public.support_tickets to authenticated, service_role;
grant select on public.support_ticket_messages to authenticated, service_role;
