-- Unclaimed entries cannot have reached a provider. A timed-out claimed entry retains
-- its quote until a confirmed receipt is available, even if its source is removed.
create function public.admin_expire_prompt_lab_runs(p_actor uuid) returns void language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  with expired as (
    update public.prompt_lab_runs set status='failed',error_code='TIMEOUT',finished_at=now()
      where (status='queued' and (started_at<now()-interval '10 minutes'
        or (started_at at time zone 'Asia/Shanghai')::date<(now() at time zone 'Asia/Shanghai')::date))
      or (status='running' and claimed_at<now()-interval '10 minutes')
      returning id,claimed_at
  )
  update public.admin_test_spend s set counted_usd=case when e.claimed_at is null then 0 else s.estimate_usd end,finished_at=now()
    from expired e where s.run_id=e.id;
  with expired as (
    update public.prompt_lab_reverse_requests set status='failed',error_code='TIMEOUT',finished_at=now()
      where status='running' and started_at<now()-interval '10 minutes' returning id
  )
  update public.admin_test_spend s set finished_at=now() from expired e where s.run_id=e.id;
end $$;
revoke all on function public.admin_expire_prompt_lab_runs(uuid) from public,anon,authenticated;
grant execute on function public.admin_expire_prompt_lab_runs(uuid) to service_role;

alter table public.reference_object_deletions drop constraint reference_object_deletions_r2_key_check,
  add constraint reference_object_deletions_r2_key_check check (
    r2_key ~ '^references/[a-f0-9-]{36}\.webp$' or r2_key ~ '^prompt-lab/outputs/[a-f0-9-]{36}\.png$'
  );

create function admin.queue_prompt_lab_output() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status in ('running','queued') then raise exception 'PROMPT_LAB_BUSY'; end if;
  if old.claimed_at is not null then
    -- Queue the deterministic key even when the worker wrote R2 but failed to finish.
    insert into public.reference_object_deletions(r2_key) values('prompt-lab/outputs/'||old.id::text||'.png')
      on conflict do nothing;
  end if;
  return old;
end $$;
create trigger prompt_lab_output_removal before delete on public.prompt_lab_runs for each row execute function admin.queue_prompt_lab_output();
revoke all on function admin.queue_prompt_lab_output() from public,anon,authenticated;
grant execute on function admin.queue_prompt_lab_output() to service_role;

create function admin.protect_reverse_request() returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='running' then raise exception 'PROMPT_LAB_BUSY'; end if;
  return old;
end $$;
create trigger prompt_lab_reverse_removal before delete on public.prompt_lab_reverse_requests for each row execute function admin.protect_reverse_request();
revoke all on function admin.protect_reverse_request() from public,anon,authenticated;
grant execute on function admin.protect_reverse_request() to service_role;

