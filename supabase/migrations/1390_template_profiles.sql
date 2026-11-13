-- Provider profiles (Owner 2026-11-13): every template keeps its current ChatGPT image 2.6 setup and
-- gets a separate Seedream 5.5 setup, with a switch for which one is live. Switching never deletes,
-- overwrites or unpublishes anything; switching back is one click.
--
-- The live profile stays projected onto the columns everything already reads (templates.quality /
-- credits_cost, template_prompts.body / model_params / provider_id / style_refs / version,
-- template_sale_approvals.unpriced_resolutions). Generation, reservation, refunds, the partner API,
-- batch, the catalogue and every floor check therefore read the active profile with no change. A
-- profile row records, per template and profile, which prompt version it is (the content lives in
-- the immutable template_prompt_versions snapshot) plus its quality, prices and unpriced tiers.
--
-- * template_prompts.active_profile (private table, so no client sees which provider a template
--   uses). 'seedream' means a Volcano Ark (ark_images) binding; 'openai' any other binding or the
--   default model (the art-style templates' OpenRouter rows are 'openai' too; the admin labels a
--   profile by its bound model).
-- * template_prompt_versions.profile: one version sequence per template as before (a job's
--   prompt_version still names exactly one version); each version is tagged with its profile.
-- * Mirror triggers: whatever writes the live columns (editor, bulk edit, import, templates:apply,
--   T93 sync, version restore) writes the active profile's row too. No writer changes.
-- * A deferred check keeps the active profile and the bound model's family in step: binding an Ark
--   model to the ChatGPT profile (or the reverse) in the editor or bulk edit is refused; that is
--   what the profile switch (1391) is for.
-- * admin_template_profile_drift(): read-only consistency check for the admin page.
-- Backfill: one profile per template from its live columns ('seedream' for templates already bound
-- to an Ark model, 'openai' otherwise). No behaviour change.

alter table public.template_prompts add column active_profile text not null default 'openai'
  check (active_profile in ('openai','seedream'));
alter table public.template_prompt_versions add column profile text not null default 'openai'
  check (profile in ('openai','seedream'));

-- The family of a bound model: an Ark row is Seedream; anything else (or no binding: the default
-- model) belongs to the ChatGPT profile.
create function admin.provider_profile(p_provider uuid) returns text
language sql stable set search_path='' as $$
  select case when exists(select from public.ai_providers p where p.id=p_provider and p.adapter='ark_images')
    then 'seedream' else 'openai' end
$$;
revoke all on function admin.provider_profile(uuid) from public,anon,authenticated;
grant execute on function admin.provider_profile(uuid) to service_role;

-- Existing rows: the profile follows the binding. Plain column updates; no version moves.
update public.template_prompts tp set active_profile='seedream'
  where admin.provider_profile(tp.provider_id)='seedream';
update public.template_prompt_versions v set profile='seedream'
  where admin.provider_profile(v.provider_id)='seedream';

