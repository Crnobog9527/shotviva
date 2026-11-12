-- The banner's close rule (ARCHITECTURE §10「关闭规则」, Owner 2026-11-12: a closed banner used to
-- stay gone for good). dismissible = false: no ✕, everyone sees it (urgent notices).
-- reshow_after_days: a visitor who closed it sees it again that many days later; null = only when
-- its text, link or style changes. Existing rows take the defaults, so the live banner comes back
-- 7 days after it was closed. Closing is recorded in the browser; nothing here is per visitor.

alter table public.site_announcements
  add column dismissible boolean not null default true,
  add column reshow_after_days smallint default 7
    check (reshow_after_days is null or reshow_after_days between 1 and 365);

-- The link check also refuses a backslash anywhere (总控 review of #525): browsers read
-- "/\evil.example" as "//evil.example", so the old path rule let an off-site link through, and
-- "https://a\@b" moves the host. Same name, re-added in one statement: it validates every
-- existing row, so the migration stops here rather than keep a row that breaks the rule. Code
-- deployed before #525 still accepts such a link in its own check; the database now refuses it,
-- and no real link needs a backslash.
alter table public.site_announcements
  drop constraint site_announcements_link_url_check,
  add constraint site_announcements_link_url_check check (
    link_url is null
    or (char_length(link_url) <= 500
        and strpos(link_url, chr(92)) = 0
        and (link_url ~ '^/([^/\s]\S*)?$' or link_url ~ '^https://[^\s/?#@]+([/?#]\S*)?$'))
  );
