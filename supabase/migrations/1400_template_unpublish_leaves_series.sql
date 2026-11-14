-- 系列成员下架即移出系列 (Owner 2026-11-13). A template that goes from 上架 to 下架 leaves its series in
-- the same update, whichever path unpublishes it: the admin switch, 批量下架, the T93 sync's state
-- step on production, or anything later. Only the transition counts: a draft that was never
-- published can still be added to a series before both go live, as series are built today.
-- Existing unpublished members are not touched here (a bulk update would be a destructive
-- migration); they are removed through 系列管理 on the test site and the series sync.
-- Expand-only: one trigger function and one trigger; no column or existing function changes.
-- The series row lock is not taken here: callers that rewrite membership (series save, sync)
-- already lock the template rows, so this update waits for them or they for it, in row order.

create function admin.template_leaves_series_on_unpublish() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.is_active and not new.is_active and new.series_id is not null then
    new.series_id := null;
    new.series_sort_order := 0;
  end if;
  return new;
end $$;
revoke all on function admin.template_leaves_series_on_unpublish() from public, anon, authenticated, service_role;

create trigger template_leaves_series_on_unpublish
  before update of is_active on public.templates
  for each row execute function admin.template_leaves_series_on_unpublish();