create or replace function public.admin_cleanup_test_runs(p_actor uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_run_keys text[];
  v_photo_keys text[];
begin
  if p_actor is null or not exists (select 1 from public.profiles p where p.id = p_actor and p.role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;

  perform public.admin_expire_prompt_lab_runs(p_actor);
  update public.admin_test_runs r
     set status = 'failed', error_code = 'TIMEOUT', finished_at = now()
   where r.status = 'running' and r.created_at < now() - interval '10 minutes';
  update public.admin_test_spend x
     set counted_usd = 0, finished_at = now()
   where x.counted_usd is null and x.started_at < now() - interval '10 minutes';
  delete from public.admin_test_spend x where x.started_at < now() - interval '100 days';

  with ranked as (
    select r.id, r.created_at, r.cover_set_at,
           row_number() over (partition by r.template_id order by r.created_at desc, r.id desc) as n
      from public.admin_test_runs r
  ),
  doomed as (
    delete from public.admin_test_runs r
     using ranked k
     where r.id = k.id
       and k.cover_set_at is null
       and (k.created_at < now() - interval '30 days' or k.n > 50)
    returning r.output_key
  )
  select coalesce(array_agg(d.output_key) filter (where d.output_key is not null), '{}') into v_run_keys from doomed d;

  with doomed as (
    delete from public.admin_test_photos ph
     where ph.last_used_at < now() - interval '30 days'
       and not exists (select 1 from public.prompt_lab_runs l where l.photo_id=ph.id)
       and not exists (select 1 from public.admin_test_runs r where r.photo_id = ph.id and r.cover_set_at is not null)
    returning ph.object_key
  )
  select coalesce(array_agg(d.object_key), '{}') into v_photo_keys from doomed d;

  return jsonb_build_object('keys', to_jsonb(v_run_keys || v_photo_keys));
end;
$$;


create or replace function public.admin_remove_test_assets(p_actor uuid,p_kind text,p_ids uuid[],p_expected int default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare affected int; usage_count int; running boolean; keys text[];
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 then raise exception 'INVALID_INPUT'; end if;
  if p_kind='photo' then
    perform 1 from public.admin_test_photos where id=any(p_ids) order by id for update;
    if exists(select from public.prompt_lab_runs where photo_id=any(p_ids)) then raise exception 'PHOTO_IN_PROMPT_LAB'; end if;
    select count(*),array_agg(object_key) into affected,keys from public.admin_test_photos where id=any(p_ids);
    -- The photo locks conflict with the FK's key-share lock when a run starts.
    -- Check again in this transaction after waiting for any such start to commit.
    select count(*), bool_or(status='running') into usage_count,running
      from public.admin_test_runs where photo_id=any(p_ids);
    if running then raise exception 'PHOTO_IN_RUNNING_TEST'; end if;
  elsif p_kind='run' then
    perform 1 from public.admin_test_runs where id=any(p_ids) order by id for update;
    select count(*), count(cover_set_at),bool_or(status='running'),array_agg(output_key) filter(where output_key is not null)
      into affected,usage_count,running,keys from public.admin_test_runs where id=any(p_ids);
    if running then raise exception 'RUNNING_TEST'; end if;
  else raise exception 'INVALID_INPUT'; end if;
  if p_expected is not null then
    if p_expected<>usage_count then raise exception 'USAGE_CHANGED'; end if;
    if p_kind='photo' then delete from public.admin_test_photos where id=any(p_ids);
    else delete from public.admin_test_runs where id=any(p_ids); end if;
  end if;
  return jsonb_build_object('count',affected,'uses',usage_count,'keys',coalesce(keys,'{}'));
end;
$$;

create function public.admin_open_prompt_lab(p_actor uuid,p_asset_id uuid) returns uuid
language plpgsql set search_path='' as $$
declare session_id uuid; asset_status text;
begin
  perform admin.require_reference_admin(p_actor);
  select status into asset_status from public.reference_assets where id=p_asset_id for update;
  if not found then raise exception 'REFERENCE_NOT_FOUND'; end if;
  select id into session_id from public.prompt_lab_sessions where asset_id=p_asset_id;
  if found then
    perform public.admin_expire_prompt_lab_runs(p_actor);
    return session_id;
  end if;
  if asset_status<>'active' then raise exception 'REFERENCE_ARCHIVED'; end if;
  insert into public.prompt_lab_sessions(asset_id,created_by) values(p_asset_id,p_actor) returning id into session_id;
  return session_id;
end $$;
revoke all on function public.admin_open_prompt_lab(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_open_prompt_lab(uuid,uuid) to service_role;


create or replace function public.admin_bulk_reference_assets(p_actor uuid,p_ids uuid[],p_action text,p_value jsonb default null)
returns integer language plpgsql set search_path='' as $$
declare n integer; labels text[]; dest text;
begin
  perform admin.require_reference_admin(p_actor);
  if p_ids is null or cardinality(p_ids) not between 1 and 200
    or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  perform 1 from public.reference_assets where id=any(p_ids) order by id for update;
  get diagnostics n=row_count;
  if n<>cardinality(p_ids) then raise exception 'REFERENCE_NOT_FOUND'; end if;
  case p_action
    when 'move' then
      dest:=p_value #>> '{}';
      update public.reference_assets set category_id=dest where id=any(p_ids);
    when 'add_tags','remove_tags' then
      if jsonb_typeof(p_value) is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
      labels:=array(select jsonb_array_elements_text(p_value));
      if cardinality(labels)=0 or not admin.reference_tags_valid(labels) then raise exception 'INVALID_INPUT'; end if;
      update public.reference_assets r set tags=case when p_action='add_tags' then
          array(select distinct t from unnest(r.tags||labels) t order by t)
        else array(select t from unnest(r.tags) t where not(t=any(labels))) end
      where id=any(p_ids);
    when 'archive' then
      update public.reference_assets set status='archived',archived_at=coalesce(archived_at,now()) where id=any(p_ids);
    when 'restore' then
      update public.reference_assets set status='active',archived_at=null where id=any(p_ids);
    when 'delete' then
      -- Reverse completion locks its session before its receipt; keep the same order.
      perform 1 from public.prompt_lab_sessions where asset_id=any(p_ids) order by id for update;
      perform public.admin_expire_prompt_lab_runs(p_actor);
      if exists(select from public.reference_assets where id=any(p_ids) and status<>'archived') then
        raise exception 'REFERENCE_NOT_ARCHIVED';
      end if;
      insert into public.reference_object_deletions(r2_key)
        select r2_key from public.reference_assets where id=any(p_ids);
      delete from public.reference_assets where id=any(p_ids);
    else raise exception 'INVALID_INPUT';
  end case;
  return n;
end $$;
