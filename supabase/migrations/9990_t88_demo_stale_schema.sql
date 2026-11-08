-- T88 demo only (PR never merged): a migration committed without regenerating schema.sql.
create table public.t88_demo (id bigint primary key);
alter table public.t88_demo enable row level security;