create table public.template_profiles (
  template_id text not null references public.templates(id) on delete cascade,
  profile text not null check (profile in ('openai','seedream')),
  prompt_version integer not null check (prompt_version > 0),
  quality text not null check (quality in ('high','medium')),
  credits_cost jsonb not null check (jsonb_typeof(credits_cost)='object'),
  unpriced_resolutions text[] not null default '{}' check (
    unpriced_resolutions <@ array['1k','2k','3k'] and array_position(unpriced_resolutions,null) is null),
  -- Production only (T93 sync): the test site's model of this inactive profile has no row here.
  -- {adapter, model, base_url}; switching to the profile is refused until a sync matches it.
  provider_unmatched jsonb check (provider_unmatched is null or jsonb_typeof(provider_unmatched)='object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (template_id, profile),
  foreign key (template_id, prompt_version) references public.template_prompt_versions(template_id, version)
);
alter table public.template_profiles enable row level security;
revoke all on public.template_profiles from public,anon,authenticated;
grant select on public.template_profiles to service_role;

insert into public.template_profiles(template_id,profile,prompt_version,quality,credits_cost,unpriced_resolutions)
select tp.template_id, tp.active_profile, tp.version, t.quality, t.credits_cost, coalesce(s.unpriced_resolutions,'{}')
  from public.template_prompts tp join public.templates t on t.id=tp.template_id
  left join public.template_sale_approvals s on s.template_id=tp.template_id
  where exists(select from public.template_prompt_versions v where v.template_id=tp.template_id and v.version=tp.version);

-- New versions carry the profile they were made for (1000, plus the tag).
create or replace function admin.archive_template_prompt_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.version=old.version then return null; end if;
  -- A restore already has its immutable snapshot. All other writes insert a new PK.
  if new.version=nullif(current_setting('shotviva.restore_prompt_version',true),'')::integer then return null; end if;
  insert into public.template_prompt_versions(template_id,version,body,model_params,provider_id,provider_model,style_refs,created_at,profile)
    values (new.template_id,new.version,new.body,new.model_params,new.provider_id,
      (select model from public.ai_providers where id=new.provider_id),new.style_refs,new.updated_at,new.active_profile);
  return null;
end $$;

-- 1104, plus: a version restores only into the profile it belongs to.
create or replace function admin.assign_template_prompt_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare wanted integer := nullif(current_setting('shotviva.restore_prompt_version',true),'')::integer;
  h public.template_prompt_versions%rowtype; latest integer;
begin
  -- Runs after both legacy BEFORE triggers, once their resolved refs and version bump are known.
  if tg_op='UPDATE' then
    if wanted is not null then
      select * into strict h from public.template_prompt_versions where template_id=new.template_id and version=wanted;
      if h.profile<>new.active_profile then raise exception 'VERSION_OTHER_PROFILE'; end if;
      if (h.body,h.model_params,h.provider_id,h.style_refs) is not distinct from
         (new.body,new.model_params,new.provider_id,new.style_refs) then
        new.version:=wanted; new.updated_at:=now(); return new;
      end if;
    end if;
    if new.version=old.version and new.provider_id is not distinct from old.provider_id then return new; end if;
  end if;
  select greatest(
    (select max(version) from public.template_prompt_versions where template_id=new.template_id),
    (select max(version) from admin.deleted_prompt_versions where template_id=new.template_id)
  ) into latest;
  new.version:=coalesce(latest+1,new.version); new.updated_at:=now();
  return new;
end $$;

-- A new prompt row bound to an Ark model starts as the Seedream profile (copies, first saves).
create function admin.default_template_profile() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.active_profile='openai' then new.active_profile:=admin.provider_profile(new.provider_id); end if;
  return new;
end $$;
revoke all on function admin.default_template_profile() from public,anon,authenticated,service_role;
create trigger template_prompts_default_profile before insert on public.template_prompts
  for each row execute function admin.default_template_profile();

-- At commit: the live profile and the bound model's family agree.
create function admin.check_template_profile_family() returns trigger
language plpgsql security definer set search_path='' as $$
declare tp public.template_prompts;
begin
  select * into tp from public.template_prompts where template_id=new.template_id;
  if found and admin.provider_profile(tp.provider_id)<>tp.active_profile then
    raise exception 'PROFILE_PROVIDER_MISMATCH' using detail=case when tp.active_profile='seedream'
      then '这个模板在用 Seedream 配置，只能绑定火山方舟的模型。要换回 ChatGPT，请用「切换配置」。'
      else '这个模板在用 ChatGPT 配置，不能直接绑定火山方舟的模型。要用 Seedream，请在「供应商配置」里建好 Seedream 配置再切换。' end;
  end if;
  return null;
end $$;
revoke all on function admin.check_template_profile_family() from public,anon,authenticated,service_role;
create constraint trigger template_profile_family after insert or update of provider_id, active_profile
  on public.template_prompts deferrable initially deferred
  for each row execute function admin.check_template_profile_family();

-- The active profile's row follows the live columns. Named to run after archive_template_prompt_version
-- (AFTER triggers fire in name order), so the version it points at already exists.
create function admin.mirror_template_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id text; tp public.template_prompts; t public.templates; v_unpriced text[];
begin
  -- One branch per table: a record field is resolved only when its branch runs.
  if tg_table_name='templates' then v_id := new.id; else v_id := new.template_id; end if;
  select * into tp from public.template_prompts where template_id=v_id;
  if not found then return null; end if;
  select * into t from public.templates where id=v_id;
  if not found then return null; end if;
  if not exists(select from public.template_prompt_versions where template_id=v_id and version=tp.version) then return null; end if;
  select unpriced_resolutions into v_unpriced from public.template_sale_approvals where template_id=v_id;
  insert into public.template_profiles as p(template_id,profile,prompt_version,quality,credits_cost,unpriced_resolutions)
    values (v_id,tp.active_profile,tp.version,t.quality,t.credits_cost,coalesce(v_unpriced,'{}'))
    on conflict (template_id,profile) do update set prompt_version=excluded.prompt_version,
      quality=excluded.quality, credits_cost=excluded.credits_cost,
      unpriced_resolutions=excluded.unpriced_resolutions, provider_unmatched=null, updated_at=now()
    where (p.prompt_version,p.quality,p.credits_cost,p.unpriced_resolutions,p.provider_unmatched) is distinct from
      (excluded.prompt_version,excluded.quality,excluded.credits_cost,excluded.unpriced_resolutions,null::jsonb);
  return null;
end $$;
revoke all on function admin.mirror_template_profile() from public,anon,authenticated,service_role;
create trigger zzz_template_profile_mirror after insert or update on public.template_prompts
  for each row execute function admin.mirror_template_profile();
create trigger zzz_template_profile_mirror after update of quality, credits_cost on public.templates
  for each row execute function admin.mirror_template_profile();
create trigger zzz_template_profile_mirror after insert or update of unpriced_resolutions on public.template_sale_approvals
  for each row execute function admin.mirror_template_profile();

-- Read-only: templates whose active profile row disagrees with the live columns (should be none).
create function public.admin_template_profile_drift() returns table (template_id text, profile text, problem text)
language sql stable security invoker set search_path='' as $$
  select tp.template_id, tp.active_profile,
    case when p.template_id is null then 'missing'
         when p.prompt_version<>tp.version then 'version'
         when p.quality<>t.quality or p.credits_cost<>t.credits_cost then 'price'
         when p.unpriced_resolutions<>coalesce(s.unpriced_resolutions,'{}') then 'unpriced'
         when admin.provider_profile(tp.provider_id)<>tp.active_profile then 'provider' end
  from public.template_prompts tp join public.templates t on t.id=tp.template_id
  left join public.template_profiles p on p.template_id=tp.template_id and p.profile=tp.active_profile
  left join public.template_sale_approvals s on s.template_id=tp.template_id
  where p.template_id is null or p.prompt_version<>tp.version or p.quality<>t.quality or p.credits_cost<>t.credits_cost
     or p.unpriced_resolutions<>coalesce(s.unpriced_resolutions,'{}')
     or admin.provider_profile(tp.provider_id)<>tp.active_profile
  order by 1
$$;
revoke all on function public.admin_template_profile_drift() from public,anon,authenticated;
grant execute on function public.admin_template_profile_drift() to service_role;

-- Each extra input image a slot job sends costs this much (USD) on this model; read by the slot
-- floor (1392). Null keeps the conservative floor × slots.
alter table public.ai_providers add column extra_input_image_usd numeric
  check (extra_input_image_usd is null or (extra_input_image_usd >= 0 and extra_input_image_usd < 10));

-- The admin's AI 供应商 form sets it (after admin_save_provider); null clears it.
create function public.admin_set_provider_extra_input_cost(p_actor uuid, p_id uuid, p_usd numeric) returns void
language plpgsql set search_path='' as $$
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  update public.ai_providers set extra_input_image_usd=p_usd where id=p_id and module='image';
  if not found then raise exception 'PROVIDER_NOT_FOUND'; end if;
end $$;
revoke all on function public.admin_set_provider_extra_input_cost(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.admin_set_provider_extra_input_cost(uuid,uuid,numeric) to service_role;
