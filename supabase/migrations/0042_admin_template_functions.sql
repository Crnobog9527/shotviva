-- Admin writes for templates. Callable only with the service role (the admin page's server
-- actions check role = admin first); each call is one transaction so a template and its
-- private prompt never drift apart.

create function public.admin_upsert_template(p_template jsonb, p_prompt jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id text := p_template ->> 'id';
begin
  insert into public.templates as t (
    id, module, name, category, cover_before_url, cover_after_url,
    fields, credits_cost, sort_order, is_active, visible_in
  ) values (
    v_id,
    coalesce(p_template ->> 'module', 'image'),
    p_template ->> 'name',
    p_template ->> 'category',
    nullif(p_template ->> 'cover_before_url', ''),
    nullif(p_template ->> 'cover_after_url', ''),
    coalesce(p_template -> 'fields', '{}'::jsonb),
    coalesce((p_template ->> 'credits_cost')::integer, 1),
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
    cover_before_url = excluded.cover_before_url,
    cover_after_url = excluded.cover_after_url,
    fields = excluded.fields,
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

-- Rewrites sort_order to match the given id order (10, 20, 30, ...). Ids not listed keep theirs.
create function public.admin_reorder_templates(p_ids text[])
returns void
language sql
set search_path = ''
as $$
  update public.templates t
  set sort_order = o.position * 10
  from unnest(p_ids) with ordinality as o(id, position)
  where t.id = o.id;
$$;

revoke execute on function public.admin_upsert_template(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_reorder_templates(text[]) from public, anon, authenticated;
grant execute on function public.admin_upsert_template(jsonb, jsonb) to service_role;
grant execute on function public.admin_reorder_templates(text[]) to service_role;
