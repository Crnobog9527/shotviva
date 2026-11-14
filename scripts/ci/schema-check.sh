#!/usr/bin/env bash
# "supabase db tests", after `pnpm db:schema` regenerated supabase/schema.sql from the migrations
# on the PR's merge commit (T88). When the committed file is current, says so. When it is stale:
#
#   - on a pull request from a branch of this repo, prepares the fix instead of failing: works
#     out the branch's own schema.sql (its file plus exactly the change the regeneration made),
#     checks that the branch with that file merges with main into the very tree this job is
#     about to test, writes the file to $FIX_DIR and sets the step outputs `fix=true`
#     and `tree`. The job then runs the tests, and the `schema-sql` job in ci.yml commits the file
#     to the branch afterwards;
#   - otherwise (a fork, a push to main, a branch whose head commit is already the automatic
#     commit, or a fix that does not merge cleanly) fails with the diff, as before.
#
# Needs: the merge-commit checkout actions/checkout makes for pull_request (fetch-depth 2), and
# EVENT, SAME_REPO, REPO, GH_TOKEN, FIX_DIR in the environment.
set -euo pipefail

FILE=supabase/schema.sql
MARKER='chore(db): regenerate schema.sql [auto]'

if [ -z "$(git status --porcelain -- "$FILE")" ]; then
  echo "schema.sql matches the migrations."
  exit 0
fi

git --no-pager diff -- "$FILE"

fail() {
  echo "::error file=$FILE::schema.sql is out of date with supabase/migrations. $1"
  exit 1
}
manual='Run `supabase db reset && pnpm db:schema` and commit the result.'

[ "${EVENT:-}" = pull_request ] || fail "$manual"
[ "${SAME_REPO:-}" = true ] || fail "Pull requests from forks are not fixed automatically. $manual"
[ "$(git rev-list --parents -n1 HEAD | wc -w)" -eq 3 ] || fail "Not a merge-commit checkout. $manual"

base=$(git rev-parse HEAD^1)
head=$(git rev-parse HEAD^2)
# Never a second automatic commit on top of the first: a stale file after it means something
# else is wrong (e.g. a migration that is not deterministic), and a person has to look.
[ "$(git log -1 --format=%s "$head")" != "$MARKER" ] || fail "The branch head is already the automatic schema.sql commit and the file is still stale. $manual"

work=$(mktemp -d)
git show "$head:$FILE" > "$work/head.sql" 2> /dev/null || fail "The branch has no $FILE. $manual"
git show "HEAD:$FILE" > "$work/merged.sql"
# The branch's file plus the regeneration's change (regenerated - committed, on the merge commit).
git merge-file -p "$work/head.sql" "$work/merged.sql" "$FILE" > "$work/fixed.sql" \
  || fail "The regenerated file does not apply to the branch's copy without conflicts. $manual"

# Tree of the branch with the fixed file, and of the merge commit with the regenerated file.
with_file() { # <tree-ish> <file>: prints the tree id with $FILE replaced by <file>
  local index blob
  index=$(mktemp)
  blob=$(git hash-object -w "$2")
  GIT_INDEX_FILE=$index git read-tree "$1"
  GIT_INDEX_FILE=$index git update-index --cacheinfo "100644,$blob,$FILE"
  GIT_INDEX_FILE=$index git write-tree
  rm -f "$index"
}
fixed_tree=$(with_file "$head" "$work/fixed.sql")
tested_tree=$(with_file HEAD "$FILE")

# The merge base, which the depth-2 checkout does not have.
merge_base=$(gh api "repos/$REPO/compare/$base...$head" --jq .merge_base_commit.sha)
git fetch --quiet --no-tags --depth=1 origin "$merge_base"
fixed_commit=$(GIT_AUTHOR_NAME=ci GIT_AUTHOR_EMAIL=ci@localhost GIT_COMMITTER_NAME=ci GIT_COMMITTER_EMAIL=ci@localhost \
  git commit-tree "$fixed_tree" -p "$head" -m "$MARKER")
merged_tree=$(git merge-tree --write-tree --merge-base="$merge_base" "$base" "$fixed_commit") \
  || fail "The branch with the regenerated file does not merge cleanly with main. $manual"
# Only if they are equal do this job's results hold for the commit the next job will push.
[ "$merged_tree" = "$tested_tree" ] || fail "The branch with the regenerated file would not merge into the tree tested here. $manual"

mkdir -p "$FIX_DIR"
cp "$work/fixed.sql" "$FIX_DIR/schema.sql"
{
  echo "fix=true"
  echo "tree=$fixed_tree"
} >> "$GITHUB_OUTPUT"
echo "::warning file=$FILE::schema.sql was out of date with supabase/migrations. Testing with the regenerated file; the \"commit regenerated schema.sql\" job commits it to the branch when this run's checks finish."
