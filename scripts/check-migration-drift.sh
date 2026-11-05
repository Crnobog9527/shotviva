#!/usr/bin/env bash
# Fails unless a database has applied exactly the migrations in supabase/migrations
# (AGENTS §5 drift check). Extra arguments go to `supabase migration list`, e.g.
#
#   scripts/check-migration-drift.sh --linked     # the linked remote project (CI)
#   scripts/check-migration-drift.sh --local      # the local stack
#
# The CLI prints one row per version with a Local and a Remote column; a version missing on
# either side leaves that cell empty. The CLI has no machine-readable output for this
# command, so the table is parsed, and the parsed Local column is checked against the files
# on disk to catch a format change silently passing.
set -euo pipefail

cd "$(dirname "$0")/.."

listing=$(supabase migration list "$@")
printf '%s\n' "$listing"

rows=$(printf '%s\n' "$listing" | awk -F'|' '
  NF >= 3 && $1 !~ /Local/ && $1 !~ /^[ \t]*-+[ \t]*$/ {
    local_v = $1; remote_v = $2
    gsub(/[ \t]/, "", local_v); gsub(/[ \t]/, "", remote_v)
    print local_v "," remote_v
  }')

files=$(find supabase/migrations -maxdepth 1 -name '*.sql' -exec basename {} \; | sed -E 's/_.*//' | sort)

if [ -z "$rows" ]; then
  echo "::error::Could not read any migration rows from \`supabase migration list\`."
  exit 1
fi

status=0
while IFS=, read -r local_v remote_v; do
  if [ -z "$local_v" ]; then
    echo "::error::Applied on the database but not in the repo: $remote_v"
    status=1
  elif [ -z "$remote_v" ]; then
    echo "::error::In the repo but not applied on the database: $local_v"
    status=1
  elif [ "$local_v" != "$remote_v" ]; then
    echo "::error::Version mismatch: repo $local_v, database $remote_v"
    status=1
  fi
done <<< "$rows"

listed=$(printf '%s\n' "$rows" | cut -d, -f1 | sed '/^$/d' | sort)
if [ "$listed" != "$files" ]; then
  echo "::error::Parsed Local column does not match supabase/migrations; the CLI output format may have changed."
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "No drift: $(printf '%s\n' "$files" | wc -l | tr -d ' ') migrations, all applied."
fi
exit "$status"
