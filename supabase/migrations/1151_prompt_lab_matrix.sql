-- The T85 ledger outlives runs. Prompt lab entries precede the creation of any template.
alter table public.admin_test_spend alter column template_id drop not null;

create function admin.reserve_prompt_lab_budget(p_total numeric) returns void
language plpgsql set search_path='' as $$
declare budget jsonb;
begin
  if p_total is null or p_total<=0 or p_total>=10000 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtext('shotviva.admin_test_budget'));
  budget:=public.admin_test_budget_status();
  if (budget->>'spent_usd')::numeric+p_total>(budget->>'budget_usd')::numeric then raise exception 'TEST_BUDGET_EXCEEDED'; end if;
end $$;
revoke all on function admin.reserve_prompt_lab_budget(numeric) from public,anon,authenticated;
grant execute on function admin.reserve_prompt_lab_budget(numeric) to service_role;

create function public.admin_begin_prompt_lab_matrix(p_actor uuid,p_session_id uuid,p_batch_id uuid,p_photos uuid[],p_versions uuid[],
  p_model text,p_resolution text,p_quality text,p_use_style_reference boolean,p_estimate_usd numeric)
returns jsonb language plpgsql set search_path='' as $$
declare cells integer; quoted numeric:=round(p_estimate_usd,6); result jsonb; photo_count integer;
begin
  perform admin.require_reference_admin(p_actor);
  cells:=cardinality(p_photos)*cardinality(p_versions);
  if cells is null or cells not between 1 and 12 or p_batch_id is null or p_model is null or length(btrim(p_model)) not between 1 and 300
    or p_resolution is null or p_resolution not in ('1k','2k','3k') or p_quality is null or p_quality not in ('medium','high')
    or p_use_style_reference is null or quoted is null or quoted<=0 or quoted>=10000
    or cardinality(p_photos)<>(select count(distinct id) from unnest(p_photos) id)
    or cardinality(p_versions)<>(select count(distinct id) from unnest(p_versions) id) then raise exception 'INVALID_INPUT'; end if;
  perform admin.lock_prompt_lab(p_session_id);
  perform pg_advisory_xact_lock(hashtextextended(p_batch_id::text,101));
  if exists(select from public.prompt_lab_runs where batch_id=p_batch_id) then
    if cells<>(select count(*) from public.prompt_lab_runs where batch_id=p_batch_id) or exists(
      select from public.prompt_lab_runs r where batch_id=p_batch_id and (
        session_id<>p_session_id or created_by is distinct from p_actor or model<>p_model or resolution<>p_resolution or quality<>p_quality
        or use_style_reference<>p_use_style_reference or estimate_usd<>quoted or photo_id<>p_photos[1+(ordinal-1)/cardinality(p_versions)]
        or version_id<>p_versions[1+(ordinal-1)%cardinality(p_versions)]))
      then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  else
    if cardinality(p_versions)<>(select count(*) from public.prompt_lab_versions where session_id=p_session_id and id=any(p_versions))
      then raise exception 'PROMPT_VERSION_NOT_FOUND'; end if;
    -- Lock rows in ID order against test-photo cleanup and simultaneous batches.
    perform 1 from public.admin_test_photos where id=any(p_photos) order by id for update;
    get diagnostics photo_count=row_count;
    if photo_count<>cardinality(p_photos) then raise exception 'TEST_PHOTO_NOT_FOUND'; end if;
    perform admin.reserve_prompt_lab_budget(quoted*cells);
    with batch as (
      insert into public.prompt_lab_runs(session_id,batch_id,ordinal,photo_id,version_id,model,resolution,quality,
        use_style_reference,estimate_usd,created_by)
      select p_session_id,p_batch_id,(ph.n-1)*cardinality(p_versions)+v.n,ph.id,v.id,p_model,p_resolution,p_quality,
        p_use_style_reference,quoted,p_actor from unnest(p_photos) with ordinality ph(id,n)
          cross join unnest(p_versions) with ordinality v(id,n)
      returning id
    )
    insert into public.admin_test_spend(run_id,estimate_usd,provider)
      select id,quoted,p_model from batch;
    update public.admin_test_photos set last_used_at=now() where id=any(p_photos);
    update public.prompt_lab_sessions set updated_at=now() where id=p_session_id;
  end if;
  select jsonb_agg(jsonb_build_object('id',id,'photo_id',photo_id,'version_id',version_id,'status',status) order by ordinal)
    into result from public.prompt_lab_runs where batch_id=p_batch_id;
  return result;
end $$;
revoke all on function public.admin_begin_prompt_lab_matrix(uuid,uuid,uuid,uuid[],uuid[],text,text,text,boolean,numeric) from public,anon,authenticated;
grant execute on function public.admin_begin_prompt_lab_matrix(uuid,uuid,uuid,uuid[],uuid[],text,text,text,boolean,numeric) to service_role;
