-- T69: the Owner's reply can carry images too (ARCHITECTURE §10 「可以附图片」). As in 0222, plus
-- p_images; the files sit under the ticket author's prefix (tickets/<author>/<ticket>/), so
-- deleting the author's account deletes them with everything else of theirs. Images need a
-- message: a bare close carries none.
--
-- The signature has to grow, so the old one is dropped and recreated (AGENTS §5); p_images has a
-- default and the app calls by name, so the code running before this release is unaffected.

drop function public.admin_reply_ticket(uuid, text, boolean);

create function public.admin_reply_ticket(p_ticket_id uuid, p_body text, p_close boolean, p_images jsonb default '[]'::jsonb)
returns public.support_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_ticket public.support_tickets;
  v_message_id uuid;
begin
  if v_body is null and not coalesce(p_close, false) then
    raise exception 'INVALID_INPUT' using detail = 'a reply needs a message';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'INVALID_INPUT' using detail = 'body must be at most 2000 characters';
  end if;
  if v_body is null and coalesce(jsonb_array_length(case when jsonb_typeof(p_images) = 'array' then p_images end), 0) > 0 then
    raise exception 'INVALID_INPUT' using detail = 'images need a message';
  end if;

  update public.support_tickets
     set status = case when p_close then 'closed' else 'replied' end,
         closed_at = case when p_close then coalesce(closed_at, now()) end,
         last_message_at = case when v_body is null then last_message_at else now() end
   where id = p_ticket_id
  returning * into v_ticket;
  if not found then
    raise exception 'TICKET_NOT_FOUND';
  end if;

  if v_body is not null then
    insert into public.support_ticket_messages (ticket_id, author, body) values (p_ticket_id, 'admin', v_body)
    returning id into v_message_id;
    perform public.attach_ticket_images(p_ticket_id, v_ticket.user_id, v_message_id, p_images);
  end if;
  return v_ticket;
end;
$$;

revoke execute on function public.admin_reply_ticket(uuid, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.admin_reply_ticket(uuid, text, boolean, jsonb) to service_role;
