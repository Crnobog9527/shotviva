-- Bulk model change compares only the ratios the site offers (OUTPUT_ASPECTS without 'original').
-- 123 production templates store 3:4, which no line lists: generation already drops it for a bound
-- template (storedAspectAccepted), on the OpenAI line and the OpenRouter one alike, so it must not
-- block moving them between lines (2026-11-15, OpenAI official → OpenRouter). A site ratio the
-- chosen line lacks is still refused. Same signature, so the deployed code keeps working.
create or replace function admin.bulk_model_problem(t public.templates,tp public.template_prompts,p public.ai_providers,updated_costs jsonb)
returns text language plpgsql stable set search_path='' as $$
declare caps jsonb:=p.capabilities; refs int:=coalesce(jsonb_array_length(tp.style_refs),0); ratios jsonb;
begin
  if tp.template_id is null then return '缺少提示词'; end if;
  if t.module<>'image' then return '仅图片模板支持出图模型'; end if;
  if p.adapter='openrouter_images' and coalesce(jsonb_array_length(caps->'resolutions'),0)=0 then return '所选模型的能力尚未确认'; end if;
  if exists(select from jsonb_object_keys(updated_costs) tier where not (tier=any(admin.sale_route_resolutions(p)))) then
    return '所选模型不支持所填积分档位';
  end if;
  ratios:=coalesce(caps->'providerAspectRatios',caps->'aspectRatios');
  if ratios is not null and exists(select from jsonb_array_elements_text(t.fields->'aspectRatios') r
      where r = any(array['16:9','4:5','1:1','9:16','3:2','4:3','2:3','1:2','1:3']) and not (ratios ? r)) then
    return '所选模型不支持模板配置的比例';
  end if;
  if coalesce((t.fields#>>'{images,min}')::int,case when refs>0 then 0 end)+refs<coalesce((caps->>'minReferences')::int,0) or
     coalesce((t.fields#>>'{images,max}')::int,case when refs>0 then 0 end)+refs>coalesce((caps->>'maxReferences')::int,4) then
    return '用户照片与画风参考图总数超出模型范围';
  end if;
  return null;
end;
$$;
