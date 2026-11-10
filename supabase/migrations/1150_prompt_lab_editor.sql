create function public.admin_save_prompt_lab_version(p_actor uuid,p_session_id uuid,p_version_id uuid,p_mode text,p_prompt text,p_note text)
returns uuid language plpgsql set search_path='' as $$
declare prev public.prompt_lab_versions; new_id uuid; n integer;
begin
  perform admin.require_reference_admin(p_actor);
  perform admin.lock_prompt_lab(p_session_id);
  if p_mode in ('edit','copy') then
    select * into prev from public.prompt_lab_versions where id=p_version_id and session_id=p_session_id;
    if not found then raise exception 'PROMPT_VERSION_NOT_FOUND'; end if;
  elsif p_mode is distinct from 'create' or p_version_id is not null then raise exception 'INVALID_INPUT';
  end if;
  if p_mode='copy' then
    p_prompt:=coalesce(p_prompt,prev.prompt);
    p_note:=coalesce(p_note,prev.note);
  end if;
  if p_prompt is null or length(btrim(p_prompt))=0 or length(p_prompt)>32000 or length(p_note)>2000 then raise exception 'INVALID_INPUT'; end if;
  update public.prompt_lab_sessions set updated_at=now() where id=p_session_id;
  if p_mode='edit' and not exists(select from public.prompt_lab_runs where version_id=p_version_id) then
    update public.prompt_lab_versions set prompt=p_prompt,note=p_note where id=p_version_id;
    return p_version_id;
  end if;
  select coalesce(max(version_no),0)+1 into n from public.prompt_lab_versions where session_id=p_session_id;
  insert into public.prompt_lab_versions(session_id,version_no,prompt,note,created_by)
    values(p_session_id,n,p_prompt,p_note,p_actor) returning id into new_id;
  return new_id;
end $$;

create function public.admin_set_prompt_lab_reverse(p_actor uuid,p_model text,p_instruction text) returns void
language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  if p_model is null or p_instruction is null or length(p_model)>300 or length(p_instruction)>32000
    or (btrim(p_model)='')<>(btrim(p_instruction)='') then raise exception 'INVALID_INPUT'; end if;
  insert into public.system_settings(key,value,updated_by) values('prompt_lab_reverse',
    jsonb_build_object('model',btrim(p_model),'instruction',btrim(p_instruction)),p_actor)
    on conflict(key) do update set value=excluded.value,updated_by=p_actor,updated_at=now();
end $$;

create function public.admin_mark_prompt_lab_run(p_actor uuid,p_session_id uuid,p_run_id uuid,p_starred boolean,p_is_best boolean)
returns void language plpgsql set search_path='' as $$
begin
  perform admin.require_reference_admin(p_actor);
  perform admin.lock_prompt_lab(p_session_id);
  perform 1 from public.prompt_lab_runs where id=p_run_id and session_id=p_session_id and status='succeeded' for update;
  if not found then raise exception 'PROMPT_RUN_NOT_FOUND'; end if;
  if p_is_best then update public.prompt_lab_runs set is_best=false where session_id=p_session_id and is_best and id<>p_run_id; end if;
  update public.prompt_lab_runs set starred=coalesce(p_starred,starred),is_best=coalesce(p_is_best,is_best) where id=p_run_id;
end $$;
revoke all on function public.admin_save_prompt_lab_version(uuid,uuid,uuid,text,text,text),
  public.admin_set_prompt_lab_reverse(uuid,text,text),public.admin_mark_prompt_lab_run(uuid,uuid,uuid,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.admin_save_prompt_lab_version(uuid,uuid,uuid,text,text,text),
  public.admin_set_prompt_lab_reverse(uuid,text,text),public.admin_mark_prompt_lab_run(uuid,uuid,uuid,boolean,boolean) to service_role;
