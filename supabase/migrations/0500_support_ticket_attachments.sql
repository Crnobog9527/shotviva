-- T69: images on support tickets (ARCHITECTURE §10 「站内工单」→「可以附图片」). Up to 3 per message,
-- from the author or the Owner. The files live in the private bucket under
-- tickets/<ticket author>/<ticket>/<id>.webp, written by the server after it re-encoded the upload
-- (EXIF gone); a row here only names the file. Users read their own rows through RLS like the
-- messages; every write goes through the service-role functions in 0501 / 0502.

create table public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_ticket_messages (id) on delete cascade,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  -- The functions also check that the two ids in the key are the ticket's author and the ticket.
  object_key text not null unique
    check (object_key ~ '^tickets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'),
  content_type text not null check (content_type = 'image/webp'),
  bytes integer not null check (bytes between 1 and 10485760),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  created_at timestamptz not null default now()
);

-- A thread's images (embedded under each message) and the cascade from messages.
create index support_ticket_attachments_message_id_idx
  on public.support_ticket_attachments (message_id);

-- The RLS check and the cascade from tickets.
create index support_ticket_attachments_ticket_id_idx
  on public.support_ticket_attachments (ticket_id);

alter table public.support_ticket_attachments enable row level security;

-- Same flat check as support_ticket_messages_select_own (AGENTS §5.1 rule 7): one lookup of the
-- ticket by primary key.
create policy "support_ticket_attachments_select_own" on public.support_ticket_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
       where t.id = ticket_id and t.user_id = (select auth.uid())
    )
  );

revoke all on public.support_ticket_attachments from anon, authenticated, service_role;
grant select on public.support_ticket_attachments to authenticated, service_role;
