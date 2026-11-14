-- 1551: per-line setting 「BYOK（按官方价）」 for OpenRouter lines that run an OpenAI image model.
--
-- With the Owner's own OpenAI key as BYOK, OpenAI bills its list price and OpenRouter waives its
-- fee within the monthly allowance, so such a line costs what the official OpenAI line costs. The
-- sale floor then prices it like the official line (list estimate by quality, no top-up factor on
-- the catalogue estimate) and shares the official line's measured costs and approved prices (1552).
-- On by default: the column only matters for openrouter_images + openai/gpt-image-* lines, and an
-- admin turns it off for a line that is not BYOK. Expand-only: older code never reads the column.

alter table public.ai_providers add column byok_list_price boolean not null default true;

-- Prices like the official OpenAI line: the official line itself, or a BYOK OpenRouter line on an
-- OpenAI GPT image model.
create function admin.provider_list_priced(p public.ai_providers) returns boolean
  language sql immutable set search_path to '' as $$
  select p.adapter='openai_images'
    or (p.adapter='openrouter_images' and p.model like 'openai/gpt-image-%' and p.byok_list_price)
$$;

-- The underlying OpenAI model a list-priced line runs ('gpt-image-2.6-sunburst' for both the
-- official line and openai/gpt-image-2.6-sunburst on OpenRouter); null for any other line.
create function admin.provider_cost_model(p public.ai_providers) returns text
  language sql immutable set search_path to '' as $$
  select case when p.module<>'image' or not admin.provider_list_priced(p) then null
    when p.adapter='openai_images' then p.model else substr(p.model, length('openai/')+1) end
$$;

revoke all on function admin.provider_list_priced(public.ai_providers) from public, anon, authenticated;
revoke all on function admin.provider_cost_model(public.ai_providers) from public, anon, authenticated;
grant execute on function admin.provider_list_priced(public.ai_providers) to service_role;
grant execute on function admin.provider_cost_model(public.ai_providers) to service_role;

create function public.admin_set_provider_byok_list_price(p_actor uuid, p_id uuid, p_on boolean) returns void
  language plpgsql set search_path to '' as $$
begin
  if not exists(select from public.profiles where id=p_actor and role='admin' and banned_at is null) then raise exception 'NOT_ADMIN'; end if;
  if p_on is null then raise exception 'INVALID_INPUT'; end if;
  update public.ai_providers set byok_list_price=p_on where id=p_id and module='image';
  if not found then raise exception 'PROVIDER_NOT_FOUND'; end if;
end $$;

revoke all on function public.admin_set_provider_byok_list_price(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_provider_byok_list_price(uuid,uuid,boolean) to service_role;
