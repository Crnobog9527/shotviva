#!/bin/sh
# Before/after benchmark of the catalogue reads on the local Supabase stack.
# Usage: [ROOT=<checkout with the new migrations>] loadtest/db/compare.sh <first-new-migration-prefix> "<scale>:<jobs>" ...
#   e.g. loadtest/db/compare.sh 1250 1:32 1:10000 10:3000
# For each data shape: reset without the new migrations, seed, measure; apply them, measure.
# Destroys the local database. Never point it at anything but `supabase start`.
set -e
here=$(cd "$(dirname "$0")" && pwd); root=${ROOT:-$(cd "$here/../.." && pwd)}
first=$1; shift
c=supabase_db_shotviva
stash=$(mktemp -d)
psql_() { docker exec -i "$c" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
run() {
  label=$1
  psql_ -c "analyze public.generation_jobs" >/dev/null
  echo "-- $label"
  "$here/bench.sh" "$c" 1 10 q1.sql q2.sql q4.sql q5.sql mix.sql
  "$here/bench.sh" "$c" 10 15 mix.sql
  "$here/bench.sh" "$c" 50 15 mix.sql
}
for shape in "$@"; do
  scale=${shape%%:*}; jobs=${shape##*:}
  echo "== scale=$scale jobs=$jobs"
  for f in "$root"/supabase/migrations/*.sql; do
    n=$(basename "$f" | cut -c1-4); [ "$n" -ge "$first" ] && mv "$f" "$stash/"
  done
  (cd "$root" && supabase db reset >/dev/null 2>&1)
  psql_ -v scale="$scale" -v jobs="$jobs" -v users=50 < "$here/../seed/catalogue.sql" >/dev/null 2>&1
  run before
  mv "$stash"/*.sql "$root/supabase/migrations/"
  (cd "$root" && supabase migration up --local >/dev/null 2>&1)
  run after
done
rmdir "$stash"
