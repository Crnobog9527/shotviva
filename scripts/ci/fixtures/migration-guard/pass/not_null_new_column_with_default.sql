-- expect: none
-- A column this file adds with a default (on add, or set later in the file) may be made not null:
-- the deployed code's inserts get the default.
alter table public.templates add column hero_style text default 'pair';
alter table public.templates alter column hero_style set not null;
alter table public.profiles add column theme text;
alter table public.profiles alter column theme set default 'dark';
update public.profiles set theme = 'dark';
alter table public.profiles alter column theme set not null;
