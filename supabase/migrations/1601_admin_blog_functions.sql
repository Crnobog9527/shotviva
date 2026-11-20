-- Blog CMS v1 writes (ARCHITECTURE §12.6). Each is one call: it checks the actor is an
-- active admin, changes the row and writes its admin_audit_log row in the same transaction.
-- Only the service role may call them.

create function admin.require_blog_admin(p_actor uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and banned_at is null) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end $$;
revoke all on function admin.require_blog_admin(uuid) from public, anon, authenticated, service_role;

-- Create a post (p_id null: a draft) or rewrite one's text. The status is never changed here:
-- publishing is admin_blog_set_status. A taken slug raises 23505 (blog_posts_locale_slug_key).
create function public.admin_blog_save(
  p_actor uuid, p_id uuid, p_locale text, p_slug text, p_title text, p_description text,
  p_body_md text, p_cover_url text, p_cover_alt text, p_author_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_status text;
begin
  perform admin.require_blog_admin(p_actor);
  if p_id is null then
    insert into public.blog_posts (locale, slug, title, description, body_md, cover_url, cover_alt, author_name, created_by)
    values (p_locale, p_slug, p_title, p_description, p_body_md, p_cover_url, p_cover_alt, p_author_name, p_actor)
    returning id, status into v_id, v_status;
  else
    update public.blog_posts
       set locale = p_locale, slug = p_slug, title = p_title, description = p_description, body_md = p_body_md,
           cover_url = p_cover_url, cover_alt = p_cover_alt, author_name = p_author_name
     where id = p_id and (status <> 'published' or locale = p_locale)
    returning id, status into v_id, v_status;
    if v_id is null then
      -- A live post stays in its language: moving it would leave the footer link of both
      -- languages stale. Take it down first.
      if exists (select 1 from public.blog_posts where id = p_id) then raise exception 'BLOG_POST_LOCALE_LOCKED'; end if;
      raise exception 'BLOG_POST_NOT_FOUND';
    end if;
  end if;
  -- A published post keeps a body: the same rule as publishing, so saving cannot empty a live page.
  if v_status = 'published' and char_length(btrim(p_body_md, E' \n\r\t')) = 0 then raise exception 'BLOG_POST_EMPTY'; end if;
  insert into public.admin_audit_log (action, user_id, target_id, reason)
  values ('blog_save', p_actor, v_id::text, format('%s/%s', p_locale, p_slug));
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;
revoke all on function public.admin_blog_save(uuid, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_blog_save(uuid, uuid, text, text, text, text, text, text, text, text) to service_role;

-- Publish (draft → published, published_at set the first time) or take down (back to draft).
-- A post that is already in the asked state is left as it is and not audited twice. A post with
-- no body cannot be published. Returns the post's language and slug for the cache refresh.
create function public.admin_blog_set_status(p_actor uuid, p_id uuid, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.blog_posts;
begin
  perform admin.require_blog_admin(p_actor);
  if p_publish is null then raise exception 'INVALID_INPUT'; end if;
  select * into v_row from public.blog_posts where id = p_id for update;
  if not found then raise exception 'BLOG_POST_NOT_FOUND'; end if;
  if p_publish and char_length(btrim(v_row.body_md, E' \n\r\t')) = 0 then raise exception 'BLOG_POST_EMPTY'; end if;
  if (v_row.status = 'published') is distinct from p_publish then
    update public.blog_posts
       set status = case when p_publish then 'published' else 'draft' end,
           published_at = case when p_publish then coalesce(published_at, now()) else published_at end
     where id = p_id;
    insert into public.admin_audit_log (action, user_id, target_id, reason)
    values (case when p_publish then 'blog_publish' else 'blog_unpublish' end, p_actor, p_id::text,
            format('%s/%s', v_row.locale, v_row.slug));
  end if;
  return jsonb_build_object('locale', v_row.locale, 'slug', v_row.slug);
end $$;
revoke all on function public.admin_blog_set_status(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_blog_set_status(uuid, uuid, boolean) to service_role;
