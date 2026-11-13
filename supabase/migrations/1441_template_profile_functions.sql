-- Provider profiles (1440): saving the profile that is not live, and switching which one is live.
--
-- * admin_save_template_profile: writes only the inactive profile (a new tagged prompt version and
--   its row). The live columns, the catalogue and every job are untouched. The live profile is
--   edited with the normal template save (the mirror keeps its row), so this refuses it.
-- * admin_switch_template_profiles: per template, the target profile's prompt version is restored
--   into template_prompts (same version number: switching back and forth mints no versions), and
--   its quality, prices and unpriced tiers into templates / template_sale_approvals, through the
--   same rows and the same deferred checks as an editor save (floor, sale, references, catalogue
--   minimums, model family), forced at the end of each template. A template that fails is left on
--   its current profile and reported; publication, sale, featured rank, order and covers never
--   change. Each switch is logged in admin.template_profile_switches. p_validate_only rolls everything
--   back and returns the same report (the admin's preview).
-- * admin_template_profile_scope: a category (with its sub-categories), a series or the whole site
--   as template ids. Art-style, deleted (1401) and the built-in edit / freeform templates are never in
--   it; switching or saving a deleted template is refused.
-- * admin_manage_prompt_version: a version a profile points at cannot be deleted (ACTIVE_VERSION).

-- Each switch, in its own private log (not admin_audit_log: its action list is rewritten by other
-- migrations, e.g. 1401, and a list without this action would refuse the switch).
create table admin.template_profile_switches (
  id bigint generated always as identity primary key,
  template_id text not null references public.templates(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  from_profile text not null, to_profile text not null,
  reason text not null check (length(reason) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table admin.template_profile_switches enable row level security;
revoke all on admin.template_profile_switches from public,anon,authenticated,service_role;
create index template_profile_switches_template_idx on admin.template_profile_switches(template_id, created_at);



create function admin.valid_profile_prices(p_cost jsonb, p_unpriced text[]) returns boolean
language sql immutable set search_path='' as $$
  select jsonb_typeof(p_cost)='object' and p_cost ?& array['1k','2k','3k']
    and (select bool_and(jsonb_typeof(p_cost->r)='number' and (p_cost->>r) ~ '^[1-9][0-9]{0,2}$')
         from unnest(array['1k','2k','3k']) r)
    and p_unpriced is not null and p_unpriced <@ array['1k','2k','3k'] and array_position(p_unpriced,null) is null
    and not (p_unpriced @> array['1k','2k','3k'])
$$;
revoke all on function admin.valid_profile_prices(jsonb, text[]) from public, anon, authenticated;
grant execute on function admin.valid_profile_prices(jsonb, text[]) to service_role;

-- p_prompt: {body, model_params, provider_id, style_refs}. p_expected: the profile's version the
-- form was opened on (null for a profile that does not exist yet). Returns the profile's version.
create function public.admin_save_template_profile(p_actor uuid, p_id text, p_profile text, p_prompt jsonb,
  p_quality text, p_credits_cost jsonb, p_unpriced text[], p_expected integer)
returns integer language plpgsql security definer set search_path='' as $$
declare tp public.template_prompts; current_p public.template_profiles; h public.template_prompt_versions;
  v_provider uuid; v_model text; v_body text; v_params jsonb; v_refs jsonb; v_version integer;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  if p_profile not in ('openai','seedream') or p_quality not in ('high','medium') or jsonb_typeof(p_prompt) is distinct from 'object'
    or not admin.valid_profile_prices(p_credits_cost, p_unpriced) then raise exception 'INVALID_INPUT'; end if;
  perform 1 from public.templates where id=p_id and deleted_at is null for update;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  if p_id in ('edit','freeform') then raise exception 'INVALID_INPUT'; end if;
  select * into tp from public.template_prompts where template_id=p_id for update;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  if tp.active_profile=p_profile then raise exception 'PROFILE_ACTIVE'; end if;
  select * into current_p from public.template_profiles where template_id=p_id and profile=p_profile for update;
  if current_p.prompt_version is distinct from p_expected then raise exception 'STALE_PROMPT'; end if;

  v_body := p_prompt->>'body';
  v_params := coalesce(p_prompt->'model_params','{}'::jsonb);
  v_refs := coalesce(p_prompt->'style_refs','[]'::jsonb);
  if nullif(btrim(v_body),'') is null or jsonb_typeof(v_params)<>'object' then raise exception 'INVALID_INPUT'; end if;
  if v_refs<>'[]'::jsonb and not admin.valid_style_refs(p_id, v_refs) then raise exception 'INVALID_STYLE_REFS'; end if;
  v_provider := nullif(p_prompt->>'provider_id','')::uuid;
  if v_provider is not null then
    select model into v_model from public.ai_providers where id=v_provider and module='image' for share;
    if not found then raise exception 'PROVIDER_NOT_IMAGE'; end if;
  end if;
  if admin.provider_profile(v_provider)<>p_profile then
    raise exception 'PROFILE_PROVIDER_MISMATCH' using detail=case when p_profile='seedream'
      then 'Seedream 配置只能绑定火山方舟的模型。' else 'ChatGPT 配置不能绑定火山方舟的模型。' end;
  end if;

  if current_p.template_id is not null then
    select * into h from public.template_prompt_versions where template_id=p_id and version=current_p.prompt_version;
  end if;
  if h.template_id is not null and (h.body,h.model_params,h.provider_id,h.style_refs) is not distinct from (v_body,v_params,v_provider,v_refs)
    and h.provider_model is not distinct from v_model then
    v_version := h.version;
  else
    select coalesce(greatest(
      (select max(version) from public.template_prompt_versions where template_id=p_id),
      (select max(version) from admin.deleted_prompt_versions where template_id=p_id)),0)+1 into v_version;
    insert into public.template_prompt_versions(template_id,version,body,model_params,provider_id,provider_model,style_refs,created_at,profile)
      values (p_id,v_version,v_body,v_params,v_provider,v_model,v_refs,now(),p_profile);
  end if;
  insert into public.template_profiles as p(template_id,profile,prompt_version,quality,credits_cost,unpriced_resolutions,updated_by)
    values (p_id,p_profile,v_version,p_quality,p_credits_cost,p_unpriced,p_actor)
    on conflict (template_id,profile) do update set prompt_version=excluded.prompt_version, quality=excluded.quality,
      credits_cost=excluded.credits_cost, unpriced_resolutions=excluded.unpriced_resolutions,
      provider_unmatched=null, updated_at=now(), updated_by=excluded.updated_by;
  return v_version;
end $$;
revoke all on function public.admin_save_template_profile(uuid,text,text,jsonb,text,jsonb,text[],integer) from public,anon,authenticated;
grant execute on function public.admin_save_template_profile(uuid,text,text,jsonb,text,jsonb,text[],integer) to service_role;

-- One template, inside the caller's subtransaction. Returns {from, to, before, after} where before
-- and after are the web's sellable tiers and the prices.
-- Definer: service_role reads profiles and versions but does not write them (as the editor's
-- definer triggers). Only service_role may call it, from the batch function or templates:apply.
create function admin.switch_template_profile(p_actor uuid, p_id text, p_target text, p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.templates; tp public.template_prompts; p public.template_profiles; h public.template_prompt_versions;
  v_before jsonb; v_after jsonb; v_from text;
  previous_restore text := current_setting('shotviva.restore_prompt_version',true);
begin
  select * into t from public.templates where id=p_id for update;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  if p_id in ('edit','freeform') or t.category_key='art-styles' then raise exception 'PROFILE_NOT_ALLOWED'; end if;
  if t.deleted_at is not null then raise exception 'TEMPLATE_DELETED' using detail='已删除的模板不参与切换'; end if;
  select * into tp from public.template_prompts where template_id=p_id for update;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  v_from := tp.active_profile;
  v_before := jsonb_build_object('resolutions',admin.template_image_options(t)->'resolutions','credits',t.credits_cost);
  if v_from=p_target then
    return jsonb_build_object('from',v_from,'to',p_target,'unchanged',true,'before',v_before,'after',v_before);
  end if;
  select * into p from public.template_profiles where template_id=p_id and profile=p_target for update;
  if not found then raise exception 'PROFILE_MISSING'; end if;
  if p.provider_unmatched is not null then
    raise exception 'PROVIDER_MISSING' using detail=format('这里没有 %s 这个模型，先在供应商里加上，再同步一次', p.provider_unmatched->>'model');
  end if;
  select * into strict h from public.template_prompt_versions where template_id=p_id and version=p.prompt_version;
  if h.provider_id is not null then
    perform 1 from public.ai_providers where id=h.provider_id and module='image' and model=h.provider_model
      and vault_secret_id is not null for share;
    if not found then raise exception 'PROVIDER_MISSING' using detail='这套配置绑定的模型或密钥已不可用'; end if;
  end if;
  -- The saved version, under its own number (assign_template_prompt_version restores it).
  perform set_config('shotviva.save_style_refs','',true);
  perform set_config('shotviva.restore_prompt_version',h.version::text,true);
  update public.template_prompts set active_profile=p_target, body=h.body, model_params=h.model_params,
    provider_id=h.provider_id, style_refs=h.style_refs where template_id=p_id;
  perform set_config('shotviva.restore_prompt_version',coalesce(previous_restore,''),true);
  perform admin.set_template_unpriced_resolutions(p_id, p.unpriced_resolutions);
  update public.templates set quality=p.quality, credits_cost=p.credits_cost where id=p_id
    and (quality,credits_cost) is distinct from (p.quality,p.credits_cost);
  select * into t from public.templates where id=p_id;
  v_after := jsonb_build_object('resolutions',admin.template_image_options(t)->'resolutions','credits',t.credits_cost);
  insert into admin.template_profile_switches(template_id,actor_id,from_profile,to_profile,reason)
    values (p_id,p_actor,v_from,p_target,p_reason);
  return jsonb_build_object('from',v_from,'to',p_target,'before',v_before,'after',v_after);
end $$;
revoke all on function admin.switch_template_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function admin.switch_template_profile(uuid,text,text,text) to service_role;

-- Report: [{id, ok, unchanged?, from, to, before, after} | {id, ok:false, code, detail}], in id order.
create function public.admin_switch_template_profiles(p_actor uuid, p_ids text[], p_target text, p_reason text, p_validate_only boolean)
returns jsonb language plpgsql set search_path='' as $$
declare results jsonb := '[]'; v_id text; v_row jsonb;
  v_message text; v_detail text; v_state text; v_known boolean;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  if p_target not in ('openai','seedream') or p_validate_only is null or nullif(btrim(p_reason),'') is null
    or length(p_reason)>200 or p_ids is null or array_position(p_ids,null) is not null then raise exception 'INVALID_INPUT'; end if;
  if cardinality(p_ids)>300 then raise exception 'BATCH_TOO_LARGE'; end if;
  begin
    -- Primary-key order, as bulk edit locks.
    for v_id in select distinct x from unnest(p_ids) x order by 1 loop
      begin
        set constraints all deferred;
        v_row := admin.switch_template_profile(p_actor, v_id, p_target, btrim(p_reason));
        set constraints all immediate;
        set constraints all deferred;
        results := results || jsonb_build_array(jsonb_build_object('id',v_id,'ok',true) || v_row);
      exception when others then
        get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail, v_state = returned_sqlstate;
        v_known := v_message ~ '^[A-Z][A-Z0-9_]+$';
        results := results || jsonb_build_array(jsonb_build_object('id',v_id,'ok',false,
          'code', case when v_known then v_message else 'DB_ERROR' end,
          'detail', case when v_known then nullif(v_detail,'') end, 'sqlstate', v_state));
      end;
    end loop;
    if p_validate_only then raise exception using errcode = 'Z9391'; end if;
  exception when sqlstate 'Z9391' then
    null;
  end;
  return results;
end $$;
revoke all on function public.admin_switch_template_profiles(uuid,text[],text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_switch_template_profiles(uuid,text[],text,text,boolean) to service_role;

-- p_scope: 'category' (p_key: any level's key; its sub-categories too), 'series' (p_key: id or slug) or
-- 'site'. Never art-style, edit or freeform templates.
-- Reads templates.deleted_at (1401, numbered before this migration).
create function public.admin_template_profile_scope(p_scope text, p_key text) returns text[]
language plpgsql stable set search_path='' as $$
declare ids text[];
begin
  select coalesce(array_agg(t.id order by t.id),'{}') into ids from public.templates t
  where t.id not in ('edit','freeform') and t.category_key<>'art-styles' and t.deleted_at is null
    and exists(select from public.template_prompts tp where tp.template_id=t.id)
    and case p_scope
      when 'site' then true
      when 'series' then t.series_id=(select s.id from public.template_series s where s.slug=p_key or s.id::text=p_key)
      when 'category' then coalesce(t.subcategory_key,t.category_key) in (
        select c.key from public.template_categories c left join public.template_categories pc on pc.key=c.parent_id
        where c.kind='template' and (c.key=p_key or c.parent_id=p_key or pc.parent_id=p_key))
      else false end;
  return ids;
end $$;
revoke all on function public.admin_template_profile_scope(text,text) from public,anon,authenticated;
grant execute on function public.admin_template_profile_scope(text,text) to service_role;

-- 1104, plus: the version a profile points at is in use.
create or replace function public.admin_manage_prompt_version(p_actor uuid,p_id text,p_version int,p_action text,p_name text default null)
returns void language plpgsql security definer set search_path='' as $$
declare active int;
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.templates where id=p_id for update;
  select version into active from public.template_prompts where template_id=p_id for update;
  if p_action='rename' and length(coalesce(p_name,''))<=80 then
    update public.template_prompt_versions set display_name=nullif(trim(p_name),'') where template_id=p_id and version=p_version;
  elsif p_action='delete' then
    if active=p_version or exists(select from public.template_profiles where template_id=p_id and prompt_version=p_version)
      then raise exception 'ACTIVE_VERSION'; end if;
    delete from public.template_prompt_versions where template_id=p_id and version=p_version;
    if found then
      insert into admin.deleted_prompt_versions(template_id,version,actor_id) values(p_id,p_version,p_actor);
      return;
    end if;
  else raise exception 'INVALID_INPUT'; end if;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
end;
$$;
