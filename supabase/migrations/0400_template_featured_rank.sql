-- T53: the home page's featured templates are picked and ordered in admin, never hard-coded
-- (ARCHITECTURE §12 home item 3). featured_rank: null = not featured, 1..12 = position (small
-- first). Only a published, web-visible template can be featured; unpublishing it or taking it
-- off the web clears its rank in the same write.

alter table public.templates
  add column featured_rank smallint
  constraint templates_featured_rank_check check (featured_rank is null or featured_rank between 1 and 12),
  add constraint templates_featured_live_check check (featured_rank is null or (is_active and 'web' = any (visible_in)));

-- One template per position; also serves the home read (`where featured_rank is not null
-- order by featured_rank`), a handful of rows.
create unique index templates_featured_rank_key on public.templates (featured_rank) where featured_rank is not null;

-- Same function as 0380, plus `featured_rank`. A payload without the key (the editor's form, the
-- prompt import) keeps the stored rank while the template stays live on the web, and clears it
-- otherwise, so the check above never fires on an ordinary save.
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
    fields, quality, credits_cost, sort_order, is_active, visible_in, translations, description, featured_rank
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
    nullif(btrim(p_template ->> 'description'), ''),
    (p_template ->> 'featured_rank')::smallint
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
    description = case when p_template ? 'description' then excluded.description else t.description end,
    featured_rank = case
      when p_template ? 'featured_rank' then excluded.featured_rank
      when coalesce((p_template ->> 'is_active')::boolean, t.is_active) and 'web' = any (excluded.visible_in) then t.featured_rank
      else null
    end;

  if p_prompt is not null then
    insert into public.template_prompts (template_id, body, model_params)
    values (v_id, p_prompt ->> 'body', coalesce(p_prompt -> 'model_params', '{}'::jsonb))
    on conflict (template_id) do update set
      body = excluded.body,
      model_params = excluded.model_params;
  end if;
end;
$$;

-- The admin's whole featured list in one write: `p_ids` in display order become ranks 1..n,
-- every other template is un-featured. At most 12, no repeats, each one published and on the
-- web, or nothing changes. Ranks are cleared first so a reorder never collides on the index.
create function public.admin_set_featured_templates(p_ids text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ids text[] := coalesce(p_ids, '{}');
begin
  if cardinality(v_ids) > 12 then
    raise exception 'at most 12 featured templates' using errcode = '22023';
  end if;
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) as u(id)) then
    raise exception 'featured templates must not repeat' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) as u(id)
    where not exists (
      select 1 from public.templates t where t.id = u.id and t.is_active and 'web' = any (t.visible_in)
    )
  ) then
    raise exception 'only published web templates can be featured' using errcode = '22023';
  end if;

  update public.templates set featured_rank = null where featured_rank is not null;
  update public.templates t
  set featured_rank = o.position
  from unnest(v_ids) with ordinality as o(id, position)
  where t.id = o.id;
end;
$$;

revoke execute on function public.admin_set_featured_templates(text[]) from public, anon, authenticated;
grant execute on function public.admin_set_featured_templates(text[]) to service_role;
