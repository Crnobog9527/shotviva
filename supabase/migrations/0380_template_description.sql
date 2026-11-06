-- T52: the template's English one-line description (ARCHITECTURE §5 `templates`, 「英文说明」).
-- Shown on English pages; Chinese pages show translations.zh.description and fall back to this;
-- with neither, nothing shows. Never translated automatically. Blank is stored as null.

alter table public.templates
  add column description text
  constraint templates_description_check check (description is null or char_length(description) between 1 and 160);

-- Same function as 0121, plus `description`. A payload without the key (the prompt import
-- script, the edit template save) keeps what is stored; the editor always sends it, null to clear.
create or replace function public.admin_upsert_template(p_template jsonb, p_prompt jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id text := p_template ->> 'id';
begin
  insert into public.templates as t (
    id, module, name, category, cover_before_url, cover_after_url,
    fields, quality, credits_cost, sort_order, is_active, visible_in, translations, description
  ) values (
    v_id,
    coalesce(p_template ->> 'module', 'image'),
    p_template ->> 'name',
    p_template ->> 'category',
    nullif(p_template ->> 'cover_before_url', ''),
    nullif(p_template ->> 'cover_after_url', ''),
    coalesce(p_template -> 'fields', '{}'::jsonb),
    coalesce(p_template ->> 'quality', 'high'),
    -- Required: a template without its three prices must not save at some default.
    p_template -> 'credits_cost',
    -- New templates go to the end unless a position is given.
    coalesce(
      (p_template ->> 'sort_order')::integer,
      (select coalesce(max(sort_order), 0) + 10 from public.templates)
    ),
    coalesce((p_template ->> 'is_active')::boolean, false),
    array(select jsonb_array_elements_text(coalesce(p_template -> 'visible_in', '["web"]'::jsonb))),
    coalesce(p_template -> 'translations', '{}'::jsonb),
    nullif(btrim(p_template ->> 'description'), '')
  )
  on conflict (id) do update set
    module = excluded.module,
    name = excluded.name,
    category = excluded.category,
    -- Only when the payload carries them: the editor leaves covers to the upload.
    cover_before_url = case when p_template ? 'cover_before_url' then excluded.cover_before_url else t.cover_before_url end,
    cover_after_url = case when p_template ? 'cover_after_url' then excluded.cover_after_url else t.cover_after_url end,
    fields = excluded.fields,
    quality = excluded.quality,
    credits_cost = excluded.credits_cost,
    sort_order = coalesce((p_template ->> 'sort_order')::integer, t.sort_order),
    is_active = coalesce((p_template ->> 'is_active')::boolean, t.is_active),
    visible_in = excluded.visible_in,
    -- The editor always sends the whole object; the prompt import script does not, and keeps it.
    translations = case when p_template ? 'translations' then excluded.translations else t.translations end,
    description = case when p_template ? 'description' then excluded.description else t.description end;

  if p_prompt is not null then
    insert into public.template_prompts (template_id, body, model_params)
    values (v_id, p_prompt ->> 'body', coalesce(p_prompt -> 'model_params', '{}'::jsonb))
    on conflict (template_id) do update set
      body = excluded.body,
      model_params = excluded.model_params;
  end if;
end;
$$;
