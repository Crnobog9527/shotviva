-- 拍照识别 is charged (ARCHITECTURE §5.3「每周复用」, Owner 2026-11-14): each poster_extractions row
-- records what the run took and from which pool, so a failed run is refunded exactly. Paste rows
-- (and every older row) took nothing: 0 and no pool.
alter table public.poster_extractions
  add column credits integer not null default 0 check (credits >= 0),
  add column credit_pool text check (credit_pool in ('free', 'paid')),
  add constraint poster_extractions_charged_pool check ((credits = 0) = (credit_pool is null));
