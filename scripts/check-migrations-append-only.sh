#!/usr/bin/env bash
# Merged migrations are append-only (AGENTS §5): fails when a branch modifies, renames or
# deletes a supabase/migrations/*.sql file that already exists on the base branch. Adding new
# files is always fine. A baseline squash, which the Owner must approve, is let through by
# putting `[baseline]` in the PR title (passed in as PR_TITLE).
#
#   scripts/check-migrations-append-only.sh                    # HEAD against origin/main
#   scripts/check-migrations-append-only.sh origin/main <sha>  # what CI runs
#
# Only the branch's own changes count (diff from the merge base), so a branch that is merely
# behind main is not blamed for migrations main gained since. Each path the branch touched
# that exists on the base must still be byte-identical there and on the branch.
set -euo pipefail

cd "$(dirname "$0")/.."

base=${1:-origin/main}
head=${2:-HEAD}
dir=supabase/migrations

merge_base=$(git merge-base "$base" "$head")

violations=()
while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in "$dir"/*.sql) ;; *) continue ;; esac
  base_blob=$(git rev-parse --verify --quiet "$base:$path" || true)
  [ -n "$base_blob" ] || continue # not on the base branch: a new migration
  head_blob=$(git rev-parse --verify --quiet "$head:$path" || true)
  if [ -z "$head_blob" ]; then
    violations+=("deleted or renamed: $path")
  elif [ "$head_blob" != "$base_blob" ]; then
    violations+=("modified: $path")
  fi
done < <(git diff --name-only --no-renames "$merge_base" "$head" -- "$dir")

if [ ${#violations[@]} -eq 0 ]; then
  echo "Migrations are append-only: no file on $base was modified or deleted."
  exit 0
fi

if [[ "${PR_TITLE:-}" == *"[baseline]"* ]]; then
  echo "::warning::PR title contains [baseline]; allowing changes to merged migrations:"
  printf '  %s\n' "${violations[@]}"
  exit 0
fi

echo "::error::Merged migrations are append-only (AGENTS §5). Write a new migration instead of changing these:"
for violation in "${violations[@]}"; do
  echo "::error file=${violation#*: }::${violation}"
done
echo "A baseline squash approved by the Owner goes through with [baseline] in the PR title."
exit 1
