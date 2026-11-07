-- expect: delete, drop-column
-- A do block runs during the migration, so what it does counts.
do $$
begin
  delete from public.sms_sends where created_at < now() - interval '30 days';
  if exists (select 1 from information_schema.columns where column_name = 'legacy') then
    alter table public.profiles drop column legacy;
  end if;
end
$$;
