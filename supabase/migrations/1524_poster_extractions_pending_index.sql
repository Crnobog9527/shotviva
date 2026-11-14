-- Dangling 拍照识别 runs (ARCHITECTURE §5.3「每周复用」): the sweeper and the admin's stuck list
-- read charged rows still pending, oldest first. Only those rows are in the index, so it stays
-- tiny (a run is pending for seconds).
create index poster_extractions_pending_charged on public.poster_extractions (created_at)
  where status = 'pending' and credits > 0;
