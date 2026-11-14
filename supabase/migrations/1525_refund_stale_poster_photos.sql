-- Dangling 拍照识别 runs (ARCHITECTURE §5.3「每周复用」): a run whose server process died stays
-- pending with its credit taken. The cron sweeper (every 5 minutes) and the admin's 「全部退回」
-- refund every charged run pending for longer than p_older_than (at least 10 minutes: a function
-- lives at most 5), oldest first, at most p_limit, each through refund_poster_photo (once, to its
-- own pool). A run that settled meanwhile is skipped, never an error for the batch.
create or replace function public.refund_stale_poster_photos(p_older_than interval, p_limit integer)
returns table (refunded integer, skipped integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_refunded integer := 0;
  v_skipped integer := 0;
begin
  if p_older_than is null or p_older_than < interval '10 minutes' then
    raise exception 'INVALID_INPUT' using detail = 'only runs pending for at least 10 minutes are refunded';
  end if;
  for v_id in
    select e.id from public.poster_extractions e
     where e.status = 'pending' and e.credits > 0 and e.created_at < now() - p_older_than
     order by e.created_at
     limit least(greatest(coalesce(p_limit, 1), 1), 500)
  loop
    begin
      perform public.refund_poster_photo(v_id, null, null, null, null);
      v_refunded := v_refunded + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return query select v_refunded, v_skipped;
end;
$$;

revoke all on function public.refund_stale_poster_photos(interval, integer) from public, anon, authenticated;
grant execute on function public.refund_stale_poster_photos(interval, integer) to service_role;
