-- Baseline (T15): admin functions (ARCHITECTURE §10). Callable only with the service role:
-- the admin page's server actions check role = admin first, and SQL-editor runs use it too.
-- admin_adjust_credits lives with the other balance functions in 0002_credits.sql.

-- profiles has no reason column, so ban reasons go to a private audit log.
-- A banned user cannot reserve credits.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  action text not null check (action in ('ban_user')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (length(reason) > 0),
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;
-- Server-side reads only (support, debugging); writes go through SQL functions.
grant select on public.admin_audit_log to service_role;

create function public.admin_ban_user(p_user_id uuid, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_banned_at timestamptz;
begin
  if p_reason is null or length(p_reason) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'reason is required';
  end if;

  -- Keep the first ban time when banning twice.
  update public.profiles
     set banned_at = coalesce(banned_at, now())
   where id = p_user_id
  returning banned_at into v_banned_at;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (action, user_id, reason) values ('ban_user', p_user_id, p_reason);
  return v_banned_at;
end;
$$;

revoke execute on function public.admin_ban_user(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_ban_user(uuid, text) to service_role;

-- Template writes: each call is one transaction so a template and its private prompt
-- never drift apart.
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
