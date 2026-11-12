#!/bin/sh
# Runs each k6 scenario on its own ramp, sampling the database alongside.
#   loadtest/run/suite.sh <label> [scenarios...]     (default: marketing create photos generate)
# Each concurrency level in LEVELS (default 10 50 100 300) is its own short run, so every level
# gets its own p50/p95. Results: loadtest/results/<label>-<scenario>-<level>.{json,txt,csv}
set -e
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
label=$1; shift; [ $# -gt 0 ] || set -- marketing create photos generate
out="$root/loadtest/results"; mkdir -p "$out"
export SUPABASE_ANON_KEY=$(cd "$root" && supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')
for sc in "$@"; do
  for level in ${LEVELS:-10 50 100 300}; do
    name="$label-$sc-$level"
    "$here/monitor.sh" > "$out/$name.csv" & mon=$!
    k6 run -e SCENARIO="$sc" -e LEVELS="$level" -e USERS="${USERS:-300}" -e HOLD="${HOLD:-40s}" -e STEP="${STEP:-10s}" \
      --summary-export "$out/$name.json" "$root/loadtest/k6/shotviva.js" > "$out/$name.txt" 2>&1 || true
    kill $mon 2>/dev/null || true
    sleep 15
  done
done
