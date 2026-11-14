-- Keep spend and published covers independent of short-lived trial assets.
alter table public.admin_test_runs add column photo_deleted boolean not null default false;

create function admin.mark_deleted_test_photo() returns trigger language plpgsql set search_path='' as $$
begin
  new.photo_deleted:=true;
  return new;
end;
$$;
revoke all on function admin.mark_deleted_test_photo() from public,anon,authenticated,service_role;
create trigger test_photo_deleted before update of photo_id on public.admin_test_runs
for each row when (old.photo_id is not null and new.photo_id is null) execute function admin.mark_deleted_test_photo();

-- A failed object-store deletion can be retried after its database row is gone.
create table public.admin_test_asset_removals (object_key text primary key);
alter table public.admin_test_asset_removals enable row level security;
revoke all on public.admin_test_asset_removals from public,anon,authenticated,service_role;
grant select,delete on public.admin_test_asset_removals to service_role;

create function admin.queue_test_asset_removal() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;
begin
  if tg_table_name='admin_test_photos' then k:=old.object_key; else k:=old.output_key; end if;
  if k is not null then insert into public.admin_test_asset_removals values(k) on conflict do nothing; end if;
  return null;
end;
$$;
revoke all on function admin.queue_test_asset_removal() from public,anon,authenticated,service_role;
create trigger removed_test_photo after delete on public.admin_test_photos
for each row execute function admin.queue_test_asset_removal();
create trigger removed_test_result after delete on public.admin_test_runs
for each row execute function admin.queue_test_asset_removal();

-- Null expected count means preview. Confirmation locks the same rows and checks
-- the count again, so a new reference or cover between clicks requires a new confirmation.
create function public.admin_remove_test_assets(p_actor uuid,p_kind text,p_ids uuid[],p_expected int default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare affected int; usage_count int; running boolean; keys text[];
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 then raise exception 'INVALID_INPUT'; end if;
  if p_kind='photo' then
    perform 1 from public.admin_test_photos where id=any(p_ids) order by id for update;
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
revoke all on function public.admin_remove_test_assets(uuid,text,uuid[],int) from public,anon,authenticated;
grant execute on function public.admin_remove_test_assets(uuid,text,uuid[],int) to service_role;
