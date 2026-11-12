#!/bin/sh
# Usage: loadtest/db/bench.sh <container> <clients> <seconds> [scripts...]
# Runs pgbench inside the local Supabase db container against the catalogue read scripts.
set -e
c=$1; clients=$2; secs=$3; shift 3
for f in "$@"; do
  docker cp "$(dirname "$0")/$f" "$c:/tmp/$f" >/dev/null
  printf '%s c=%s: ' "$f" "$clients"
  docker exec "$c" pgbench -n -U postgres -h 127.0.0.1 -p 5432 -c "$clients" -j 4 -T "$secs" -f "/tmp/$f" postgres 2>/dev/null \
    | awk '/latency average/{l=$4} /tps =/{t=$3} /failed/{f=$4} END{printf "avg %s ms, %s tps, failed %s\n", l, t, f}'
done
