create function public.list_my_wish_notices(p_user_id uuid)
returns table (
  request_id uuid, template_id text, template_name_en text, template_name_zh text,
  description_excerpt text, is_author boolean
)
language sql stable security invoker set search_path = ''
as $$
  select n.request_id, t.id, t.name, coalesce(nullif(t.translations #>> '{zh,name}', ''), t.name),
         left(r.description, 40), r.user_id = n.user_id
    from public.template_request_notices n
    join public.template_requests r on r.id = n.request_id
    join public.templates t on t.id = r.template_id
   where n.user_id = p_user_id and n.seen_at is null
     and t.is_active and 'web' = any(t.visible_in)
     and exists (select 1 from public.system_settings where key = 'wishlist_enabled' and value = 'true'::jsonb)
   order by n.created_at desc, n.request_id desc
   limit 5;
$$;

create function public.mark_wish_notices_seen(p_user_id uuid, p_request_ids uuid[])
returns void
language sql security invoker set search_path = ''
as $$
  update public.template_request_notices
     set seen_at = now()
   where user_id = p_user_id and request_id = any(p_request_ids) and seen_at is null
     and exists (select 1 from public.system_settings where key = 'wishlist_enabled' and value = 'true'::jsonb);
$$;

revoke all on function public.list_my_wish_notices(uuid), public.mark_wish_notices_seen(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.list_my_wish_notices(uuid), public.mark_wish_notices_seen(uuid, uuid[])
  to service_role;
