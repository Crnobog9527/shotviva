create function public.admin_edit_reference_asset(p_actor uuid,p_id uuid,p_fields jsonb) returns void
language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  if jsonb_typeof(p_fields) is distinct from 'object'
    or p_fields - array['category_id','source_url','note','tags'] <> '{}'::jsonb then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  update public.reference_assets set
    category_id=case when p_fields?'category_id' then p_fields->>'category_id' else category_id end,
    source_url=case when p_fields?'source_url' then p_fields->>'source_url' else source_url end,
    note=case when p_fields?'note' then p_fields->>'note' else note end,
    tags=case when p_fields?'tags' then array(select jsonb_array_elements_text(p_fields->'tags')) else tags end
  where id=p_id;
  if not found then raise exception 'REFERENCE_NOT_FOUND'; end if;
end $$;

create function public.admin_bulk_reference_assets(p_actor uuid,p_ids uuid[],p_action text,p_value jsonb default null)
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
revoke all on function public.admin_edit_reference_asset(uuid,uuid,jsonb),public.admin_bulk_reference_assets(uuid,uuid[],text,jsonb)
  from public,anon,authenticated;
grant execute on function public.admin_edit_reference_asset(uuid,uuid,jsonb),public.admin_bulk_reference_assets(uuid,uuid[],text,jsonb)
  to service_role;
