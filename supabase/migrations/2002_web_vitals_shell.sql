-- 2002: whether Create's app shell answered the page a web-vitals row was measured on
-- (ARCHITECTURE §18.3). With the shell, Create's LCP is the shell's paint from the phone, not the
-- server's page: kept apart so the p75s can be read both ways. A yes/no, nothing about anyone.
-- Expand-only: one column, not null with a default, so the code running before the deploy keeps
-- inserting rows without it (false). The check on the report matches
-- src/core/analytics/vitals/schema.ts.
alter table public.web_vitals add column shell boolean not null default false;
