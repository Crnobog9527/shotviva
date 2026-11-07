-- expect: none
-- Function bodies are runtime code: deletes, updates and drops in them run when called, not now.
create or replace function public.remove_favorite(p_user uuid, p_template text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.favorites where user_id = p_user and template_id = p_template;
  update public.templates set favorite_count = favorite_count - 1 where id = p_template;
  truncate public.scratch;
end;
$$;

create function public.purge_sql(p_user uuid) returns void language sql as $fn$
  delete from public.favorites where user_id = p_user;
  update public.profiles set credits = 0;
$fn$;

create function public.atomic_body(p_id uuid) returns void language sql
begin atomic
  delete from public.favorites where user_id = p_id;
  update public.profiles set credits = 0;
end;

create trigger favorites_count after insert or update or delete on public.favorites
  for each row execute function public.bump_favorite_count();
revoke all on function public.remove_favorite(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_favorite(uuid, text) to service_role;
