-- T12: what users do on the wishlist (ARCHITECTURE §15.1, §15.3). Service role only: the
-- /api/wishlist routes call these after the session check. Each function re-checks the
-- threshold itself so no caller can skip it.

-- The threshold (§15.1): at least one succeeded generation, and not banned.
create function public.wishlist_eligible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.generation_jobs j
            where j.user_id = p_user_id and j.status = 'succeeded'
         )
     and exists (
           select 1 from public.profiles p
            where p.id = p_user_id and p.banned_at is null
         );
$$;

revoke execute on function public.wishlist_eligible(uuid) from public, anon, authenticated;
grant execute on function public.wishlist_eligible(uuid) to service_role;

-- New requests start pending. The images are already re-encoded under the author's own
-- requests/ prefix by the server; the prefix is checked again here. Per-account limit: at
-- most 5 posts per 24 hours, counted from this table like the generation limit
-- (core/jobs/rate-limit.ts), under a profile lock so parallel posts cannot slip past it.
create function public.create_template_request(
  p_user_id uuid,
  p_description text,
  p_image_keys text[]
)
returns public.template_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.template_requests;
  v_name text;
  v_key text;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if not public.wishlist_eligible(p_user_id) then
    raise exception 'WISHLIST_NOT_ELIGIBLE';
  end if;

  if cardinality(coalesce(p_image_keys, '{}')) not between 1 and 3 then
    raise exception 'INVALID_INPUT' using detail = '1 to 3 reference images';
  end if;
  foreach v_key in array p_image_keys loop
    if v_key is null or v_key !~ ('^requests/' || p_user_id::text || '/[0-9a-f-]{36}\.jpg$') then
      raise exception 'INVALID_INPUT' using detail = 'image key outside the author prefix';
    end if;
  end loop;

  if (select count(*) from public.template_requests r
       where r.user_id = p_user_id and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  -- Display name first (Google sign-ups), else the email; only its first letter leaves here.
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  u.email,
                  '?')
    into v_name
    from auth.users u
   where u.id = p_user_id;

  insert into public.template_requests (user_id, description, image_keys, author_label)
  values (p_user_id, btrim(p_description), p_image_keys, upper(left(coalesce(v_name, '?'), 1)) || '***')
  returning * into v_request;
  return v_request;
end;
$$;

revoke execute on function public.create_template_request(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.create_template_request(uuid, text, text[]) to service_role;

-- "I want this too": one vote per account, a second call takes it back. Only live requests
-- take votes. The weight comes from current_tier (Max 3, everyone else 1), resolved when this
-- runs, so this migration does not depend on T9's being applied first. The request row lock
-- serialises toggles on one request, so five fast clicks leave at most one vote row.
create function public.toggle_template_request_vote(p_request_id uuid, p_user_id uuid)
returns table (voted boolean, votes_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_weight smallint;
begin
  if not public.wishlist_eligible(p_user_id) then
    raise exception 'WISHLIST_NOT_ELIGIBLE';
  end if;

  select r.status into v_status from public.template_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_status <> 'live' then
    raise exception 'REQUEST_NOT_LIVE';
  end if;

  delete from public.template_request_votes v
   where v.request_id = p_request_id and v.user_id = p_user_id;
  if found then
    voted := false;
  else
    v_weight := case when public.current_tier(p_user_id) = 'max' then 3 else 1 end;
    insert into public.template_request_votes (request_id, user_id, weight)
    values (p_request_id, p_user_id, v_weight);
    voted := true;
  end if;

  select r.votes_count into votes_count from public.template_requests r where r.id = p_request_id;
  return next;
end;
$$;

revoke execute on function public.toggle_template_request_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_template_request_vote(uuid, uuid) to service_role;
