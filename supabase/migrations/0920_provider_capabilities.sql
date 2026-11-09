-- T96: an empty snapshot denotes a provider whose catalogue has not been fetched yet.
alter table public.ai_providers
  add column capabilities jsonb not null default '{}' check (jsonb_typeof(capabilities) = 'object'),
  add column estimated_image_costs jsonb not null default '{}' check (
    jsonb_typeof(estimated_image_costs) = 'object'
    and estimated_image_costs - array['1k','2k','3k'] = '{}'
    and not jsonb_path_exists(estimated_image_costs, '$.* ? (@.type() != "number" || @ <= 0)')
  );

-- Existing deployments can still edit a provider during rollout. Clear an obsolete snapshot
-- when its identity or tiers change; never apply an old model's limits or cost to a new one.
create or replace function public.sync_image_capabilities() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.adapter,new.base_url,new.model) is distinct from (old.adapter,old.base_url,old.model) then
    if new.capabilities = old.capabilities then
      new.capabilities := '{}';
      new.estimated_image_costs := '{}';
    end if;
  end if;
  if new.adapter = 'openai_images' and new.capabilities = '{}' then
    new.capabilities := jsonb_build_object(
      'resolutions',to_jsonb(new.resolutions),'aspectRatios','["16:9","4:5","1:1","9:16","3:2","4:3","2:3"]'::jsonb,
      'originalRatio',true,'minReferences',0,'maxReferences',4,'fetchedAt',now()
    );
  end if;
  if new.capabilities <> '{}' and new.capabilities->'resolutions' is distinct from to_jsonb(new.resolutions) then
    if tg_op = 'UPDATE' and new.capabilities = old.capabilities then
      new.capabilities := case when new.adapter = 'openai_images' then
        jsonb_set(new.capabilities,'{resolutions}',to_jsonb(new.resolutions)) else '{}'::jsonb end;
    else raise exception 'INVALID_PROVIDER_CAPABILITIES' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_image_capabilities() from public,anon,authenticated;
create trigger ai_providers_sync_capabilities before insert or update on public.ai_providers
for each row execute function public.sync_image_capabilities();
update public.ai_providers set resolutions = array['1k','2k','3k'], capabilities = '{}' where adapter = 'openai_images';
