-- expect: bulk-update, set-not-null
-- A backfill that also rewrites an existing column, and not null on an existing column, still fail
-- even when the file adds a column of its own.
alter table public.templates add column category_key text;
update public.templates set category_key = lower(category), category = upper(category);
alter table public.templates alter column category set not null;
