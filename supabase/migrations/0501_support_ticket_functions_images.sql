-- T69: the author's ticket writes take images (ARCHITECTURE §10 「可以附图片」). Each call stays one
-- round trip (AGENTS §5.1 rule 1): the ticket or message and its image rows in one transaction.
--
-- The signatures of create_support_ticket and add_ticket_message have to grow, so the old ones
-- are dropped and recreated (AGENTS §5 allows this when the signature must change). Expand-safe:
-- every new parameter has a default, and the app calls them with named arguments, so the code
-- running before this release keeps working against the new functions unchanged.

-- Shared by 0501 and 0502, never called by a client: checks and writes a message's images.
-- p_images is a JSON array of {object_key, content_type, bytes, width, height}, at most 3, each
-- under tickets/<ticket author>/<ticket>/ (the server wrote the files there before the call).
-- Anything else, a malformed entry included, is INVALID_INPUT and the whole write rolls back.
create function public.attach_ticket_images(p_ticket_id uuid, p_owner_id uuid, p_message_id uuid, p_images jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := 'tickets/' || p_owner_id::text || '/' || p_ticket_id::text || '/';
  v_image jsonb;
begin
  if p_images is null or jsonb_typeof(p_images) = 'null' then
    return;
  end if;
  if jsonb_typeof(p_images) <> 'array' then
    raise exception 'INVALID_INPUT' using detail = 'images must be a list';
  end if;
  if jsonb_array_length(p_images) > 3 then
    raise exception 'INVALID_INPUT' using detail = 'at most 3 images per message';
  end if;

  for v_image in select value from jsonb_array_elements(p_images) loop
    if jsonb_typeof(v_image) <> 'object' or left(coalesce(v_image ->> 'object_key', ''), char_length(v_prefix)) <> v_prefix then
      raise exception 'INVALID_INPUT' using detail = 'image is not under this ticket';
    end if;
    begin
      insert into public.support_ticket_attachments (message_id, ticket_id, object_key, content_type, bytes, width, height)
      values (
        p_message_id,
        p_ticket_id,
        v_image ->> 'object_key',
        v_image ->> 'content_type',
        (v_image ->> 'bytes')::integer,
        (v_image ->> 'width')::integer,
        (v_image ->> 'height')::integer
      );
    exception
      when check_violation or not_null_violation or unique_violation
        or invalid_text_representation or numeric_value_out_of_range then
        raise exception 'INVALID_INPUT' using detail = 'image entry is invalid';
    end;
  end loop;
end;
$$;

revoke execute on function public.attach_ticket_images(uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;

-- As in 0221, plus p_ticket_id (the server picks the id so the image keys can name it before the
-- row exists; null = a new random id) and p_images for the first message.
drop function public.create_support_ticket(uuid, text, text, bigint, uuid);

create function public.create_support_ticket(
  p_user_id uuid,
  p_type text,
  p_body text,
  p_payment_id bigint,
  p_job_id uuid,
  p_ticket_id uuid default null,
  p_images jsonb default '[]'::jsonb
)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.support_tickets;
  v_message_id uuid;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if p_type is null or p_type not in ('feedback', 'image_issue', 'billing', 'refund', 'account', 'other') then
    raise exception 'INVALID_INPUT' using detail = 'unknown ticket type';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be 1 to 2000 characters';
  end if;
  if p_type = 'refund' and p_payment_id is null then
    raise exception 'INVALID_INPUT' using detail = 'a refund request needs a payment';
  end if;
  if p_payment_id is not null and p_type not in ('billing', 'refund') then
    raise exception 'INVALID_INPUT' using detail = 'only billing and refund tickets take a payment';
  end if;
  if p_job_id is not null and p_type <> 'image_issue' then
    raise exception 'INVALID_INPUT' using detail = 'only image issues take a work';
  end if;

  -- Someone else's id reads the same as a missing one, so nothing leaks about other accounts.
  if p_payment_id is not null and not exists (
    select 1 from public.payments p where p.id = p_payment_id and p.user_id = p_user_id
  ) then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if p_job_id is not null and not exists (
    select 1 from public.generation_jobs j where j.id = p_job_id and j.user_id = p_user_id
  ) then
    raise exception 'JOB_NOT_FOUND';
  end if;

  if (select count(*) from public.support_tickets t
       where t.user_id = p_user_id and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.support_tickets (id, user_id, type, payment_id, job_id)
  values (coalesce(p_ticket_id, gen_random_uuid()), p_user_id, p_type, p_payment_id, p_job_id)
  returning * into v_ticket;

  insert into public.support_ticket_messages (ticket_id, author, body)
  values (v_ticket.id, 'user', btrim(p_body))
  returning id into v_message_id;

  perform public.attach_ticket_images(v_ticket.id, p_user_id, v_message_id, p_images);
  return v_ticket;
end;
$$;

revoke execute on function public.create_support_ticket(uuid, text, text, bigint, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_support_ticket(uuid, text, text, bigint, uuid, uuid, jsonb) to service_role;

-- As in 0221, plus p_images. The images must sit under this ticket's author, so someone else's
-- ticket fails twice over (TICKET_NOT_FOUND first).
drop function public.add_ticket_message(uuid, uuid, text);

create function public.add_ticket_message(p_ticket_id uuid, p_user_id uuid, p_body text, p_images jsonb default '[]'::jsonb)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.support_ticket_messages;
begin
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be 1 to 2000 characters';
  end if;

  update public.support_tickets
     set status = 'open', closed_at = null, last_message_at = now(), user_seen_at = now()
   where id = p_ticket_id and user_id = p_user_id;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  insert into public.support_ticket_messages (ticket_id, author, body)
  values (p_ticket_id, 'user', btrim(p_body))
  returning * into v_message;

  perform public.attach_ticket_images(p_ticket_id, p_user_id, v_message.id, p_images);
  return v_message;
end;
$$;

revoke execute on function public.add_ticket_message(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_ticket_message(uuid, uuid, text, jsonb) to service_role;
