-- T16: the admin save writes the quality tier and the three per-resolution credit numbers
-- (ARCHITECTURE §10). The floor check runs in the server action before this call; the table
-- check on credits_cost rejects a malformed object either way.
--
-- Cover media are not part of the editor form: the cover upload writes them on its own
-- (core/admin/covers), so a save without cover keys keeps the covers the template has. The
-- before/after keys stay accepted here for the prompt import script.

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
    fields, quality, credits_cost, sort_order, is_active, visible_in
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
    array(select jsonb_array_elements_text(coalesce(p_template -> 'visible_in', '["web"]'::jsonb)))
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
    visible_in = excluded.visible_in;

  if p_prompt is not null then
    insert into public.template_prompts (template_id, body, model_params)
    values (v_id, p_prompt ->> 'body', coalesce(p_prompt -> 'model_params', '{}'::jsonb))
    on conflict (template_id) do update set
      body = excluded.body,
      model_params = excluded.model_params;
  end if;
end;
$$;
