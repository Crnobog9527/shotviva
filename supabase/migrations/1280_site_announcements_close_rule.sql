-- The banner's close rule (ARCHITECTURE §10「关闭规则」, Owner 2026-11-12: a closed banner used to
-- stay gone for good). dismissible = false: no ✕, everyone sees it (urgent notices).
-- reshow_after_days: a visitor who closed it sees it again that many days later; null = only when
-- its text, link or style changes. Existing rows take the defaults, so the live banner comes back
-- 7 days after it was closed. Closing is recorded in the browser; nothing here is per visitor.

alter table public.site_announcements
  add column dismissible boolean not null default true,
  add column reshow_after_days smallint default 7
    check (reshow_after_days is null or reshow_after_days between 1 and 365);
