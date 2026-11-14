-- Request receipts contain metadata only. The instruction lives in the private setting;
-- the generated text lives once in its version row.
create table public.prompt_lab_reverse_requests (
  id uuid primary key,
  session_id uuid not null references public.prompt_lab_sessions(id) on delete cascade,
  model text not null,
  version_id uuid references public.prompt_lab_versions(id) on delete set null,
  status text not null default 'running' check(status in ('running','succeeded','failed')),
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_code text
);
create index prompt_lab_reverse_session on public.prompt_lab_reverse_requests(session_id);
create index prompt_lab_reverse_version on public.prompt_lab_reverse_requests(version_id) where version_id is not null;
create index prompt_lab_reverse_actor on public.prompt_lab_reverse_requests(created_by) where created_by is not null;
create index prompt_lab_reverse_pending on public.prompt_lab_reverse_requests(started_at) where status='running';
alter table public.prompt_lab_reverse_requests enable row level security;
revoke all on public.prompt_lab_reverse_requests from public,anon,authenticated;
grant select,insert,update,delete on public.prompt_lab_reverse_requests to service_role;

create function public.admin_begin_prompt_lab_reverse(p_actor uuid,p_session_id uuid,p_request_id uuid,p_model text,
  p_estimate_usd numeric,p_setting_model text,p_instruction text) returns jsonb
language plpgsql set search_path='' as $$
declare req public.prompt_lab_reverse_requests; settings jsonb; quoted numeric:=round(p_estimate_usd,6);
begin
  perform admin.require_reference_admin(p_actor);
  perform admin.lock_prompt_lab(p_session_id);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,101));
  select * into req from public.prompt_lab_reverse_requests where id=p_request_id;
  if found then
    if req.session_id<>p_session_id or req.model is distinct from p_model or req.created_by is distinct from p_actor then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('claimed',false,'status',req.status,'version_id',req.version_id);
  end if;
  select value into settings from public.system_settings where key='prompt_lab_reverse' for share;
  if settings->>'model' is distinct from p_setting_model or settings->>'instruction' is distinct from p_instruction
    or nullif(btrim(p_setting_model),'') is null or nullif(btrim(p_instruction),'') is null
    or p_model is null or length(btrim(p_model)) not between 1 and 300 then raise exception 'PROMPT_LAB_SETTINGS_CHANGED'; end if;
  perform admin.reserve_prompt_lab_budget(quoted);
  insert into public.prompt_lab_reverse_requests(id,session_id,model,created_by) values(p_request_id,p_session_id,p_model,p_actor);
  insert into public.admin_test_spend(run_id,provider,estimate_usd,counted_usd,has_openrouter)
    values(p_request_id,p_model,quoted,quoted,exists(select from public.ai_providers
      where id::text=p_setting_model and rtrim(base_url,'/')='https://openrouter.ai/api/v1'));
  return jsonb_build_object('claimed',true,'status','running','version_id',null);
end $$;

create function public.admin_finish_prompt_lab_reverse(p_actor uuid,p_request_id uuid,p_prompt text,p_error_code text,
  p_cost_usd numeric,p_submitted boolean) returns jsonb language plpgsql set search_path='' as $$
declare req public.prompt_lab_reverse_requests; n integer;
begin
  perform admin.require_reference_admin(p_actor);
  if p_prompt is not null and (length(p_prompt) not between 1 and 32000 or length(btrim(p_prompt))=0)
    or p_cost_usd<0 or p_submitted is null then raise exception 'INVALID_INPUT'; end if;
  select * into req from public.prompt_lab_reverse_requests where id=p_request_id;
  if not found or req.created_by is distinct from p_actor then raise exception 'PROMPT_REQUEST_NOT_FOUND'; end if;
  perform 1 from public.prompt_lab_sessions where id=req.session_id for update;
  select * into req from public.prompt_lab_reverse_requests where id=p_request_id for update;
  if not found then raise exception 'PROMPT_REQUEST_NOT_FOUND'; end if;
  if req.status='running' or req.error_code='TIMEOUT' then
    if p_prompt is not null then
      select coalesce(max(version_no),0)+1 into n from public.prompt_lab_versions where session_id=req.session_id;
      insert into public.prompt_lab_versions(session_id,version_no,prompt,created_by) values(req.session_id,n,p_prompt,p_actor)
        returning id into req.version_id;
      update public.prompt_lab_sessions set updated_at=now() where id=req.session_id;
    end if;
    req.status:=case when p_prompt is null then 'failed' else 'succeeded' end;
    update public.prompt_lab_reverse_requests set status=req.status,version_id=req.version_id,
      error_code=case when req.status='failed' then coalesce(p_error_code,'GENERATION_FAILED') end,finished_at=now() where id=req.id;
    update public.admin_test_spend set cost_usd=p_cost_usd,counted_usd=coalesce(p_cost_usd,
      case when p_submitted or p_prompt is not null then estimate_usd else 0 end),finished_at=now() where run_id=req.id;
  end if;
  return jsonb_build_object('status',req.status,'version_id',req.version_id);
end $$;
revoke all on function public.admin_begin_prompt_lab_reverse(uuid,uuid,uuid,text,numeric,text,text),
  public.admin_finish_prompt_lab_reverse(uuid,uuid,text,text,numeric,boolean) from public,anon,authenticated;
grant execute on function public.admin_begin_prompt_lab_reverse(uuid,uuid,uuid,text,numeric,text,text),
  public.admin_finish_prompt_lab_reverse(uuid,uuid,text,text,numeric,boolean) to service_role;
