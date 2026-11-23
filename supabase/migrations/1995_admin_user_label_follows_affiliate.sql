-- Follow-up to 1994: an account tagged on /admin/users before it became an affiliate kept its tag
-- in admin_user_labels, so the affiliate admin (which reads affiliates.admin_label) showed none.
-- From now on a new affiliate row picks the tag up when it has no label of its own, and the old
-- row is removed, so the tag lives in one place. Expand-only: a new trigger, no data rewritten
-- (the users list already shows an affiliate's own label first, then this table's).

create function public._affiliate_adopt_user_label() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.admin_label is null then
    select l.label into new.admin_label from public.admin_user_labels l where l.user_id=new.user_id;
  end if;
  delete from public.admin_user_labels where user_id=new.user_id;
  return new;
end;
$$;
revoke all on function public._affiliate_adopt_user_label() from public, anon, authenticated, service_role;

create trigger affiliates_adopt_user_label before insert on public.affiliates
  for each row execute function public._affiliate_adopt_user_label();

