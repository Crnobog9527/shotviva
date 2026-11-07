-- T83: saved templates (ARCHITECTURE §5.1b). One row per account and template; each user reads
-- and writes only their own rows through RLS, so the toggle is one insert or delete on the
-- user's own session (AGENTS §5.1 item 1). The cap and the "only live templates" rule sit in the
-- trigger of 0741, so no write path can skip them.
--
-- Rows outlive a template being unpublished or made partner-only (the read joins the live
-- catalogue, so it simply drops out and comes back when republished); deleting the template or
-- the account deletes them.

create table public.template_favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  template_id text not null references public.templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Also serves "my favorites" (where user_id = ...) and the account-deletion cascade; at most
  -- 200 rows per user, so newest-first is sorted from this scan.
  primary key (user_id, template_id)
);

-- The cascade when a template is deleted.
create index template_favorites_template_id_idx on public.template_favorites (template_id);

alter table public.template_favorites enable row level security;

create policy "template_favorites_select_own" on public.template_favorites
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "template_favorites_insert_own" on public.template_favorites
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "template_favorites_delete_own" on public.template_favorites
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No update: a favorite is either there or not. anon gets nothing.
revoke all on public.template_favorites from anon, authenticated;
grant select, insert, delete on public.template_favorites to authenticated;
