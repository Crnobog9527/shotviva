-- created_at is when cleanup may start. Reserve a future row before the R2 write so even
-- a crashed upload can be collected; registering a successful upload cancels that row.
create table public.reference_object_deletions (
  r2_key text primary key check (r2_key ~ '^references/[a-f0-9-]{36}\.webp$'),
  created_at timestamptz not null default now()
);
create index reference_deletions_ready on public.reference_object_deletions(created_at,r2_key);
alter table public.reference_object_deletions enable row level security;
revoke all on public.reference_object_deletions from public,anon,authenticated;
grant select,insert,update,delete on public.reference_object_deletions to service_role;

create function public.admin_reserve_reference_upload(p_actor uuid,p_id uuid) returns void
language plpgsql set search_path='' as $$
declare k text := 'references/'||p_id::text||'.webp';
begin
  perform admin.require_reference_admin(p_actor);
  if p_id is null or exists(select from public.reference_assets where id=p_id) then raise exception 'INVALID_INPUT'; end if;
  insert into public.reference_object_deletions(r2_key,created_at) values(k,now()+interval '1 hour');
end $$;

create function public.admin_ack_reference_deletions(p_actor uuid,p_keys text[]) returns void
language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  delete from public.reference_object_deletions where r2_key=any(p_keys) and created_at<=clock_timestamp();
end $$;
revoke all on function public.admin_reserve_reference_upload(uuid,uuid),public.admin_ack_reference_deletions(uuid,text[])
  from public,anon,authenticated;
grant execute on function public.admin_reserve_reference_upload(uuid,uuid),public.admin_ack_reference_deletions(uuid,text[])
  to service_role;

-- A confirming transaction may already own an unexpired reservation and cross its expiry
-- before commit. Skip its row instead of observing the old timestamp and deleting its image.
create function public.admin_due_reference_deletions(p_actor uuid) returns table(r2_key text)
language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  return query select d.r2_key from public.reference_object_deletions d
    where d.created_at<=clock_timestamp() order by d.created_at,d.r2_key limit 200 for update skip locked;
end $$;
revoke all on function public.admin_due_reference_deletions(uuid) from public,anon,authenticated;
grant execute on function public.admin_due_reference_deletions(uuid) to service_role;
