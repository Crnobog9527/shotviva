#!/bin/sh
# Samples the local database every 5 s while a test runs: connections by state, the longest
# running query, and CPU of the db and PostgREST containers. Ctrl-C to stop.
#   loadtest/run/monitor.sh > loadtest/results/monitor-<run>.csv
c=${DB_CONTAINER:-supabase_db_shotviva}; rest=${REST_CONTAINER:-supabase_rest_shotviva}
echo "time,active,idle,idle_in_tx,waiting,longest_ms,db_cpu,rest_cpu,app_rss_mb"
while :; do
  row=$(docker exec "$c" psql -U postgres -d postgres -X -At -F, -c "select
    count(*) filter (where state='active'), count(*) filter (where state='idle'),
    count(*) filter (where state like 'idle in transaction%'), count(*) filter (where wait_event_type='Lock'),
    coalesce(round(extract(epoch from max(now()-query_start) filter (where state='active'))*1000),0)
    from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()")
  cpu=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' "$c" "$rest" | awk '{gsub("%","",$2); printf "%s,", $2}')
  rss=$(ps -o rss= -p "$(pgrep -f loadtest/run/serve.mjs | head -1)" 2>/dev/null | awk '{printf "%d", $1/1024}')
  echo "$(date +%H:%M:%S),$row,${cpu%,},${rss:-0}"
  sleep 5
done
