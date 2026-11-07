#!/usr/bin/env bash
# Catches a branch that silently undoes recent work on main. #212 was committed from a stale
# working tree: its own commit put 33 files back to how they were before #209, #210 and #211,
# deleting the purchase celebration together with its tests, so every other check stayed green.
#
# Fails when a file the branch changed (and kept) is now byte-identical to how it was just before
# a recent commit on the base branch changed it: the branch has undone that commit for that file.
# Deletions alone are not judged (moving or retiring a recent file is ordinary); a stale tree
# always shows up in the files it kept as well. Recent = the last WINDOW first-parent
# commits up to the merge base. A deliberate revert goes through with `[revert]` in the PR title
# (passed in as PR_TITLE).
#
#   scripts/check-stale-revert.sh                    # HEAD against origin/main
#   scripts/check-stale-revert.sh origin/main <sha>  # what CI runs
#
# Only the branch's own changes count (diff from the merge base), so a branch that is merely
# behind main is not blamed for what main gained since.
set -euo pipefail

cd "$(dirname "$0")/.."

base=${1:-origin/main}
head=${2:-HEAD}
window=${WINDOW:-100}

merge_base=$(git merge-base "$base" "$head")
# Lower bound of the window; with a shorter history, all of it.
oldest=$(git rev-parse --verify --quiet "$merge_base~$window" || true)
range=${oldest:+$oldest..}$merge_base

blob() { git rev-parse --verify --quiet "$1:$2" || echo absent; }

violations=()
while IFS= read -r path; do
  [ -n "$path" ] || continue
  head_blob=$(blob "$head" "$path")
  [ "$head_blob" != absent ] || continue
  base_blob=$(blob "$merge_base" "$path")
  while IFS= read -r commit; do
    [ -n "$commit" ] || continue
    before=$(blob "$commit^" "$path")
    if [ "$before" = "$head_blob" ] && [ "$before" != "$base_blob" ]; then
      violations+=("$path|$(git log -1 --format='%h %s' "$commit")")
      break
    fi
  done < <(git -c core.quotepath=off log --first-parent --format=%H "$range" -- "$path")
done < <(git -c core.quotepath=off diff --name-only --no-renames "$merge_base" "$head")

if [ ${#violations[@]} -eq 0 ]; then
  echo "No silent reverts: no changed file is back to a state that recent work on $base replaced."
  exit 0
fi

if [[ "${PR_TITLE:-}" == *"[revert]"* ]]; then
  echo "::warning::PR title contains [revert]; allowing these files to go back to an earlier state:"
  for violation in "${violations[@]}"; do echo "  ${violation%%|*}  (undoes ${violation#*|})"; done
  exit 0
fi

echo "::error::This branch puts files back to how they were before recent commits on $base, undoing them."
for violation in "${violations[@]}"; do
  echo "::error file=${violation%%|*}::${violation%%|*} is back to its state before ${violation#*|}"
done
echo "Usually the branch was committed from a stale working tree: rebuild it on current $base and"
echo "commit only your own changes. A deliberate revert goes through with [revert] in the PR title."
exit 1
