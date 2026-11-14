-- One bounded state row per user. The profile FK is covered by the primary key.
create table admin.batch_zip_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  request_times timestamptz[] not null default '{}',
  active_batches jsonb not null default '{}'
);
alter table admin.batch_zip_requests enable row level security;
revoke all on admin.batch_zip_requests from public, anon, authenticated;

create function public.claim_batch_zip(p_user_id uuid, p_batch_id uuid, p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  state admin.batch_zip_requests;
  at_time timestamptz;
  recent timestamptz[];
  active jsonb;
  result text := 'acquired';
begin
  if coalesce(public.current_tier(p_user_id), 'starter') not in ('pro', 'max') then return 'upgrade'; end if;
  insert into admin.batch_zip_requests (user_id) values (p_user_id) on conflict do nothing;
  select * into strict state from admin.batch_zip_requests where user_id=p_user_id for update;
  at_time := clock_timestamp();
  recent := array(select t from unnest(state.request_times) t where t > at_time - interval '1 minute');
  if cardinality(recent) >= 3 then return 'limited'; end if;
  select coalesce(jsonb_object_agg(key,value), '{}') into active from jsonb_each(state.active_batches)
    where (value->>'expires')::timestamptz > at_time;
  if active ? p_batch_id::text then
    result := 'packing';
  else
    active := active || jsonb_build_object(p_batch_id::text,
      jsonb_build_object('token', p_token, 'expires', at_time + interval '6 minutes'));
  end if;
  update admin.batch_zip_requests set request_times = array_append(recent,at_time), active_batches = active where user_id=p_user_id;
  return result;
end;
$$;

create function public.release_batch_zip(p_user_id uuid, p_batch_id uuid, p_token uuid)
returns void language sql security definer set search_path = '' as $$
  update admin.batch_zip_requests set active_batches=active_batches-p_batch_id::text
   where user_id=p_user_id and active_batches->p_batch_id::text->>'token'=p_token::text;
$$;

revoke all on function public.claim_batch_zip(uuid,uuid,uuid), public.release_batch_zip(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_batch_zip(uuid,uuid,uuid), public.release_batch_zip(uuid,uuid,uuid) to service_role;
