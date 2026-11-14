-- A ticket the Owner has closed no longer takes the author's messages (Owner 2026-11-11): until
-- now add_ticket_message reopened it. A reply to a closed ticket now raises TICKET_CLOSED and
-- writes nothing (no message, no images, the ticket stays closed); open and replied tickets
-- take messages as before. Same signature as 0501, so `create or replace`; code already
-- deployed calls it unchanged and shows its generic "couldn't send" for the new error.
-- The Owner's side (admin_reply_ticket, 0502) is untouched.
create or replace function public.add_ticket_message(p_ticket_id uuid, p_user_id uuid, p_body text, p_images jsonb default '[]'::jsonb)
returns public.support_ticket_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_message public.support_ticket_messages;
begin
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be 1 to 2000 characters';
  end if;

  -- Locked, so an Owner closing the ticket at the same moment is seen either before or after.
  select status into v_status
    from public.support_tickets
   where id = p_ticket_id and user_id = p_user_id
     for update;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;
  if v_status = 'closed' then
    raise exception 'TICKET_CLOSED';
  end if;

  update public.support_tickets
     set status = 'open', last_message_at = now(), user_seen_at = now()
   where id = p_ticket_id;

  insert into public.support_ticket_messages (ticket_id, author, body)
  values (p_ticket_id, 'user', btrim(p_body))
  returning * into v_message;

  perform public.attach_ticket_images(p_ticket_id, p_user_id, v_message.id, p_images);
  return v_message;
end;
$$;

revoke execute on function public.add_ticket_message(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_ticket_message(uuid, uuid, text, jsonb) to service_role;
