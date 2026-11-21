-- The site-wide hard caps on what an org's usage settings may lift a member to (ARCHITECTURE
-- §6.5). Card E0 sets the real values after load testing; until then the caps are today's Max
-- limits, so an org can lift a member to Max and no further. Only a migration changes this key
-- (admin_set_system_setting does not accept it).
insert into public.system_settings (key, value)
values ('org_limit_caps', '{"concurrency":6,"per_window":80,"batch_max":30,"multi_template_max":5}'::jsonb)
on conflict (key) do nothing;
