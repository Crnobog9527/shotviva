-- T83: what every new favorite must pass (ARCHITECTURE §5.1b), on whichever path inserts it:
-- the template is live on the web (published and not partner-only), and the account holds
-- fewer than 200. Security definer so it can lock the profile row: two parallel saves at 199
-- would otherwise both pass the count. A save of a template already saved passes untouched,
-- so the caller's "on conflict do nothing" stays a no-op even at the cap.

create function public.template_favorites_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = new.user_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.template_favorites f
     where f.user_id = new.user_id and f.template_id = new.template_id
  ) then
    return new;
  end if;

  if not exists (
    select 1 from public.templates t
     where t.id = new.template_id and t.is_active and 'web' = any (t.visible_in)
  ) then
    raise exception 'TEMPLATE_NOT_FOUND';
  end if;

  if (select count(*) from public.template_favorites f where f.user_id = new.user_id) >= 200 then
    raise exception 'FAVORITES_LIMIT';
  end if;

  return new;
end;
$$;

revoke execute on function public.template_favorites_guard() from public, anon, authenticated;

create trigger template_favorites_guard
  before insert on public.template_favorites
  for each row execute function public.template_favorites_guard();
