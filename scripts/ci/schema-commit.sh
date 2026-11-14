#!/usr/bin/env bash
# The `schema-sql` job in ci.yml (T88): commits the schema.sql that scripts/ci/schema-check.sh
# prepared to the PR branch, then gives the new commit this run's results.
#
# Run in a trusted checkout of main, with full history including the tested OLD_HEAD, with
#   FIX_FILE      the prepared schema.sql
#   TREE          the tree schema-check.sh verified (branch + file merges into the tested tree)
#   HEAD_REF      the PR branch;  OLD_HEAD  the commit that was tested
#   PR_TITLE      for the migration guards' [baseline] / [contract] escapes
#   CHECKS_RESULT, DB_RESULT  the results of the two required jobs in this run
#   REPO, RUN_URL, GH_TOKEN (contents: write, checks: write)
#
# Pushing with GITHUB_TOKEN starts no new workflow run, so nothing loops and nothing reruns:
# the new commit differs from the tested one only in schema.sql, and its merge with main is the
# tree this run tested, so this run's two required results are posted on it as check runs of
# the same names. The migration guards run here first against the new commit; if either fails,
# nothing is committed and the branch keeps its failing guard checks.
set -euo pipefail

FILE=supabase/schema.sql
MARKER='chore(db): regenerate schema.sql [auto]'

# Read the PR tree into the index only: PR scripts, package config, symlinks and attributes
# never enter the working directory that runs the guards with the write token.
git read-tree "$OLD_HEAD"
blob=$(git hash-object -w --stdin < "$FIX_FILE")
git update-index --cacheinfo "100644,$blob,$FILE"
[ "$(git diff --cached --name-only "$OLD_HEAD")" = "$FILE" ] || { echo "::error::Expected a change to $FILE only"; exit 1; }
[ "$(git write-tree)" = "$TREE" ] || { echo "::error::The tree is not the one verified in the db job"; exit 1; }
new_head=$(git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit-tree "$TREE" -p "$OLD_HEAD" -m "$MARKER" -m "Regenerated from supabase/migrations by CI run $RUN_URL (T88).")

# HEAD is trusted main. Both guards inspect the candidate commit as data.
merge_base=$(git merge-base HEAD "$new_head")
migrations=false
if ! git diff --quiet "$merge_base" "$new_head" -- supabase/migrations; then
  migrations=true
  guard_failed() {
    echo "::error::A migration guard fails on this branch, so schema.sql is not committed. Fix what it reports first."
    exit 1
  }
  scripts/check-migrations-append-only.sh HEAD "$new_head" || guard_failed
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-migrations-destructive.ts HEAD "$new_head" || guard_failed
fi

auth="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"
# Not forced: if the branch moved since the run started, its own run has the last word.
if ! git -c "http.https://github.com/.extraheader=$auth" push --quiet origin "$new_head:refs/heads/$HEAD_REF"; then
  echo "::warning::$HEAD_REF moved since this run started; not committing schema.sql (the newer push has its own run)."
  exit 0
fi
echo "::notice::Committed the regenerated schema.sql to $HEAD_REF as $new_head."

conclusion() {
  case "$1" in success | failure | cancelled | skipped) echo "$1" ;; *) echo failure ;; esac
}
post() { # <name> <conclusion> <summary>
  gh api "repos/$REPO/check-runs" --silent \
    -f name="$1" -f head_sha="$new_head" -f status=completed -f conclusion="$2" -f details_url="$RUN_URL" \
    -f "output[title]=$1: $2 (from CI on ${OLD_HEAD:0:7})" -f "output[summary]=$3"
}
carried="Carried over from $RUN_URL, which tested ${OLD_HEAD} merged with main. This commit only adds the regenerated supabase/schema.sql, and its merge with main is exactly the tree that run tested, so the result holds here (T88)."
post 'lint · typecheck · test · build' "$(conclusion "$CHECKS_RESULT")" "$carried"
post 'supabase db tests' "$(conclusion "$DB_RESULT")" "$carried"
if [ "$migrations" = true ]; then
  ran="Ran in $RUN_URL against this commit before it was pushed (T88)."
  post 'merged migrations unchanged' success "$ran"
  post 'new migrations keep the deployed code working' success "$ran"
fi
