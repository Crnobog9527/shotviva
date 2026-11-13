-- Tall poster ratios (1340): a newly saved OpenAI provider lists 1:2 and 1:3 among the sizes it
-- can make. Rows already saved keep their list; the web reads OpenAI's sizes from
-- admin.template_image_options, not from this snapshot, and the admin test run treats OpenAI as
-- offering every ratio. Same trigger body as 0920 otherwise.
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
      'resolutions',to_jsonb(new.resolutions),'aspectRatios','["16:9","4:5","1:1","9:16","3:2","4:3","2:3","1:2","1:3"]'::jsonb,
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
