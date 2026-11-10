-- Competing uploads never write the same R2 key; only one digest winner stays live.
create function public.admin_register_reference_asset(p_actor uuid,p_asset jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  candidate uuid := (p_asset->>'id')::uuid;
  k text := 'references/'||candidate::text||'.webp';
  result public.reference_assets;
  duplicate boolean;
begin
  perform admin.require_reference_admin(p_actor);
  perform pg_advisory_xact_lock_shared(hashtextextended('shotviva.category_tree',0));
  perform 1 from public.reference_object_deletions where r2_key=k and created_at>clock_timestamp() for update;
  if not found then
    select id,status into result.id,result.status from public.reference_assets
      where id=candidate and sha256=p_asset->>'sha256' and created_by=p_actor;
    if not found then raise exception 'REFERENCE_UPLOAD_EXPIRED'; end if;
    return jsonb_build_object('id',result.id,'status',result.status,'duplicate',false);
  end if;
  -- Lock digest before looking up the existing row, including while an archive is permanently removed.
  perform pg_advisory_xact_lock(hashtextextended('shotviva.reference.'||(p_asset->>'sha256'),0));
  select id,status into result.id,result.status from public.reference_assets where sha256=p_asset->>'sha256' for share;
  duplicate := found;
  if duplicate then
    update public.reference_object_deletions set created_at=now() where r2_key=k;
  else
    insert into public.reference_assets(id,category_id,r2_key,width,height,bytes,sha256,source_url,note,tags,created_by)
    values(candidate,p_asset->>'category_id',k,(p_asset->>'width')::int,(p_asset->>'height')::int,
      (p_asset->>'bytes')::int,p_asset->>'sha256',p_asset->>'source_url',p_asset->>'note',
      array(select jsonb_array_elements_text(p_asset->'tags')),p_actor)
    returning id,status into result.id,result.status;
    delete from public.reference_object_deletions where r2_key=k;
  end if;
  return jsonb_build_object('id',result.id,'status',result.status,'duplicate',duplicate);
end $$;
revoke all on function public.admin_register_reference_asset(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_register_reference_asset(uuid,jsonb) to service_role;
