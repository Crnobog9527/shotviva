-- Rebinding a template between Seedream routes (Owner 2026-11-14: Seedream only through Volcano Ark,
-- never OpenRouter). The art-style templates were bound to an OpenRouter Seedream model, which 1440
-- labelled as the 'openai' profile (its family test knows only ark_images as Seedream). Moving them
-- to the Ark Seedream model in the editor or bulk edit then failed the deferred family check
-- (PROFILE_PROVIDER_MISMATCH): the binding became Seedream while the label stayed 'openai'.
--
-- Now, when a template's live binding moves from a Seedream route (ark_images, or an OpenRouter
-- model whose name says seedream) to an Ark model, and its live profile is still labelled 'openai'
-- with no separate Seedream profile, the label follows the binding in the same update: the live
-- profile row is renamed to 'seedream' and the prompt versions bound to Seedream routes are tagged
-- 'seedream', so their history restores into the right profile. Nothing else changes: prices,
-- publication and the prompt are whatever the editor or bulk edit wrote.
--
-- Unchanged: moving a real ChatGPT setup (any non-Seedream binding) onto an Ark model is still
-- refused (use 供应商配置's switch), a template that already has a Seedream profile is never
-- relabelled (its saved Seedream setup would be overwritten), and art styles stay out of the
-- profile switch (1441). New and copied prompts bound to Ark already start as 'seedream' (1440).
-- Expand-only: one helper, one trigger function and one trigger; no data is rewritten here (the
-- four production art templates relabel when they are rebound through the admin, audited there).

create function admin.is_seedream_route(p_provider uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from public.ai_providers p where p.id=p_provider and p.module='image'
    and (p.adapter='ark_images' or (p.adapter='openrouter_images' and p.model ilike '%seedream%')))
$$;
revoke all on function admin.is_seedream_route(uuid) from public,anon,authenticated;
grant execute on function admin.is_seedream_route(uuid) to service_role;

create function admin.relabel_seedream_rebind() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.provider_id is distinct from old.provider_id
     and old.active_profile='openai' and new.active_profile='openai'
     and admin.provider_profile(new.provider_id)='seedream'
     and admin.is_seedream_route(old.provider_id)
     and not exists(select from public.template_profiles where template_id=new.template_id and profile='seedream') then
    update public.template_profiles set profile='seedream', updated_at=now()
      where template_id=new.template_id and profile='openai';
    update public.template_prompt_versions v set profile='seedream'
      where v.template_id=new.template_id and v.profile='openai' and admin.is_seedream_route(v.provider_id);
    new.active_profile := 'seedream';
  end if;
  return new;
end $$;
revoke all on function admin.relabel_seedream_rebind() from public,anon,authenticated,service_role;
-- BEFORE triggers fire in name order: this one before zz_template_prompt_version (1000/1440), so the
-- new version it assigns is archived with the 'seedream' tag and the mirror fills the renamed row.
create trigger template_prompts_seedream_rebind before update of provider_id on public.template_prompts
  for each row execute function admin.relabel_seedream_rebind();
