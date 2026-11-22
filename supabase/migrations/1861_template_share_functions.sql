-- Creating and revoking template collection share links (ARCHITECTURE §5.1g). Both are called
-- only by the server (service role) after it has authenticated the caller, with that user's id;
-- clients cannot execute them. Each is one round trip (AGENTS §5.1 item 1).

-- Makes a link for p_user from p_items (1 to 50 distinct entries, each live on the web catalogue
-- now: a template from web_template_members, a series from web_catalogue_entries), an optional
-- title (≤ 80) and note (≤ 500), blank meaning none. At most 20 links an hour and 100 a day per
-- account; the profile row is locked first, so parallel requests cannot both pass the count.
-- Returns the new link id.
create function public.template_share_create(p_user uuid, p_items jsonb, p_title text default null, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_item jsonb;
  v_type text;
  v_key text;
  v_seen text[] := '{}';
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id text;
  v_bytes bytea;
  i int;
begin
  if p_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50
     or (v_title is not null and char_length(v_title) > 80) or (v_note is not null and char_length(v_note) > 500) then
    raise exception 'INVALID_INPUT';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or (v_item - 'type' - 'id') <> '{}'::jsonb
       or jsonb_typeof(v_item -> 'id') is distinct from 'string' then
      raise exception 'INVALID_INPUT';
    end if;
    v_type := v_item ->> 'type';
    v_key := v_type || ':' || (v_item ->> 'id');
    if v_key = any (v_seen) then
      raise exception 'INVALID_INPUT';
    end if;
    v_seen := v_seen || v_key;
    if v_type = 'template' then
      if not exists (select 1 from public.web_template_members m where m.id = v_item ->> 'id') then
        raise exception 'TEMPLATE_NOT_FOUND';
      end if;
    elsif v_type = 'series' then
      if (v_item ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.web_catalogue_entries e where e.series_id = (v_item ->> 'id')::uuid) then
        raise exception 'TEMPLATE_NOT_FOUND';
      end if;
    else
      raise exception 'INVALID_INPUT';
    end if;
  end loop;

  if (select count(*) from public.template_shares s where s.user_id = p_user and s.created_at > now() - interval '1 hour') >= 20
     or (select count(*) from public.template_shares s where s.user_id = p_user and s.created_at > now() - interval '1 day') >= 100 then
    raise exception 'RATE_LIMITED';
  end if;

  -- 12 of 36 characters (about 62 bits) from a random uuid's bytes; a collision is retried.
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_id := '';
    for i in 0..11 loop
      v_id := v_id || substr(alphabet, 1 + (get_byte(v_bytes, i) % 36), 1);
    end loop;
    exit when not exists (select 1 from public.template_shares s where s.id = v_id);
  end loop;

  insert into public.template_shares (id, user_id, items, title, note)
  values (v_id, p_user, p_items, v_title, v_note);
  return v_id;
end;
$$;

revoke all on function public.template_share_create(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.template_share_create(uuid, jsonb, text, text) to service_role;

-- Revokes p_user's own link; true when this call revoked it, false when it is someone else's,
-- unknown or already revoked (the page then shows it as no longer available).
create function public.template_share_revoke(p_user uuid, p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  update public.template_shares set revoked_at = now()
   where id = p_id and user_id = p_user and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.template_share_revoke(uuid, text) from public, anon, authenticated;
grant execute on function public.template_share_revoke(uuid, text) to service_role;
