-- Same body as 1171 except the Pro/Max check reads effective_tier().
create or replace function public.claim_batch_zip(p_user_id uuid, p_batch_id uuid, p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  state admin.batch_zip_requests;
  at_time timestamptz;
  recent timestamptz[];
  active jsonb;
  result text := 'acquired';
begin
  if coalesce(public.effective_tier(p_user_id), 'starter') not in ('pro', 'max') then return 'upgrade'; end if;
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
revoke all on function public.claim_batch_zip(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_batch_zip(uuid,uuid,uuid) to service_role;
