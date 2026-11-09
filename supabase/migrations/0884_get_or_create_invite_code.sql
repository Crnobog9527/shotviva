-- A profile owns at most one invite. The profile lock also covers the first concurrent opens.
create function public.get_or_create_invite_code(p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  entropy bytea;
  candidate text;
begin
  perform 1 from public.profiles where id = p_user for no key update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select code into candidate from public.codes where kind = 'invite' and owner_user_id = p_user;
  if found then return candidate; end if;

  loop
    entropy := uuid_send(gen_random_uuid());
    candidate := '';
    for i in 0..7 loop
      -- Bytes 6 and 8 of a v4 UUID contain version/variant bits. Use the final seven
      -- random bytes plus the first byte to keep the whole eight-character space available.
      candidate := candidate || substr(alphabet, 1 + get_byte(entropy, (i + 9) % 16) % length(alphabet), 1);
    end loop;
    insert into public.codes (code, kind, owner_user_id)
      values (candidate, 'invite', p_user) on conflict (code) do nothing;
    if found then return candidate; end if;
  end loop;
end;
$$;
revoke all on function public.get_or_create_invite_code(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_invite_code(uuid) to service_role;
